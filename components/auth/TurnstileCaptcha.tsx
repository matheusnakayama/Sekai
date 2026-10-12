"use client";

import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (container: HTMLElement, options: {
    sitekey: string;
    theme?: "light" | "dark" | "auto";
    callback: (token: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
  }) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type Props = {
  resetKey: number;
  onToken: (token: string) => void;
};

const SCRIPT_ID = "sekai-turnstile-script";

export function TurnstileCaptcha({ resetKey, onToken }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string>("");
  const onTokenRef = useRef(onToken);
  const [siteKey, setSiteKey] = useState("");
  const [message, setMessage] = useState("Carregando verificação…");

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/captcha-config", { cache: "no-store" })
      .then(async (response): Promise<{ siteKey?: string }> => response.ok ? response.json() as Promise<{ siteKey?: string }> : {})
      .then((config) => {
        if (cancelled) return;
        if (typeof config.siteKey !== "string" || config.siteKey.length < 1 || config.siteKey.length > 200) {
          setMessage("A verificação anti-bot não está configurada.");
          return;
        }
        setSiteKey(config.siteKey);
      })
      .catch(() => {
        if (!cancelled) setMessage("Não foi possível carregar a verificação anti-bot.");
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!siteKey || !hostRef.current) return;

    let cancelled = false;
    const renderWidget = () => {
      if (cancelled || !hostRef.current || !window.turnstile) return;
      if (widgetIdRef.current) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = window.turnstile.render(hostRef.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: (token) => { setMessage(""); onTokenRef.current(token); },
        "expired-callback": () => { setMessage("A verificação expirou. Conclua novamente."); onTokenRef.current(""); },
        "error-callback": () => { setMessage("A verificação falhou. Tente novamente."); onTokenRef.current(""); },
      });
      setMessage("Conclua a verificação para continuar.");
    };

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (window.turnstile) renderWidget();
    else if (existing) existing.addEventListener("load", renderWidget, { once: true });
    else {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", renderWidget, { once: true });
      script.addEventListener("error", () => setMessage("A verificação anti-bot está indisponível."), { once: true });
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = "";
      }
    };
  }, [siteKey, resetKey]);

  return (
    <div className="mb-4">
      <p className="mb-2 text-xs text-discord-text-muted">Verificação anti-bot</p>
      <div ref={hostRef} aria-label="Verificação Cloudflare Turnstile" />
      {message && <p role="status" className="mt-2 text-xs text-discord-text-muted">{message}</p>}
    </div>
  );
}
