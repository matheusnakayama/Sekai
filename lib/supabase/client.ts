import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

// Instância única, reaproveitada em todo o app — evita recriar o cliente
// (e recarregar a sessão do zero) a cada renderização de componente.
let client: SupabaseClient | undefined;
let clientKey = "";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const configured = url.length > 0 && key.length > 0;
  // O preview da Vercel prerenderiza a home sem as variáveis de produção.
  // Um endereço vazio faz o Supabase abortar o build inteiro ("supabaseUrl is required").
  const nextKey = configured ? `${url}\n${key}` : "unconfigured";
  if (!client || clientKey !== nextKey) {
    clientKey = nextKey;
    client = createSupabaseClient(
      configured ? url : "http://127.0.0.1:54321",
      configured ? key : "public-anon-key",
      {
        auth: {
          persistSession: configured,
          autoRefreshToken: configured,
          detectSessionInUrl: configured,
        },
      }
    );
  }
  return client;
}
