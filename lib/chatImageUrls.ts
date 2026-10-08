import type { SupabaseClient } from "@supabase/supabase-js";

/** Turn the stable URL saved in chat history into a short-lived URL that can
 * read the private chat-images bucket. Non-storage URLs pass through unchanged.
 */
export async function resolveChatImageUrl(supabase: SupabaseClient, storedUrl: string): Promise<string> {
  try {
    const parsed = new URL(storedUrl);
    const match = parsed.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/chat-images\/(.+)$/);
    if (!match) return storedUrl;

    const path = decodeURIComponent(match[1]);
    const { data, error } = await supabase.storage.from("chat-images").createSignedUrl(path, 24 * 60 * 60);
    if (error || !data?.signedUrl) {
      console.warn("Não foi possível gerar um link temporário para a imagem do chat:", error?.message);
      return storedUrl;
    }
    return data.signedUrl;
  } catch {
    return storedUrl;
  }
}
