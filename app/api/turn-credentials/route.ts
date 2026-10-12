import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { readBoundedStream } from '@/lib/http/requestBody';
import type { IceServerConfig } from '@/lib/types';

export const runtime = 'nodejs';

const GOOGLE_STUN: IceServerConfig[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

const iceServerSchema = z.object({
  urls: z.union([z.string().min(1).max(2048), z.array(z.string().min(1).max(2048)).min(1).max(20)]),
  username: z.string().max(512).optional(),
  credential: z.string().max(2048).optional(),
}).passthrough();

export async function GET(request: Request) {
  const authHeader = z.string().regex(/^Bearer\s+[\w.-]{20,8192}$/i).safeParse(request.headers.get('authorization') ?? '');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!authHeader.success || !supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.data.replace(/^Bearer\s+/i, ''));
  if (error || !user) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

  const iceServers: IceServerConfig[] = [...GOOGLE_STUN];

  const meteredKey = process.env.METERED_API_KEY;
  const meteredApp = process.env.METERED_APP_NAME;

  try {
    const appName = z.string().min(1).max(63).regex(/^[a-z0-9-]+$/i).safeParse(meteredApp ?? '');
    if (meteredKey && appName.success) {
      // Gera credenciais TURN de curta duração via API do Metered.ca.
      // Documentação: https://www.metered.ca/docs/turn-credentials-api
      const endpoint = new URL(`https://${appName.data}.metered.live/api/v1/turn/credentials`);
      endpoint.searchParams.set('apiKey', meteredKey);
      const res = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const responseText = await readBoundedStream(res.body, 128 * 1024);
        if (responseText) {
          const parsedServers = z.array(iceServerSchema).max(20).safeParse(JSON.parse(responseText));
          if (parsedServers.success) {
            return NextResponse.json({ iceServers: [...iceServers, ...parsedServers.data] }, { headers: { 'Cache-Control': 'no-store' } });
          }
        }
      }
    } else if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
      iceServers.push({
        urls: process.env.TURN_URL,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL,
      });
    }
  } catch {
    // Se o serviço de TURN falhar, seguimos apenas com STUN — chamadas na mesma
    // rede ou entre redes "abertas" ainda funcionam, mas redes restritivas podem falhar.
  }

  return NextResponse.json({ iceServers }, { headers: { 'Cache-Control': 'no-store' } });
}
