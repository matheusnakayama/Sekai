import { NextRequest, NextResponse } from 'next/server';
import Pusher from 'pusher';
import { createClient } from '@supabase/supabase-js';
import { parseDirectVoiceRoomId } from '@/lib/directCalls';
import { verifyRoomSession } from '@/lib/roomSession';

export const runtime = 'nodejs';

function getPusherServer() {
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (!appId || !key || !secret || !cluster) {
    return null;
  }

  return new Pusher({ appId, key, secret, cluster, useTLS: true });
}

// O navegador envia application/x-www-form-urlencoded (é assim que o pusher-js chama /api/pusher/auth)
export async function POST(req: NextRequest) {
  const pusher = getPusherServer();
  if (!pusher) {
    return NextResponse.json(
      {
        error:
          'Sinalização não configurada no servidor. Defina PUSHER_APP_ID, PUSHER_SECRET, NEXT_PUBLIC_PUSHER_KEY e NEXT_PUBLIC_PUSHER_CLUSTER.',
      },
      { status: 500 }
    );
  }

  const body = await req.text();
  const params = new URLSearchParams(body);
  const socketId = params.get('socket_id');
  const channelName = params.get('channel_name');
  const userName = params.get('user_name')?.slice(0, 60) || 'Convidado';
  const userAvatar = params.get('user_avatar') || null;
  const userId = params.get('user_id') || '';
  const roomSession = params.get('room_session');
  const accessToken = params.get('access_token') || '';
  const roomId = channelName?.startsWith('presence-room-') ? channelName.slice('presence-room-'.length) : '';

  if (!socketId || !channelName || !/^[a-z0-9-]{4,80}$/.test(roomId) || !userId) {
    return NextResponse.json({ error: 'Parâmetros ausentes.' }, { status: 400 });
  }

  // Só autorizamos canais de presença de sala (presence-room-*)
  if (channelName !== `presence-room-${roomId}`) {
    return NextResponse.json({ error: 'Canal não permitido.' }, { status: 403 });
  }

  if (!verifyRoomSession(roomId, userId, roomSession, userName, userAvatar)) {
    return NextResponse.json({ error: 'Sua sessão da sala expirou. Saia e entre novamente.' }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey || !accessToken) {
    return NextResponse.json({ error: 'Não foi possível validar sua sessão no servidor.' }, { status: 401 });
  }
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user || user.id !== userId) {
    return NextResponse.json({ error: 'Sua sessão do Sekai expirou. Entre novamente.' }, { status: 401 });
  }

  const directPair = parseDirectVoiceRoomId(roomId);
  if (directPair) {
    if (!directPair.includes(user.id.toLowerCase())) {
      return NextResponse.json({ error: 'Você não faz parte desta chamada.' }, { status: 403 });
    }
  } else {
    const { data: room } = await supabase.from('channels')
      .select('id, server_id')
      .eq('id', roomId)
      .eq('type', 'voice')
      .maybeSingle();
    if (!room?.server_id) {
      return NextResponse.json({ error: 'Canal de voz indisponível.' }, { status: 403 });
    }
    const { data: membership, error: membershipError } = await supabase.from('members')
      .select('is_banned, communication_disabled_until')
      .eq('server_id', room.server_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (membershipError || !membership || membership.is_banned ||
      (membership.communication_disabled_until && Date.parse(membership.communication_disabled_until) > Date.now())) {
      return NextResponse.json({ error: 'Você não pode entrar nesta chamada enquanto o timeout estiver ativo.' }, { status: 403 });
    }
    const { data: timeout } = await supabase.from('guild_timeouts')
      .select('until_at')
      .eq('server_id', room.server_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (timeout?.until_at && Date.parse(timeout.until_at) > Date.now()) {
      return NextResponse.json({ error: 'Você não pode entrar nesta chamada enquanto o timeout estiver ativo.' }, { status: 403 });
    }
  }

  const presenceData = {
    user_id: userId,
    user_info: { name: userName, joinedAt: Date.now(), avatarUrl: userAvatar },
  };

  const authResponse = pusher.authorizeChannel(socketId, channelName, presenceData);
  return NextResponse.json(authResponse);
}
