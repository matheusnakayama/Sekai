import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { createClient } from "@supabase/supabase-js";

// GET /api/livekit-token?channelId=xxx
// O navegador manda o access_token do usuário no header Authorization.
// Aqui validamos esse token direto com o Supabase (sem depender de cookies).
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const accessToken = authHeader.replace("Bearer ", "");

  if (!accessToken) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !user) {
    return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  }

  const channelId = req.nextUrl.searchParams.get("channelId");
  if (!channelId) {
    return NextResponse.json({ error: "channelId é obrigatório" }, { status: 400 });
  }

  // Usa o token do próprio usuário nessa checagem, pra respeitar a RLS de "channels"
  const supabaseAsUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  );

  const { data: channel } = await supabaseAsUser
    .from("channels")
    .select("id, type, server_id")
    .eq("id", channelId)
    .single();

  if (!channel || channel.type !== "voice") {
    return NextResponse.json({ error: "Canal de voz inválido" }, { status: 404 });
  }

  const { data: profile } = await supabaseAsUser
    .from("profiles")
    .select("username, display_name")
    .eq("id", user.id)
    .single();

  const apiKey = process.env.LIVEKIT_API_KEY!;
  const apiSecret = process.env.LIVEKIT_API_SECRET!;

  const token = new AccessToken(apiKey, apiSecret, {
    identity: user.id,
    name: profile?.display_name || profile?.username || "Usuário",
  });

  token.addGrant({
    room: channelId,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return NextResponse.json({ token: await token.toJwt() });
}
