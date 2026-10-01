import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { issueRoomSession } from '@/lib/roomSession';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!accessToken) {
    return NextResponse.json({ error: 'Entre no Sekai para participar da chamada.' }, { status: 401 });
  }

  let body: { roomId?: unknown };
  try {
    body = await request.json() as { roomId?: unknown };
  } catch {
    return NextResponse.json({ error: 'Sala inválida.' }, { status: 400 });
  }
  const roomId = body.roomId;

  if (typeof roomId !== 'string' || !/^[a-z0-9-]{4,64}$/.test(roomId)) {
    return NextResponse.json({ error: 'Código da sala inválido.' }, { status: 400 });
  }

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

    // RLS confirma que a pessoa pertence ao servidor que contém este canal.
    const { data: channel } = await supabase
      .from('channels')
      .select('id, type')
      .eq('id', roomId)
      .eq('type', 'voice')
      .maybeSingle();
    if (!channel) {
      return NextResponse.json({ error: 'Canal de voz não encontrado ou sem acesso.' }, { status: 403 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, username')
      .eq('id', user.id)
      .maybeSingle();
    const displayName = profile?.display_name || profile?.username || 'Usuário';

    const safeDisplayName = displayName.slice(0, 40);
    return NextResponse.json({ ...issueRoomSession(roomId, safeDisplayName), displayName: safeDisplayName });
  } catch {
    return NextResponse.json({ error: 'O servidor não conseguiu autorizar a entrada na sala.' }, { status: 503 });
  }
}
