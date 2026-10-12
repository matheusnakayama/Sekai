import { NextRequest, NextResponse } from "next/server";
import { honeypotEventSchema } from "@/lib/validation/auth";
import { readBoundedJson } from "@/lib/http/requestBody";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ accepted: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }

  const raw = await readBoundedJson(request, 4096);
  const parsed = honeypotEventSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ accepted: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }

  // Não registrar IP, e-mail nem o conteúdo do campo preenchido.
  console.warn(JSON.stringify({
    event: "security.auth_honeypot_blocked",
    action: parsed.data.action,
    at: new Date().toISOString(),
  }));

  return NextResponse.json({ accepted: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
