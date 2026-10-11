"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type TopicReply = { id: string; author_id: string; content: string; created_at: string; profiles?: { display_name: string | null; username: string } | null };

export function ChatTopicCard({ topicId, title, currentUserId }: { topicId: string; title: string; currentUserId?: string }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [replyCount, setReplyCount] = useState(0);
  const [topicTitle, setTopicTitle] = useState(title);

  const refreshCount = useCallback(async () => {
    const [{ count }, { data: topic }] = await Promise.all([
      supabase.from("chat_topic_messages").select("id", { count: "exact", head: true }).eq("topic_id", topicId),
      supabase.from("chat_topics").select("title").eq("id", topicId).maybeSingle(),
    ]);
    if (typeof count === "number") setReplyCount(count);
    if (topic?.title) setTopicTitle(topic.title);
  }, [supabase, topicId]);

  useEffect(() => {
    void refreshCount();
    const channel = supabase.channel(`chat-topic-count:${topicId}`).on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_topic_messages", filter: `topic_id=eq.${topicId}` },
      () => void refreshCount(),
    ).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refreshCount, supabase, topicId]);

  return <>
    <button type="button" onClick={() => setOpen(true)} className="mt-2 flex w-full max-w-xl items-center gap-3 rounded-xl border border-discord-brand/30 bg-discord-brand/[0.08] p-3 text-left transition hover:bg-discord-brand/[0.14]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-discord-brand/15 text-discord-brand"><MessageCircle size={18}/></span>
      <span className="min-w-0 flex-1"><span className="block text-[10px] font-bold uppercase tracking-wider text-discord-brand">Tópico</span><span className="mt-0.5 block truncate text-sm font-semibold text-discord-header-primary">{topicTitle}</span></span>
      <span className="shrink-0 text-xs text-discord-text-muted">{replyCount} {replyCount === 1 ? "resposta" : "respostas"}</span>
    </button>
    {open && <ChatTopicThreadDialog topicId={topicId} initialTitle={topicTitle} currentUserId={currentUserId} onClose={() => setOpen(false)}/>}
  </>;
}

export function ChatTopicThreadDialog({ topicId, initialTitle, currentUserId, onClose }: { topicId: string; initialTitle: string; currentUserId?: string; onClose: () => void }) {
  const supabase = createClient();
  const [title, setTitle] = useState(initialTitle);
  const [replies, setReplies] = useState<TopicReply[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const loadReplies = useCallback(async () => {
    const [{ data: topic }, { data }] = await Promise.all([
      supabase.from("chat_topics").select("title").eq("id", topicId).maybeSingle(),
      supabase.from("chat_topic_messages").select("id,author_id,content,created_at,profiles(display_name,username)").eq("topic_id", topicId).order("created_at").limit(200),
    ]);
    if (topic?.title) setTitle(topic.title);
    setReplies((data ?? []) as unknown as TopicReply[]);
  }, [supabase, topicId]);

  useEffect(() => {
    void loadReplies();
    const channel = supabase.channel(`chat-topic-thread:${topicId}`).on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_topic_messages", filter: `topic_id=eq.${topicId}` },
      () => void loadReplies(),
    ).subscribe();
    function escape(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("keydown", escape); void supabase.removeChannel(channel); };
  }, [loadReplies, onClose, supabase, topicId]);

  async function sendReply(event: React.FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!currentUserId || !content || sending) return;
    setSending(true);
    setError("");
    const { error: insertError } = await supabase.from("chat_topic_messages").insert({ topic_id: topicId, author_id: currentUserId, content });
    if (insertError) setError(insertError.message.includes("chat_topic_messages") ? "Execute db/chat_composer_features_migration.sql no Supabase para ativar tópicos." : "Não foi possível enviar a resposta neste tópico.");
    else { setDraft(""); await loadReplies(); }
    setSending(false);
  }

  return <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={`Tópico: ${title}`} className="flex max-h-[min(760px,92dvh)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-discord-bg-floating shadow-2xl">
      <header className="flex items-start gap-3 border-b border-white/[0.08] p-4 sm:p-5"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-discord-brand/15 text-discord-brand"><MessageCircle size={20}/></span><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-discord-brand">Tópico</p><h2 className="mt-1 break-words text-lg font-bold text-discord-header-primary">{title}</h2></div><button type="button" onClick={onClose} aria-label="Fechar tópico" className="rounded-lg p-2 text-discord-text-muted hover:bg-white/10 hover:text-white"><X size={18}/></button></header>
      <div className="min-h-24 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
        {replies.length ? replies.map((reply) => <article key={reply.id} className="rounded-xl bg-discord-bg-secondary/70 px-3 py-2.5"><div className="mb-1 flex items-baseline gap-2"><span className="text-sm font-semibold text-discord-header-primary">{reply.profiles?.display_name || reply.profiles?.username || (reply.author_id === currentUserId ? "Você" : "Membro")}</span><time className="text-[10px] text-discord-text-muted">{new Date(reply.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</time></div><p className="whitespace-pre-wrap break-words text-sm text-discord-text-normal">{reply.content}</p></article>) : <p className="py-8 text-center text-sm text-discord-text-muted">Este tópico ainda não tem respostas.</p>}
      </div>
      <form onSubmit={sendReply} className="border-t border-white/[0.08] p-3 sm:p-4"><div className="flex items-center gap-2 rounded-xl bg-discord-bg-secondary p-2"><input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} placeholder="Responder no tópico…" className="min-w-0 flex-1 bg-transparent px-2 py-2 text-base text-discord-text-normal outline-none placeholder:text-discord-text-muted sm:text-sm"/><button type="submit" disabled={!draft.trim() || sending} aria-label="Enviar resposta" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-discord-brand text-white disabled:opacity-40"><Send size={17}/></button></div>{error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}</form>
    </section>
  </div>;
}
