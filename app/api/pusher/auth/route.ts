import { NextRequest, NextResponse } from 'next/server';
import Pusher from 'pusher';
import { createClient } from '@supabase/supabase-js';
import { parseDirectVoiceRoomId } from '@/lib/directCalls';
import { verifyRoomSession } from '@/lib/roomSession';
import { z } from 'zod';
import { readBoundedText } from '@/lib/http/requestBody';

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

  const body = await readBoundedText(req, 16 * 1024);
  if (body === null) return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 });
  const params = new URLSearchParams(body);
  const parsed = z.object({
    socket_id: z.string().regex(/^\d+\.\d+$/).max(80),
    channel_name: z.string().min(1).max(128),
    user_name: z.string().trim().max(60).optional().default('Convidado'),
    user_avatar: z.string().max(2048).optional().nullable().refine((value) => {
      if (value === undefined || value === null || value === '') return true;
      try {
        const avatar = new URL(value);
        return avatar.protocol === 'https:' && !avatar.username && !avatar.password;
      } catch {
        return false;
      }
    }),
    user_id: z.string().uuid(),
    room_session: z.string().min(1).max(2048),
    access_token: z.string().min(20).max(8192),
  }).safeParse(Object.fromEntries(params.entries()));
  if (!parsed.success) return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 });
  const { socket_id: socketId, channel_name: channelName, user_id: userId, room_session: roomSession, access_token: accessToken } = parsed.data;
  const userName = parsed.data.user_name || 'Convidado';
  const userAvatar = parsed.data.user_avatar || null;
  const roomId = channelName.startsWith('presence-room-') ? channelName.slice('presence-room-'.length) : '';

  if (!/^[a-z0-9-]{4,80}$/.test(roomId)) {
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
