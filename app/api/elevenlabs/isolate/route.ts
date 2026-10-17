import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { allowIsolationRequest, isolateSpeechPcm, validIsolationPcm } from "@/lib/elevenLabsIsolate";

export const runtime = "nodejs";

const MAX_PCM_BYTES = 64_000;

function noStore(body: object, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function readPcm(request: Request): Promise<Uint8Array | null> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_PCM_BYTES)) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PCM_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function authenticatedUserId(request: Request): Promise<string | null> {
  const authHeader = z.string().regex(/^Bearer\s+[\w.-]{20,8192}$/i).safeParse(request.headers.get("authorization") ?? "");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!authHeader.success || !supabaseUrl || !supabaseKey) return null;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.data.replace(/^Bearer\s+/i, ""));
  if (error || !user) return null;
  return user.id;
}

export async function POST(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return noStore({ error: "Sessão inválida." }, 401);
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim() ?? "";
  if (!apiKey) return noStore({ error: "A supressão ElevenLabs não está configurada neste servidor." }, 503);
  if (!allowIsolationRequest(userId, Date.now())) return noStore({ error: "Muitos trechos de áudio ao mesmo tempo." }, 429);
  const pcm = await readPcm(request);
  if (!pcm || !validIsolationPcm(pcm.byteLength)) return noStore({ error: "Áudio inválido." }, 400);
  try {
    const isolated = await isolateSpeechPcm(pcm, apiKey);
    return new NextResponse(new Uint8Array(isolated), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch {
    return noStore({ error: "Não foi possível limpar o áudio agora." }, 502);
  }
}
