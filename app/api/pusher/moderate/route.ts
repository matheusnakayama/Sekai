import { NextResponse } from 'next/server';
import Pusher from 'pusher';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { readBoundedJson } from '@/lib/http/requestBody';

export const runtime = 'nodejs';

type ModerationDispatchAction = 'kick' | 'ban' | 'timeout' | 'disconnect';

function getPusherServer() {
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!appId || !key || !secret || !cluster) return null;
  return new Pusher({ appId, key, secret, cluster, useTLS: true });
}

export async function POST(request: Request) {
  const authHeader = z.string().regex(/^Bearer\s+[\w.-]{20,8192}$/i).safeParse(request.headers.get('authorization') ?? '');
  const accessToken = authHeader.success ? authHeader.data.replace(/^Bearer\s+/i, '') : '';
  if (!accessToken) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const pusher = getPusherServer();
  if (!supabaseUrl || !supabaseKey || !pusher) {
    return NextResponse.json({ error: 'A desconexão de chamadas não está configurada.' }, { status: 503 });
  }

  const body = await readBoundedJson(request, 4096);
  const parsed = z.object({ serverId: z.string().uuid(), targetId: z.string().uuid(), action: z.enum(['kick', 'ban', 'timeout', 'disconnect']) }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Servidor, membro ou ação inválidos.' }, { status: 400 });
  }
  const { serverId, targetId, action } = parsed.data;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
  if (user.id === targetId) return NextResponse.json({ error: 'Não é possível desconectar a própria conta por este menu.' }, { status: 400 });

  const requiredPermissions: Record<ModerationDispatchAction, string[]> = {
    kick: ['kick_members'],
    ban: ['ban_members'],
    timeout: ['moderate_members', 'mute_members'],
    disconnect: ['move_members'],
  };
  const permissionResults = await Promise.all(requiredPermissions[action].map((permission) =>
    supabase.rpc('has_permission', { p_server_id: serverId, p_permission: permission })
  ));
  if (!permissionResults.some((result) => !result.error && result.data === true)) {
    return NextResponse.json({ error: 'Você não tem permissão para esta ação.' }, { status: 403 });
  }

  if (action === 'disconnect') {
    const { error: authorizationError } = await supabase.rpc('authorize_server_voice_disconnect', {
      p_server_id: serverId,
      p_user_id: targetId,
    });
    if (authorizationError) return NextResponse.json({ error: authorizationError.message }, { status: 403 });
    const { data: targetMembership, error: memberError } = await supabase.from('members')
      .select('user_id')
      .eq('server_id', serverId)
      .eq('user_id', targetId)
      .maybeSingle();
    if (memberError || !targetMembership) return NextResponse.json({ error: 'Este membro não está mais no servidor.' }, { status: 404 });
  }

  if (action === 'kick' || action === 'ban') {
    const { data: targetMembership, error: memberError } = await supabase.from('members')
      .select('user_id')
      .eq('server_id', serverId)
      .eq('user_id', targetId)
      .maybeSingle();
    if (memberError || targetMembership) {
      return NextResponse.json({ error: 'A ação de expulsão ou banimento precisa ser concluída antes de desconectar a chamada.' }, { status: 409 });
    }
  }

  if (action === 'timeout') {
    const { data: targetMembership, error: memberError } = await supabase.from('members')
      .select('communication_disabled_until')
      .eq('server_id', serverId)
      .eq('user_id', targetId)
      .maybeSingle();
    const memberTimeoutActive = Boolean(targetMembership?.communication_disabled_until && Date.parse(targetMembership.communication_disabled_until) > Date.now());
    const { data: durableTimeout } = await supabase.from('guild_timeouts')
      .select('until_at')
      .eq('server_id', serverId)
      .eq('user_id', targetId)
      .maybeSingle();
    const timeoutActive = memberTimeoutActive || Boolean(durableTimeout?.until_at && Date.parse(durableTimeout.until_at) > Date.now());
    if (memberError || !targetMembership || !timeoutActive) {
      return NextResponse.json({ error: 'O timeout precisa estar ativo antes de desconectar a chamada.' }, { status: 409 });
    }
  }

  const { data: channels, error: channelsError } = await supabase.from('channels')
    .select('id')
    .eq('server_id', serverId)
    .eq('type', 'voice');
  if (channelsError) return NextResponse.json({ error: 'Não foi possível localizar as chamadas deste servidor.' }, { status: 500 });

  const presenceChannels = (channels ?? []).map((channel) => `presence-room-${channel.id}`);
  const targetRooms: string[] = [];
  for (let index = 0; index < presenceChannels.length; index += 10) {
    const batch = presenceChannels.slice(index, index + 10);
    const results = await Promise.all(batch.map(async (presenceChannel) => {
      try {
        const response = await pusher.get({ path: `/channels/${presenceChannel}/users` });
        if (!response.ok) return null;
        const payload = await response.json() as { users?: Array<{ id?: string }> };
        return payload.users?.some((member) => member.id === targetId) ? presenceChannel : null;
      } catch {
        return null;
      }
    }));
    targetRooms.push(...results.filter((room): room is string => Boolean(room)));
  }

  if (!targetRooms.length) {
    return NextResponse.json({ disconnected: false, roomsAffected: 0 });
  }

  try {
    await Promise.all(targetRooms.map((channel) => pusher.trigger(channel, 'server-moderation', {
      serverId,
      targetId,
      action,
    })));
    return NextResponse.json({ disconnected: true, roomsAffected: targetRooms.length });
  } catch {
    return NextResponse.json({ error: 'Não foi possível encerrar a participação na chamada.' }, { status: 502 });
  }
}
