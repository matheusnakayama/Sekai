"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Check, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type PollOption = { id: string; label: string; position: number };
type PollData = { question: string; options: PollOption[]; results: { option_id: string; vote_count: number; voted_by_me: boolean }[] };

export function ChatPollCard({ pollId, fallbackQuestion, currentUserId }: { pollId: string; fallbackQuestion: string; currentUserId?: string }) {
  const supabase = createClient();
  const [poll, setPoll] = useState<PollData>({ question: fallbackQuestion, options: [], results: [] });
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const myVote = poll.results.find((result) => result.voted_by_me)?.option_id;
  const totalVotes = poll.results.reduce((sum, result) => sum + result.vote_count, 0);
  const voteCounts = useMemo(() => new Map(poll.results.map((result) => [result.option_id, result.vote_count])), [poll.results]);

  const load = useCallback(async () => {
    const [{ data: pollRow }, { data: options }, { data: results }] = await Promise.all([
      supabase.from("chat_polls").select("question").eq("id", pollId).maybeSingle(),
      supabase.from("chat_poll_options").select("id,label,position").eq("poll_id", pollId).order("position"),
      supabase.rpc("get_channel_poll_results", { p_poll_id: pollId }),
    ]);
    const mappedResults = (results ?? []) as { option_id: string; vote_count: number; voted_by_me: boolean }[];
    if (pollRow) setPoll({ question: pollRow.question, options: (options ?? []) as PollOption[], results: mappedResults });
    else if (options?.length) setPoll((current) => ({ ...current, options: options as PollOption[], results: mappedResults }));
  }, [pollId, supabase]);

  useEffect(() => {
    void load();
    const channel = supabase.channel(`chat-poll:${pollId}`).on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "chat_polls", filter: `id=eq.${pollId}` },
      () => void load(),
    ).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, pollId, supabase]);

  async function vote() {
    if (!selected || !currentUserId || busy) return;
    setBusy(true);
    setError("");
    const { error: voteError } = await supabase.rpc("cast_channel_poll_vote", { p_poll_id: pollId, p_option_id: selected });
    if (voteError) setError(voteError.message.includes("cast_channel_poll_vote") ? "Execute db/chat_composer_features_migration.sql no Supabase para ativar enquetes." : "Não foi possível registrar seu voto.");
    else { await load(); setSelected(""); }
    setBusy(false);
  }

  return <section className="mt-2 w-full max-w-xl rounded-xl border border-white/10 bg-discord-bg-secondary/75 p-3 sm:p-4" aria-label="Enquete">
    <div className="mb-3 flex items-start gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-discord-brand/15 text-discord-brand"><BarChart3 size={17}/></span><div><p className="text-[10px] font-bold uppercase tracking-wider text-discord-brand">Enquete</p><h3 className="mt-0.5 break-words text-sm font-semibold text-discord-header-primary">{poll.question}</h3></div></div>
    {poll.options.length ? <div className="space-y-2">{poll.options.map((option) => {
      const count = voteCounts.get(option.id) ?? 0;
      const percent = totalVotes ? Math.round(count * 100 / totalVotes) : 0;
      const isSelected = selected === option.id;
      const isMyVote = myVote === option.id;
      return <button key={option.id} type="button" disabled={!!myVote || busy} onClick={() => setSelected(option.id)} className={`relative flex min-h-10 w-full items-center gap-2 overflow-hidden rounded-lg border px-3 py-2 text-left transition disabled:cursor-default ${isSelected || isMyVote ? "border-discord-brand/70" : "border-white/[0.08] hover:border-white/20"}`}>
        {!!myVote && <span className="absolute inset-y-0 left-0 bg-discord-brand/15 transition-all" style={{ width: `${percent}%` }}/>}<span className="relative grid h-4 w-4 shrink-0 place-items-center rounded-full border border-white/35">{isSelected || isMyVote ? <span className="h-2 w-2 rounded-full bg-discord-brand"/> : null}</span><span className="relative min-w-0 flex-1 break-words text-sm text-discord-text-normal">{option.label}</span>{!!myVote && <span className="relative shrink-0 text-xs text-discord-text-muted">{percent}% · {count}</span>}{isMyVote && <Check size={15} className="relative shrink-0 text-discord-brand"/>}
      </button>;
    })}</div> : <p className="text-xs text-discord-text-muted">Carregando opções…</p>}
    <div className="mt-3 flex items-center justify-between gap-3"><span className="text-[11px] text-discord-text-muted">{totalVotes} {totalVotes === 1 ? "voto" : "votos"} · escolha uma opção</span>{!myVote && <button type="button" onClick={() => void vote()} disabled={!selected || busy} className="inline-flex items-center gap-1.5 rounded-lg bg-discord-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{busy && <LoaderCircle size={13} className="animate-spin"/>}Votar</button>}</div>
    {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
  </section>;
}
