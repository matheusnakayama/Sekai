"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type TotpFactor = { id: string; friendly_name?: string; status: "verified" | "unverified" };
type Enrollment = { id: string; qrCode: string; secret: string };

export function MfaSettings() {
  const supabase = createClient();
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadFactors = useCallback(async () => {
    const { data, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) {
      setError("Não foi possível consultar a autenticação em duas etapas.");
      return;
    }
    setFactors((data.totp ?? []).map(({ id, friendly_name, status }) => ({ id, friendly_name, status })));
  }, [supabase]);

  useEffect(() => { void loadFactors(); }, [loadFactors]);

  async function beginEnrollment() {
    setBusy(true); setError(""); setMessage("");
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Sekai TOTP" });
    setBusy(false);
    if (enrollError || data.type !== "totp") {
      setError("Não foi possível iniciar a configuração do autenticador.");
      return;
    }
    setEnrollment({ id: data.id, qrCode: `data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`, secret: data.totp.secret });
    setMessage("Leia o QR code no seu autenticador e informe o código de seis dígitos.");
  }

  async function verifyEnrollment() {
    if (!enrollment || !/^\d{6,8}$/.test(code)) {
      setError("Informe o código numérico atual do autenticador.");
      return;
    }
    setBusy(true); setError("");
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.id, code });
    setBusy(false);
    if (verifyError) {
      setError("Código inválido ou expirado. Confira o relógio do autenticador e tente novamente.");
      return;
    }
    setEnrollment(null); setCode("");
    setMessage("Autenticação em duas etapas ativada.");
    await loadFactors();
  }

  async function removeFactor(factor: TotpFactor) {
    if (factor.status !== "verified") {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (unenrollError) setError("Não foi possível remover o autenticador pendente.");
      else { setMessage("Configuração pendente removida."); await loadFactors(); }
      return;
    }
    if (!/^\d{6,8}$/.test(code)) {
      setError("Informe o código atual para remover o autenticador.");
      return;
    }
    setBusy(true); setError("");
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (verifyError) {
      setBusy(false); setError("Código inválido ou expirado.");
      return;
    }
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    setBusy(false); setCode("");
    if (unenrollError) setError("Não foi possível remover o autenticador.");
    else { setMessage("Autenticador removido."); await loadFactors(); }
  }

  return (
    <section className="mb-5 rounded-xl border border-white/5 bg-discord-bg-primary p-5">
      <h4 className="font-semibold text-discord-header-primary">Autenticação em duas etapas (TOTP)</h4>
      <p className="mt-1 text-sm leading-6 text-discord-text-muted">Use um aplicativo autenticador compatível. O requisito para administradores depende da política de segurança do projeto.</p>
      {factors.filter((factor) => factor.status === "verified").map((factor) => <div key={factor.id} className="mt-4 rounded-lg border border-emerald-500/20 p-3">
        <p className="text-sm text-emerald-300">Ativo{factor.friendly_name ? `: ${factor.friendly_name}` : ""}</p>
        <label className="mt-3 block text-xs text-discord-text-muted">Código atual para remover
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} className="settings-field mt-2" />
        </label>
        <button type="button" disabled={busy} onClick={() => void removeFactor(factor)} className="mt-3 rounded-lg border border-rose-500/30 px-3 py-2 text-sm text-rose-300 disabled:opacity-50">Remover autenticador</button>
      </div>)}
      {enrollment && <div className="mt-4 rounded-lg border border-white/10 p-4">
        <img src={enrollment.qrCode} alt="QR code para configurar o autenticador" className="mx-auto h-48 w-48 bg-white p-2" />
        <p className="mt-3 text-xs text-discord-text-muted">Se não puder ler o QR code, informe esta chave manualmente:</p>
        <code className="mt-1 block break-all select-all text-xs text-discord-text-normal">{enrollment.secret}</code>
        <label className="mt-4 block text-xs text-discord-text-muted">Código do autenticador
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} className="settings-field mt-2" />
        </label>
        <button type="button" disabled={busy || !code} onClick={() => void verifyEnrollment()} className="mt-3 rounded-lg bg-discord-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Verificando…" : "Confirmar autenticador"}</button>
      </div>}
      {!enrollment && !factors.some((factor) => factor.status === "verified") && <button type="button" disabled={busy} onClick={() => void beginEnrollment()} className="mt-4 rounded-lg bg-discord-bg-modifier-hover px-4 py-2.5 text-sm font-semibold text-discord-text-normal disabled:opacity-50">{busy ? "Preparando…" : "Configurar autenticador"}</button>}
      {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
      {message && <p role="status" className="mt-3 text-sm text-discord-text-muted">{message}</p>}
    </section>
  );
}
