import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { issueRoomSession } from '@/lib/roomSession';
import { parseDirectVoiceRoomId } from '@/lib/directCalls';
import { readBoundedJson } from '@/lib/http/requestBody';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const authHeader = z.string().regex(/^Bearer\s+[\w.-]{20,8192}$/i).safeParse(request.headers.get('authorization') ?? '');
  const accessToken = authHeader.success ? authHeader.data.replace(/^Bearer\s+/i, '') : '';
  if (!accessToken) {
    return NextResponse.json({ error: 'Entre no Sekai para participar da chamada.' }, { status: 401 });
  }

  const body = await readBoundedJson(request, 4096);
  if (body === null) return NextResponse.json({ error: 'Sala inválida.' }, { status: 400 });
  const roomInput = z.object({ roomId: z.string().min(4).max(80).regex(/^[a-z0-9-]+$/) }).safeParse(body);
  if (!roomInput.success) {
    return NextResponse.json({ error: 'Código da sala inválido.' }, { status: 400 });
  }
  const roomId = roomInput.data.roomId;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'A conexão com o Sekai não está configurada.' }, { status: 503 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return NextResponse.json({ error: 'Sua sessão do Sekai expirou. Entre novamente.' }, { status: 401 });
    }

    const directPair = parseDirectVoiceRoomId(roomId);
    if (directPair) {
      if (!directPair.includes(user.id.toLowerCase())) {
        return NextResponse.json({ error: 'Você não faz parte desta conversa.' }, { status: 403 });
      }
      const peerId = directPair.find((id) => id !== user.id.toLowerCase());
      if (!peerId) return NextResponse.json({ error: 'Conversa privada inválida.' }, { status: 400 });

      const [forwardFriendship, reverseFriendship] = await Promise.all([
        supabase.from('friendships').select('id').eq('status', 'accepted').eq('sender_id', user.id).eq('receiver_id', peerId).maybeSingle(),
        supabase.from('friendships').select('id').eq('status', 'accepted').eq('sender_id', peerId).eq('receiver_id', user.id).maybeSingle(),
      ]);
      const isFriend = !!forwardFriendship.data || !!reverseFriendship.data;
      let sharesServer = false;
      if (!isFriend) {
        const { data: ownMemberships } = await supabase.from('members').select('server_id').eq('user_id', user.id);
        const serverIds = Array.from(new Set((ownMemberships ?? []).map((row) => row.server_id).filter(Boolean)));
        if (serverIds.length) {
          const { data: sharedMemberships } = await supabase.from('members').select('server_id').eq('user_id', peerId).in('server_id', serverIds);
          sharesServer = !!sharedMemberships?.length;
        }
      }
      if (!isFriend && !sharesServer) {
        return NextResponse.json({ error: 'A chamada privada exige amizade aceita ou um servidor em comum.' }, { status: 403 });
      }
    } else {
      // RLS confirma que a pessoa pertence ao servidor que contém este canal.
      const { data: channel } = await supabase
        .from('channels')
        .select('id, type, server_id')
        .eq('id', roomId)
        .eq('type', 'voice')
        .maybeSingle();
      if (!channel) {
        return NextResponse.json({ error: 'Canal de voz não encontrado ou sem acesso.' }, { status: 403 });
      }
      const { data: membership, error: membershipError } = await supabase.from('members')
        .select('is_banned, communication_disabled_until')
        .eq('server_id', channel.server_id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (membershipError || !membership || membership.is_banned ||
        (membership.communication_disabled_until && Date.parse(membership.communication_disabled_until) > Date.now())) {
        return NextResponse.json({ error: 'Você não pode entrar nesta chamada enquanto o timeout estiver ativo.' }, { status: 403 });
      }
      const { data: timeout } = await supabase.from('guild_timeouts')
        .select('until_at')
        .eq('server_id', channel.server_id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (timeout?.until_at && Date.parse(timeout.until_at) > Date.now()) {
        return NextResponse.json({ error: 'Você não pode entrar nesta chamada enquanto o timeout estiver ativo.' }, { status: 403 });
      }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, username, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    const displayName = profile?.display_name || profile?.username || 'Usuário';

    const safeDisplayName = displayName.slice(0, 40);
    const avatarUrl = profile?.avatar_url || null;
    return NextResponse.json({
      ...issueRoomSession(roomId, user.id, safeDisplayName, avatarUrl),
      displayName: safeDisplayName,
      avatarUrl,
    });
  } catch {
    return NextResponse.json({ error: 'O servidor não conseguiu autorizar a entrada na sala.' }, { status: 503 });
  }
}
