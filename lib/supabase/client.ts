import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

// Instância única, reaproveitada em todo o app — evita recriar o cliente
// (e recarregar a sessão do zero) a cada renderização de componente.
let client: SupabaseClient | undefined;

export function createClient() {
  if (!client) {
    client = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    );
  }
  return client;
}
