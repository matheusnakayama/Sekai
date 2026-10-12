"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { totpCodeSchema } from "@/lib/validation/auth";

export function MfaChallenge({ onVerified, onCancel }: { onVerified: () => void; onCancel: () => void }) {
  const supabase = createClient();
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.auth.mfa.listFactors().then(({ data, error: listError }) => {
      if (!active) return;
      const factor = data?.totp?.find((item) => item.status === "verified");
      if (listError || !factor) setError("Não foi possível encontrar um autenticador ativo nesta conta.");
      else setFactorId(factor.id);
      setLoading(false);
    });
    return () => { active = false; };
  }, [supabase]);

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const parsed = totpCodeSchema.safeParse(code);
    if (!factorId || !parsed.success) { setError("Informe o código atual do autenticador."); return; }
    setBusy(true);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: parsed.data });
    setBusy(false);
    if (verifyError) { setError("Código inválido ou expirado."); return; }
    onVerified();
  }

  return <main className="flex min-h-screen items-center justify-center bg-discord-bg-primary px-4 py-8">
    <form onSubmit={(event) => void verify(event)} className="w-full max-w-md rounded-3xl border border-white/10 bg-discord-bg-secondary p-6 shadow-2xl sm:p-8">
      <p className="text-[11px] font-bold uppercase tracking-[.2em] text-discord-text-muted">Sekai</p>
      <h1 className="mt-2 text-2xl font-bold text-discord-header-primary">Confirme sua identidade</h1>
      <p className="mt-2 text-sm leading-6 text-discord-text-muted">Digite o código temporário do seu aplicativo autenticador.</p>
      {loading ? <p role="status" className="mt-5 text-sm text-discord-text-muted">Verificando o método de autenticação…</p> : <>
        <label className="mt-5 block text-xs font-semibold text-discord-text-muted">Código de verificação
          <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} className="settings-field mt-2" />
        </label>
        {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
        <button type="submit" disabled={busy || !factorId} className="mt-5 w-full rounded-xl bg-theme-gradient py-3 font-semibold text-white disabled:opacity-60">{busy ? "Verificando…" : "Continuar"}</button>
      </>}
      <button type="button" onClick={onCancel} className="mt-3 w-full text-sm text-discord-text-muted hover:text-white">Sair</button>
    </form>
  </main>;
}
