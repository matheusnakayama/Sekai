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

function hasTurnUrl(server: IceServerConfig) {
  const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
  return urls.some((url) => /^turns?:/i.test(url));
}

function noStoreJson(body: object) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

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

  const meteredKey = process.env.METERED_API_KEY;
  const meteredApp = process.env.METERED_APP_NAME;
  const appName = z.string().min(1).max(63).regex(/^[a-z0-9-]+$/i).safeParse(meteredApp ?? '');
  let meteredFailure = meteredKey && appName.success ? 'request_failed' : 'not_configured';

  if (meteredKey && appName.success) {
    try {
      // Gera credenciais TURN de curta duração via API do Metered.ca.
      // Documentação: https://www.metered.ca/docs/turn-rest-api/get-credential/
      const endpoint = new URL(`https://${appName.data}.metered.live/api/v1/turn/credentials`);
      endpoint.searchParams.set('apiKey', meteredKey);
      const res = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const responseText = await readBoundedStream(res.body, 128 * 1024);
        if (responseText) {
          const parsedServers = z.array(iceServerSchema).max(20).safeParse(JSON.parse(responseText));
          if (parsedServers.success && parsedServers.data.some(hasTurnUrl)) {
            return noStoreJson({
              iceServers: [...GOOGLE_STUN, ...parsedServers.data],
              turnAvailable: true,
              turnSource: 'metered',
            });
          }
          meteredFailure = 'invalid_response';
        } else {
          meteredFailure = 'empty_response';
        }
      } else {
        meteredFailure = `http_${res.status}`;
      }
    } catch {
      // Tenta a configuração TURN estática abaixo se o provedor estiver indisponível.
    }
  }

  const staticTurn = iceServerSchema.safeParse({
    urls: process.env.TURN_URL ?? '',
    username: process.env.TURN_USERNAME,
    credential: process.env.TURN_CREDENTIAL,
  });
  if (staticTurn.success && hasTurnUrl(staticTurn.data) && staticTurn.data.username && staticTurn.data.credential) {
    return noStoreJson({
      iceServers: [...GOOGLE_STUN, staticTurn.data],
      turnAvailable: true,
      turnSource: 'static',
    });
  }

  console.warn('Servidor TURN indisponível; entregando apenas STUN.', {
    meteredConfigured: Boolean(meteredKey && appName.success),
    meteredFailure,
    staticTurnConfigured: Boolean(process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL),
  });
  return noStoreJson({ iceServers: GOOGLE_STUN, turnAvailable: false, turnSource: 'stun' });
}
