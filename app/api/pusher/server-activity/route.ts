import { NextResponse } from 'next/server';
import Pusher from 'pusher';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!accessToken) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!supabaseUrl || !supabaseKey || !appId || !key || !secret || !cluster) {
    return NextResponse.json({ error: 'Presença de voz não configurada.' }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });

  // RLS limita a consulta aos canais que o usuário pode acessar.
  const channels: { id: string; server_id: string | null }[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data: page, error: channelError } = await supabase
      .from('channels')
      .select('id, server_id')
      .eq('type', 'voice')
      .order('id')
      .range(from, from + pageSize - 1);
    if (channelError) return NextResponse.json({ error: 'Não foi possível consultar as chamadas.' }, { status: 500 });
    channels.push(...(page ?? []));
    if (!page || page.length < pageSize) break;
  }
  if (!channels?.length) return NextResponse.json({ activeServerIds: [] as string[] });

  const pusher = new Pusher({ appId, key, secret, cluster, useTLS: true });
  try {
    const response = await pusher.get({
      path: '/channels',
      params: { filter_by_prefix: 'presence-room-', info: 'user_count' },
    });
    if (!response.ok) return NextResponse.json({ error: 'Não foi possível consultar as chamadas.' }, { status: 502 });

    const body = await response.json() as { channels?: Record<string, { user_count?: number }> };
    const serverIdByPresenceChannel = new Map(channels.map((channel) => [`presence-room-${channel.id}`, channel.server_id]));
    const activeServerIds = new Set<string>();
    for (const [presenceChannel, details] of Object.entries(body.channels ?? {})) {
      const serverId = serverIdByPresenceChannel.get(presenceChannel);
      if (serverId && (details.user_count ?? 0) > 0) activeServerIds.add(serverId);
    }
    return NextResponse.json({ activeServerIds: [...activeServerIds] });
  } catch {
    return NextResponse.json({ error: 'Não foi possível consultar as chamadas.' }, { status: 502 });
  }
}
