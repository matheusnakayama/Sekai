"use client";

import { useState } from "react";
import { Hash, Save, Volume2, X } from "lucide-react";
import type { Channel } from "@/components/ChannelSidebar";

interface ChannelSettingsModalProps {
  channel: Channel;
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSave: (channel: Channel, name: string, categoryId: string | null) => Promise<void>;
}

export function ChannelSettingsModal({ channel, categories, onClose, onSave }: ChannelSettingsModalProps) {
  const [name, setName] = useState(channel.name);
  const [categoryId, setCategoryId] = useState(channel.categoryId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const normalizedName = name.trim().toLowerCase().replace(/\s+/g, "-");
    if (!normalizedName) { setError("Informe um nome para o canal."); return; }
    setLoading(true); setError("");
    try {
      await onSave(channel, normalizedName, categoryId || null);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar as alterações.");
    } finally { setLoading(false); }
  }

  return <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/65 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onClose(); }}>
    <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="channel-settings-title" className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-discord-bg-secondary shadow-2xl">
      <header className="flex items-start justify-between border-b border-white/[0.07] px-6 py-5">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-discord-brand">Canal do servidor</p><h2 id="channel-settings-title" className="mt-1 text-xl font-bold text-discord-header-primary">Configurações do canal</h2><p className="mt-1 text-sm text-discord-text-muted">Altere o nome ou mova este canal para outra categoria.</p></div>
        <button type="button" onClick={onClose} aria-label="Fechar configurações" className="rounded-lg p-1.5 text-discord-text-muted hover:bg-white/5 hover:text-white"><X size={18}/></button>
      </header>
      <div className="space-y-5 p-6">
        <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wide text-discord-text-muted">Nome do canal</span><span className="flex items-center gap-2 rounded-lg border border-white/10 bg-discord-bg-primary px-3 py-2.5 focus-within:border-discord-brand/60"><span className="text-discord-text-muted">{channel.type === "text" ? <Hash size={17}/> : <Volume2 size={17}/>}</span><input autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-discord-text-normal outline-none"/></span></label>
        <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wide text-discord-text-muted">Categoria</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="w-full rounded-lg border border-white/10 bg-discord-bg-primary px-3 py-2.5 text-sm text-discord-text-normal outline-none focus:border-discord-brand/60"><option value="">Sem categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <div className="flex items-center gap-3 rounded-xl bg-discord-bg-primary/70 p-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-discord-bg-modifier-hover text-discord-text-muted">{channel.type === "text" ? <Hash size={18}/> : <Volume2 size={18}/>}</span><span><span className="block text-sm font-medium text-discord-text-normal">Canal de {channel.type === "text" ? "texto" : "voz"}</span><span className="block text-xs text-discord-text-muted">O tipo do canal não pode ser alterado depois de criado.</span></span></div>
        {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      </div>
      <footer className="flex justify-end gap-2 border-t border-white/[0.07] bg-discord-bg-primary/40 px-6 py-4"><button type="button" disabled={loading} onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-discord-text-muted hover:bg-white/5 hover:text-white">Cancelar</button><button type="submit" disabled={loading || !name.trim()} className="inline-flex items-center gap-2 rounded-lg bg-discord-brand px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"><Save size={15}/>{loading ? "Salvando…" : "Salvar alterações"}</button></footer>
    </form>
  </div>;
}
