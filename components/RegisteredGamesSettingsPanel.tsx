"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Plus, Search, Trash2 } from "lucide-react";

const EMPTY: SekaiGameActivitySnapshot = { registeredGames: [], runningProcesses: [], currentGame: null };

export function RegisteredGamesSettingsPanel() {
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [gameName, setGameName] = useState("");
  const [processName, setProcessName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
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

  async function saveGames(games: SekaiRegisteredGame[]) {
    if (!desktop?.updateRegisteredGames) return;
    try { setSnapshot(await desktop.updateRegisteredGames(games)); } catch { /* O app continua sem interromper a chamada. */ }
  }

  function addGame(name: string, rawProcessName: string, gameIconDataUrl?: string | null) {
    const cleanProcess = rawProcessName.trim().replace(/\.exe$/i, "").split(/[\\/]/).pop() ?? "";
    const cleanName = name.trim() || cleanProcess.replace(/[-_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
    if (!cleanProcess || snapshot.registeredGames.some((game) => game.processName.toLowerCase() === cleanProcess.toLowerCase())) return;
    void saveGames([...snapshot.registeredGames, { id: cleanProcess.toLowerCase(), name: cleanName, processName: cleanProcess, enabled: true, gameIconDataUrl: gameIconDataUrl ?? null }]);
    setGameName("");
    setProcessName("");
  }

  if (!desktop?.getGameActivity || !desktop?.updateRegisteredGames) return <section className="settings-section-enter"><p className="text-xs font-bold uppercase tracking-widest text-discord-brand">Somente no aplicativo</p><h1 className="mt-1 text-2xl font-bold text-discord-header-primary">Jogos registrados</h1><p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[.06] p-4 text-sm leading-6 text-discord-text-normal">A detecção de jogos funciona apenas no aplicativo Sekai. Seus amigos ainda podem ver a atividade que você compartilhar pelo app.</p></section>;

  const active = snapshot.currentGame;
  const knownIds = new Set(snapshot.registeredGames.map((game) => game.processName.toLowerCase()));
  const detected = snapshot.runningProcesses.filter((process) => !knownIds.has(process.processName.toLowerCase()));
  const normalizedSearch = searchQuery.trim().replace(/\.exe$/i, "").toLocaleLowerCase();
  const matchesSearch = (name: string, executable: string) => !normalizedSearch || `${name} ${executable}`.toLocaleLowerCase().includes(normalizedSearch);
  const visibleGames = snapshot.registeredGames.filter((game) => matchesSearch(game.name, game.processName));
  const visibleDetected = detected.filter((process) => matchesSearch(process.displayName || process.processName, process.processName));

  return <section className="settings-section-enter">
    <div className="mb-7"><p className="text-xs font-bold uppercase tracking-widest text-discord-brand">Somente no aplicativo</p><h1 className="mt-1 text-2xl font-bold text-discord-header-primary">Jogos registrados</h1><p className="mt-2 text-sm leading-6 text-discord-text-muted">O Sekai detecta os jogos em execução neste computador. Sua atividade é sincronizada para que amigos no navegador também possam vê-la.</p></div>
    <label className="mb-5 flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-discord-bg-primary px-3 text-discord-text-muted focus-within:border-discord-brand/70"><Search size={16} className="shrink-0"/><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar jogos pelo nome ou processo" aria-label="Buscar jogos registrados e detectados" className="min-w-0 flex-1 bg-transparent text-sm text-discord-text-normal outline-none placeholder:text-discord-text-muted"/>{searchQuery && <button type="button" onClick={() => setSearchQuery("")} className="text-xs font-medium hover:text-discord-text-normal">Limpar</button>}</label>
    <div className="mb-6 rounded-2xl border border-white/5 bg-discord-bg-primary p-4 sm:p-5">
      <h2 className="mb-3 text-sm font-semibold text-discord-header-primary">Jogo atual</h2>
      {active ? <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-emerald-400/10 text-emerald-100">{active.gameIconDataUrl ? <img src={active.gameIconDataUrl} alt={`${active.gameName} ícone`} className="h-full w-full object-cover"/> : <span className="text-lg font-bold">{active.gameName.trim().slice(0, 1).toLocaleUpperCase()}</span>}</span><div className="min-w-0"><p className="truncate font-semibold text-white">{active.gameName}</p><p className="mt-1 text-xs text-emerald-300">Jogando agora</p></div><Check className="ml-auto text-emerald-300" size={18}/></div> : <p className="text-sm text-discord-text-muted">{loading ? "Procurando jogos registrados…" : "Nenhum jogo registrado está aberto."}</p>}
    </div>
    <div className="mb-6 rounded-2xl border border-white/5 bg-discord-bg-primary p-4 sm:p-5">
      <div className="mb-3"><h2 className="text-sm font-semibold text-discord-header-primary">Jogos registrados</h2><p className="mt-1 text-xs leading-5 text-discord-text-muted">Desative um jogo para ocultar sua atividade ou remova-o da lista.</p></div>
      {visibleGames.length ? <div className="divide-y divide-white/5">{visibleGames.map((game) => {
        const gameIcon = game.gameIconDataUrl || (active?.gameId === game.id ? active.gameIconDataUrl : null);
        return <div key={game.id} className="flex min-w-0 items-center gap-3 py-3 first:pt-1 last:pb-1">{gameIcon ? <img src={gameIcon} alt={`${game.name} ícone`} className="h-8 w-8 shrink-0 rounded-lg object-cover"/> : <span aria-label={`Ícone de ${game.name} indisponível`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-xs font-bold text-discord-text-normal">{game.name.trim().slice(0, 1).toLocaleUpperCase()}</span>}<div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-discord-header-primary">{game.name}</p><p className="truncate text-xs text-discord-text-muted">{game.processName}.exe</p></div><button type="button" role="switch" aria-label={`Compartilhar atividade de ${game.name}`} aria-checked={game.enabled} onClick={() => void saveGames(snapshot.registeredGames.map((item) => item.id === game.id ? { ...item, enabled: !item.enabled } : item))} className={`relative h-6 w-11 shrink-0 rounded-full transition ${game.enabled ? "bg-discord-brand" : "bg-white/15"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${game.enabled ? "left-6" : "left-1"}`}/></button><button type="button" aria-label={`Remover ${game.name}`} title="Remover jogo" onClick={() => void saveGames(snapshot.registeredGames.filter((item) => item.id !== game.id))} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-discord-text-muted transition hover:bg-rose-500/10 hover:text-rose-300"><Trash2 size={15}/></button></div>;
      })}</div> : <p className="py-2 text-sm text-discord-text-muted">{searchQuery ? "Nenhum jogo registrado corresponde à busca." : "Nenhum jogo adicionado."}</p>}
    </div>
    <div className="mb-6 rounded-2xl border border-white/5 bg-discord-bg-primary p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-discord-header-primary">Jogos detectados</h2><p className="mb-3 mt-1 text-xs leading-5 text-discord-text-muted">Mostramos jogos conhecidos que estão abertos. Para um jogo que não aparece, informe o processo abaixo.</p>
      {visibleDetected.length ? <div className="max-h-52 space-y-1 overflow-y-auto">{visibleDetected.map((process) => <button key={`${process.processName}:${process.executablePath}`} type="button" onClick={() => addGame(process.displayName || "", process.processName, process.gameIconDataUrl)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-discord-bg-modifier-hover">{process.gameIconDataUrl ? <img src={process.gameIconDataUrl} alt={`${process.displayName} ícone`} className="h-7 w-7 shrink-0 rounded-md object-cover"/> : <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/10 text-[11px] font-bold text-discord-text-normal">{(process.displayName || process.processName).trim().slice(0, 1).toLocaleUpperCase()}</span>}<span className="min-w-0 flex-1 truncate text-sm text-discord-text-normal">{process.displayName || process.processName}</span><Plus size={16} className="text-discord-brand"/></button>)}</div> : <p className="py-2 text-xs text-discord-text-muted">{searchQuery ? "Nenhum jogo detectado corresponde à busca." : loading ? "Procurando jogos conhecidos em execução…" : "Não há jogos conhecidos em execução para adicionar."}</p>}
      <div className="mt-4 grid gap-2 border-t border-white/5 pt-4 sm:grid-cols-[1fr_1fr_auto]"><input value={gameName} onChange={(event) => setGameName(event.target.value)} placeholder="Nome exibido (ex.: Nine Sols)" className="rounded-lg border border-white/10 bg-discord-bg-secondary px-3 py-2 text-sm text-discord-text-normal outline-none focus:border-discord-brand/70"/><input value={processName} onChange={(event) => setProcessName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addGame(gameName, processName); }} placeholder="Processo (ex.: NineSols.exe)" className="rounded-lg border border-white/10 bg-discord-bg-secondary px-3 py-2 text-sm text-discord-text-normal outline-none focus:border-discord-brand/70"/><button type="button" onClick={() => addGame(gameName, processName)} disabled={!processName.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-discord-brand px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"><Plus size={15}/>Adicionar</button></div>
    </div>
    <p className="rounded-xl border border-white/5 p-4 text-xs leading-5 text-discord-text-muted">O navegador não consegue detectar processos do computador. Depois de registrados no app, os jogos e o tempo de sessão aparecem para seus amigos em qualquer cliente.</p>
  </section>;
}
