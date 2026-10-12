import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// GET /api/livekit-token?channelId=xxx
// O navegador manda o access_token do usuário no header Authorization.
// Aqui validamos esse token direto com o Supabase (sem depender de cookies).
export async function GET(req: NextRequest) {
  const authHeader = z.string().regex(/^Bearer\s+[\w.-]{20,8192}$/i).safeParse(req.headers.get("authorization") ?? "");
  const accessToken = authHeader.success ? authHeader.data.replace(/^Bearer\s+/i, "") : "";

  if (!accessToken) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ error: "Autenticação indisponível." }, { status: 503 });
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !user) {
    return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  }

  const channelResult = z.string().uuid().safeParse(req.nextUrl.searchParams.get("channelId"));
  if (!channelResult.success) {
    return NextResponse.json({ error: "channelId é obrigatório" }, { status: 400 });
  }
  const channelId = channelResult.data;

  // Usa o token do próprio usuário nessa checagem, pra respeitar a RLS de "channels"
  const supabaseAsUser = createClient(
    supabaseUrl,
    supabaseKey,
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

  const { data: membership } = await supabaseAsUser.from("members")
    .select("is_banned,communication_disabled_until")
    .eq("server_id", channel.server_id)
    .eq("user_id", user.id)
    .maybeSingle();
  const { data: timeout } = await supabaseAsUser.from("guild_timeouts")
    .select("until_at")
    .eq("server_id", channel.server_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership || membership.is_banned ||
      (membership.communication_disabled_until && Date.parse(membership.communication_disabled_until) > Date.now()) ||
      (timeout?.until_at && Date.parse(timeout.until_at) > Date.now())) {
    return NextResponse.json({ error: "Você não pode entrar nesta chamada." }, { status: 403 });
  }

  const { data: profile } = await supabaseAsUser
    .from("profiles")
    .select("username, display_name")
    .eq("id", user.id)
    .single();

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) return NextResponse.json({ error: "Serviço de voz não configurado." }, { status: 503 });

  const token = new AccessToken(apiKey, apiSecret, {
    identity: user.id,
    name: profile?.display_name || profile?.username || "Usuário",
    ttl: "10m",
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
