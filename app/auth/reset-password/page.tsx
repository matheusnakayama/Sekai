"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { passwordUpdateSchema } from "@/lib/validation/auth";

export default function ResetPasswordPage() {
  const supabase = createClient();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && (event === "PASSWORD_RECOVERY" || session?.user)) setReady(true);
    });
    void supabase.auth.getUser().then(({ data, error: authError }) => {
      if (active && data.user && !authError) setReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const input = passwordUpdateSchema.safeParse({ password, confirmPassword });
    if (!input.success) {
      setError(input.error.issues[0]?.message ?? "Confira a nova senha.");
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: input.data.password });
    setSaving(false);
    if (updateError) {
      setError("Não foi possível atualizar a senha. Solicite um novo link de redefinição.");
      return;
    }
    setNotice("Senha atualizada. Faça login novamente.");
    await supabase.auth.signOut();
    window.setTimeout(() => router.replace("/"), 1200);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-discord-bg-primary px-4 py-8">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-3xl border border-white/10 bg-discord-bg-secondary p-6 shadow-2xl sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[.2em] text-discord-text-muted">Sekai</p>
        <h1 className="mt-2 text-2xl font-bold text-discord-header-primary">Defina uma nova senha</h1>
        <p className="mt-2 text-sm text-discord-text-muted">Use pelo menos 12 caracteres. Não exigimos combinações artificiais de símbolos.</p>
        {!ready && <p role="status" className="mt-5 text-sm text-discord-text-muted">Validando o link de redefinição…</p>}
        {ready && <>
          <label className="mt-5 block text-xs font-semibold text-discord-text-muted">
            Nova senha
            <input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="settings-field mt-2" />
          </label>
          <label className="mt-4 block text-xs font-semibold text-discord-text-muted">
            Confirmar nova senha
            <input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="settings-field mt-2" />
          </label>
          {error && <p role="alert" className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
          {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">{notice}</p>}
          <button type="submit" disabled={saving || Boolean(notice)} className="mt-5 w-full rounded-xl bg-theme-gradient py-3 font-semibold text-white disabled:opacity-60">
            {saving ? "Atualizando…" : "Atualizar senha"}
          </button>
        </>}
        {!ready && <a href="/" className="mt-5 block text-center text-sm text-discord-text-link hover:underline">Voltar ao login</a>}
      </form>
    </main>
  );
}
