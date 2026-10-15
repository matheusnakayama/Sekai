"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Plus, Search, Trash2 } from "lucide-react";
import { GAME_CATALOG, catalogGameName, isCatalogGame, normalizeProcessName } from "@/lib/gameCatalog";

const EMPTY: SekaiGameActivitySnapshot = { registeredGames: [], runningProcesses: [], currentGame: null };

function GameIcon({ src, name, className }: { src?: string | null; name: string; className: string }) {
  if (src) return <img src={src} alt={`${name} ícone`} className={`${className} object-cover`} />;
  return <span aria-label={`Ícone de ${name} indisponível`} className={`${className} grid place-items-center bg-white/10 font-bold text-discord-text-normal`}>{name.trim().slice(0, 1).toLocaleUpperCase()}</span>;
}

export function RegisteredGamesSettingsPanel() {
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [gameName, setGameName] = useState("");
  const [processName, setProcessName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [formError, setFormError] = useState("");
  const desktop = typeof window !== "undefined" ? window.sekaiDesktop : undefined;

  const refresh = useCallback(async () => {
    if (!desktop?.getGameActivity) { setLoading(false); return; }
    try { setSnapshot(await desktop.getGameActivity()); } catch { /* O próximo ciclo tenta de novo. */ }
    setLoading(false);
  }, [desktop]);

  useEffect(() => {
    if (!desktop?.getGameActivity) { setLoading(false); return; }
    void refresh();
    const unsubscribe = desktop.onGameActivity?.(setSnapshot);
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { window.clearInterval(timer); unsubscribe?.(); };
  }, [desktop, refresh]);

  useEffect(() => {
    if (!desktop?.updateRegisteredGames) return;
    if (!snapshot.registeredGames.some((game) => !isCatalogGame(game.processName))) return;
    void saveGames(snapshot.registeredGames);
  }, [desktop, snapshot.registeredGames]);

  async function saveGames(games: SekaiRegisteredGame[]) {
    if (!desktop?.updateRegisteredGames) return;
    const catalogGames = games.filter((game) => isCatalogGame(game.processName));
    try { setSnapshot(await desktop.updateRegisteredGames(catalogGames)); } catch { /* O app continua sem interromper a chamada. */ }
  }

  function addGame(name: string, rawProcessName: string, gameIconDataUrl?: string | null) {
    const cleanProcess = normalizeProcessName(rawProcessName);
    const catalogName = catalogGameName(cleanProcess);
    if (!cleanProcess || !catalogName) {
      setFormError("Escolha um jogo da lista. Navegador, Discord, Spotify e outros apps não entram.");
      return;
    }
    setFormError("");
    if (snapshot.registeredGames.some((game) => normalizeProcessName(game.processName) === cleanProcess)) return;
    void saveGames([...snapshot.registeredGames, { id: cleanProcess, name: catalogName || name.trim(), processName: cleanProcess, enabled: true, gameIconDataUrl: gameIconDataUrl ?? null }]);
    setGameName("");
    setProcessName("");
  }

  if (!desktop?.getGameActivity || !desktop?.updateRegisteredGames) return <section className="settings-section-enter"><p className="text-xs font-bold uppercase tracking-widest text-discord-brand">Somente no aplicativo</p><h1 className="mt-1 text-2xl font-bold text-discord-header-primary">Jogos registrados</h1><p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[.06] p-4 text-sm leading-6 text-discord-text-normal">A detecção de jogos funciona apenas no aplicativo Sekai. Seus amigos ainda podem ver a atividade que você compartilhar pelo app.</p></section>;

  const active = snapshot.currentGame && isCatalogGame(snapshot.currentGame.gameId) ? snapshot.currentGame : null;
  const registered = snapshot.registeredGames.filter((game) => isCatalogGame(game.processName));
  const knownIds = new Set(registered.map((game) => normalizeProcessName(game.processName)));
  const normalizedSearch = searchQuery.trim().replace(/\.exe$/i, "").toLocaleLowerCase();
  const matchesSearch = (name: string, executable: string) => !normalizedSearch || `${name} ${executable}`.toLocaleLowerCase().includes(normalizedSearch);
  const visibleGames = registered.filter((game) => matchesSearch(game.name, game.processName));
  const runningMatches = snapshot.runningProcesses.filter((process) => isCatalogGame(process.processName) && !knownIds.has(normalizeProcessName(process.processName)) && matchesSearch(process.displayName || catalogGameName(process.processName) || process.processName, process.processName));
  const catalogMatches = normalizedSearch
    ? GAME_CATALOG.filter((game) => !knownIds.has(game.process) && matchesSearch(game.name, game.process) && !runningMatches.some((process) => normalizeProcessName(process.processName) === game.process))
    : [];

  return <section className="settings-section-enter">
    <div className="mb-7"><p className="text-xs font-bold uppercase tracking-widest text-discord-brand">Somente no aplicativo</p><h1 className="mt-1 text-2xl font-bold text-discord-header-primary">Jogos registrados</h1><p className="mt-2 text-sm leading-6 text-discord-text-muted">O Sekai mostra só jogos da lista, como Nine Sols, Valorant e Minecraft. Apps comuns do computador não aparecem para adicionar.</p></div>
    <label className="mb-5 flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-discord-bg-primary px-3 text-discord-text-muted focus-within:border-discord-brand/70"><Search size={16} className="shrink-0"/><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar um jogo, como Nine Sols" aria-label="Buscar jogos registrados e da lista" className="min-w-0 flex-1 bg-transparent text-sm text-discord-text-normal outline-none placeholder:text-discord-text-muted"/>{searchQuery && <button type="button" onClick={() => setSearchQuery("")} className="text-xs font-medium hover:text-discord-text-normal">Limpar</button>}</label>
    <div className="mb-6 rounded-2xl border border-white/5 bg-discord-bg-primary p-4 sm:p-5">
      <h2 className="mb-3 text-sm font-semibold text-discord-header-primary">Jogo atual</h2>
      {active ? <div className="flex items-center gap-3"><GameIcon src={active.gameIconDataUrl} name={active.gameName} className="h-11 w-11 shrink-0 overflow-hidden rounded-xl text-lg"/><div className="min-w-0"><p className="truncate font-semibold text-white">{active.gameName}</p><p className="mt-1 text-xs text-emerald-300">Jogando agora</p></div><Check className="ml-auto text-emerald-300" size={18}/></div> : <p className="text-sm text-discord-text-muted">{loading ? "Procurando jogos registrados…" : "Nenhum jogo registrado está aberto."}</p>}
    </div>
    <div className="mb-6 rounded-2xl border border-white/5 bg-discord-bg-primary p-4 sm:p-5">
      <div className="mb-3"><h2 className="text-sm font-semibold text-discord-header-primary">Jogos registrados</h2><p className="mt-1 text-xs leading-5 text-discord-text-muted">Desative um jogo para ocultar sua atividade ou remova-o da lista.</p></div>
      {visibleGames.length ? <div className="divide-y divide-white/5">{visibleGames.map((game) => {
        const gameIcon = game.gameIconDataUrl || (active?.gameId === game.id ? active.gameIconDataUrl : null);
        return <div key={game.id} className="flex min-w-0 items-center gap-3 py-3 first:pt-1 last:pb-1"><GameIcon src={gameIcon} name={game.name} className="h-8 w-8 shrink-0 overflow-hidden rounded-lg text-xs"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-discord-header-primary">{game.name}</p><p className="truncate text-xs text-discord-text-muted">{game.processName}.exe</p></div><button type="button" role="switch" aria-label={`Compartilhar atividade de ${game.name}`} aria-checked={game.enabled} onClick={() => void saveGames(snapshot.registeredGames.map((item) => item.id === game.id ? { ...item, enabled: !item.enabled } : item))} className={`relative h-6 w-11 shrink-0 rounded-full transition ${game.enabled ? "bg-discord-brand" : "bg-white/15"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${game.enabled ? "left-6" : "left-1"}`}/></button><button type="button" aria-label={`Remover ${game.name}`} title="Remover jogo" onClick={() => void saveGames(snapshot.registeredGames.filter((item) => item.id !== game.id))} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-discord-text-muted transition hover:bg-rose-500/10 hover:text-rose-300"><Trash2 size={15}/></button></div>;
      })}</div> : <p className="py-2 text-sm text-discord-text-muted">{searchQuery ? "Nenhum jogo registrado corresponde à busca." : "Nenhum jogo adicionado."}</p>}
    </div>
    <div className="mb-6 rounded-2xl border border-white/5 bg-discord-bg-primary p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-discord-header-primary">Adicionar jogo</h2><p className="mb-3 mt-1 text-xs leading-5 text-discord-text-muted">Só entram jogos da lista. Se ele estiver aberto, aparece aqui. Para achar outro, busque pelo nome.</p>
      {(runningMatches.length || catalogMatches.length) ? <div className="max-h-52 space-y-1 overflow-y-auto">{[...runningMatches.map((process) => ({ key: `${process.processName}:${process.executablePath}`, name: catalogGameName(process.processName) || process.displayName, processName: process.processName, icon: process.gameIconDataUrl, running: true })), ...catalogMatches.map((game) => ({ key: game.process, name: game.name, processName: game.process, icon: null, running: false }))].map((game) => <button key={game.key} type="button" onClick={() => addGame(game.name, game.processName, game.icon)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-discord-bg-modifier-hover"><GameIcon src={game.icon} name={game.name} className="h-7 w-7 shrink-0 overflow-hidden rounded-md text-[11px]"/><span className="min-w-0 flex-1"><span className="block truncate text-sm text-discord-text-normal">{game.name}</span><span className="block truncate text-[11px] text-discord-text-muted">{game.processName}.exe</span></span>{game.running && <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300">Aberto</span>}<Plus size={16} className="text-discord-brand"/></button>)}</div> : <p className="py-2 text-xs text-discord-text-muted">{searchQuery ? "Nenhum jogo da lista corresponde à busca." : loading ? "Procurando jogos da lista em execução…" : "Nenhum jogo da lista está aberto. Busque pelo nome para registrar."}</p>}
      <div className="mt-4 grid gap-2 border-t border-white/5 pt-4 sm:grid-cols-[1fr_1fr_auto]"><input value={gameName} onChange={(event) => { setGameName(event.target.value); setFormError(""); }} placeholder="Nome exibido (ex.: Nine Sols)" className="rounded-lg border border-white/10 bg-discord-bg-secondary px-3 py-2 text-sm text-discord-text-normal outline-none focus:border-discord-brand/70"/><input value={processName} onChange={(event) => { setProcessName(event.target.value); setFormError(""); }} onKeyDown={(event) => { if (event.key === "Enter") addGame(gameName, processName); }} placeholder="Processo (ex.: NineSols.exe)" className="rounded-lg border border-white/10 bg-discord-bg-secondary px-3 py-2 text-sm text-discord-text-normal outline-none focus:border-discord-brand/70"/><button type="button" onClick={() => addGame(gameName, processName)} disabled={!processName.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-discord-brand px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"><Plus size={15}/>Adicionar</button></div>
      {formError && <p className="mt-2 text-xs text-rose-300">{formError}</p>}
    </div>
    <p className="rounded-xl border border-white/5 p-4 text-xs leading-5 text-discord-text-muted">O ícone enviado aos amigos é a imagem do próprio jogo, a mesma do executável.</p>
  </section>;
}
