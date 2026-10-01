"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Janelas do próprio site no lugar de window.prompt / confirm / alert        */
/*  Uso:  const dialogs = useDialogs();                                         */
/*        if (await dialogs.confirm({ title, message })) { ... }               */
/*        const nome = await dialogs.prompt({ title, label });  // null = cancelou */
/*        await dialogs.notify({ title, message });                            */
/* -------------------------------------------------------------------------- */

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Botão vermelho (padrão). Use false para ações que não são destrutivas. */
  danger?: boolean;
}

interface PromptOptions {
  title: string;
  label?: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  /** Se true, aceita enviar vazio (ex.: motivo opcional). */
  allowEmpty?: boolean;
  maxLength?: number;
}

interface NoticeOptions {
  title?: string;
  message: string;
  buttonLabel?: string;
}

interface DialogApi {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
  notify: (options: NoticeOptions) => Promise<void>;
}

type ActiveDialog =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void }
  | { kind: "notice"; options: NoticeOptions; resolve: () => void };

const DialogContext = createContext<DialogApi | null>(null);

export function useDialogs(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) throw new Error("useDialogs precisa estar dentro de <DialogProvider>.");
  return api;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  // Fila: se duas janelas forem pedidas ao mesmo tempo, aparecem uma de cada vez.
  const [queue, setQueue] = useState<ActiveDialog[]>([]);

  const enqueue = useCallback((dialog: ActiveDialog) => {
    setQueue((current) => [...current, dialog]);
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      confirm: (options) => new Promise<boolean>((resolve) => enqueue({ kind: "confirm", options, resolve })),
      prompt: (options) => new Promise<string | null>((resolve) => enqueue({ kind: "prompt", options, resolve })),
      notify: (options) => new Promise<void>((resolve) => enqueue({ kind: "notice", options, resolve })),
    }),
    [enqueue]
  );

  const current = queue[0];
  const close = () => setQueue((items) => items.slice(1));

  return (
    <DialogContext.Provider value={api}>
      {children}

      {current?.kind === "confirm" && (
        <ConfirmView
          options={current.options}
          onConfirm={() => {
            current.resolve(true);
            close();
          }}
          onCancel={() => {
            current.resolve(false);
            close();
          }}
        />
      )}

      {current?.kind === "prompt" && (
        <PromptView
          options={current.options}
          onSubmit={(value) => {
            current.resolve(value);
            close();
          }}
          onCancel={() => {
            current.resolve(null);
            close();
          }}
        />
      )}

      {current?.kind === "notice" && (
        <NoticeView
          options={current.options}
          onClose={() => {
            current.resolve();
            close();
          }}
        />
      )}
    </DialogContext.Provider>
  );
}

/* ------------------------------ peças visuais ------------------------------ */

function Overlay({ onDismiss, children }: { onDismiss: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4 animate-fadeIn"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      {children}
    </div>
  );
}

function PrimaryButton({
  danger,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      {...props}
      className={cn(
        "rounded px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50",
        danger ? "bg-discord-danger hover:bg-discord-danger-hover" : "bg-theme-gradient hover:brightness-110",
        className
      )}
    />
  );
}

function ConfirmView({
  options,
  onConfirm,
  onCancel,
}: {
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { title, message, confirmLabel = "Confirmar", cancelLabel = "Cancelar", danger = true } = options;
  return (
    <Overlay onDismiss={onCancel}>
      <div role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-lg bg-discord-bg-secondary p-5 shadow-xl">
        <h3 className="mb-2 text-base font-bold text-discord-header-primary">{title}</h3>
        <p className="mb-5 text-sm text-discord-text-normal">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="text-sm text-discord-text-muted hover:underline">
            {cancelLabel}
          </button>
          <PrimaryButton autoFocus danger={danger} onClick={onConfirm}>
            {confirmLabel}
          </PrimaryButton>
        </div>
      </div>
    </Overlay>
  );
}

function PromptView({
  options,
  onSubmit,
  onCancel,
}: {
  options: PromptOptions;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const {
    title,
    label,
    description,
    placeholder,
    defaultValue = "",
    confirmLabel = "Confirmar",
    allowEmpty = false,
    maxLength = 100,
  } = options;
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const trimmed = value.trim();
  const canSubmit = allowEmpty || trimmed.length > 0;

  function submit() {
    if (canSubmit) onSubmit(trimmed);
  }

  return (
    <Overlay onDismiss={onCancel}>
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-lg bg-discord-bg-secondary p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-discord-header-primary">{title}</h2>
          <button onClick={onCancel} aria-label="Fechar" className="text-discord-text-muted hover:text-discord-text-normal">
            <X className="h-5 w-5" />
          </button>
        </div>

        {description && <p className="mb-4 text-sm text-discord-text-muted">{description}</p>}

        {label && (
          <label className="mb-1 block text-xs font-semibold uppercase text-discord-text-muted">{label}</label>
        )}
        <input
          ref={inputRef}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          className="mb-5 w-full rounded bg-discord-bg-primary px-3 py-2.5 text-discord-text-normal focus:outline-none"
        />

        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="text-sm text-discord-text-muted hover:underline">
            Cancelar
          </button>
          <PrimaryButton disabled={!canSubmit} onClick={submit}>
            {confirmLabel}
          </PrimaryButton>
        </div>
      </div>
    </Overlay>
  );
}

function NoticeView({ options, onClose }: { options: NoticeOptions; onClose: () => void }) {
  const { title = "Algo deu errado", message, buttonLabel = "Entendi" } = options;
  return (
    <Overlay onDismiss={onClose}>
      <div role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-lg bg-discord-bg-secondary p-5 shadow-xl">
        <div className="mb-2 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0 text-discord-danger" aria-hidden="true" />
          <h3 className="text-base font-bold text-discord-header-primary">{title}</h3>
        </div>
        <p className="mb-5 break-words text-sm text-discord-text-normal">{message}</p>
        <div className="flex justify-end">
          <PrimaryButton autoFocus onClick={onClose}>
            {buttonLabel}
          </PrimaryButton>
        </div>
      </div>
    </Overlay>
  );
}
