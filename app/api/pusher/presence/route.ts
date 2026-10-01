import { NextResponse } from 'next/server';
import Pusher from 'pusher';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const channelId = new URL(request.url).searchParams.get('channelId');
  if (!accessToken || !channelId || !/^[a-z0-9-]{4,64}$/.test(channelId)) {
    return NextResponse.json({ error: 'Solicitação inválida.' }, { status: 400 });
  }

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

  // RLS só retorna o canal quando o solicitante tem acesso ao servidor.
  const { data: channel } = await supabase.from('channels').select('id, type').eq('id', channelId).eq('type', 'voice').maybeSingle();
  if (!channel) return NextResponse.json({ error: 'Canal de voz indisponível.' }, { status: 403 });

  try {
    const pusher = new Pusher({ appId, key, secret, cluster, useTLS: true });
    const response = await pusher.get({ path: `/channels/presence-room-${channelId}/users` });
    if (!response.ok) return NextResponse.json({ members: [] });
    const body = await response.json() as { users?: { id?: string }[] };
    const ids = (body.users ?? []).map((entry) => entry.id).filter((id): id is string => typeof id === 'string');
    if (!ids.length) return NextResponse.json({ members: [] });

    const { data: profiles } = await supabase.from('profiles').select('id, display_name, username, avatar_url').in('id', ids);
    const members = ids.map((id) => {
      const profile = profiles?.find((item) => item.id === id);
      return { id, name: profile?.display_name || profile?.username || 'Usuário', avatarUrl: profile?.avatar_url ?? null };
    });
    return NextResponse.json({ members });
  } catch {
    // A API do Pusher responde com erro quando a sala ainda não existe; nesse caso, ninguém está na call.
    return NextResponse.json({ members: [] });
  }
}
