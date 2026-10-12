/** Allow only HTTPS destinations in user supplied Markdown links and images. */
export function safeChatMarkdownUrl(value: string): string {
  const candidate = value.trim();
  if (!candidate) return "";
  if (/^#(?:sekai-mention|sekai-mention-mine)$/.test(candidate)) return candidate;

  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://sekai.invalid";
    const url = new URL(candidate, base);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    return candidate;
  } catch {
    return "";
  }
}
