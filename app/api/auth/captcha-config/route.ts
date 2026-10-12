import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const siteKey = process.env.TURNSTILE_SITE_KEY ?? "";
  let siteUrl = "";
  try {
    const configuredUrl = new URL(process.env.SEKAI_SITE_URL ?? "");
    if (configuredUrl.protocol === "https:" || configuredUrl.hostname === "localhost" || configuredUrl.hostname === "127.0.0.1") {
      siteUrl = configuredUrl.origin;
    }
  } catch {
    // Sem uma origem canônica, o formulário permanece bloqueado.
  }
  return NextResponse.json(
    { siteKey: siteKey.length <= 200 ? siteKey : "", siteUrl },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
