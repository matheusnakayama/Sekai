"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreateServerModalProps {
  onClose: () => void;
  onCreate: (name: string, iconFile: File | null) => Promise<void>;
  onJoin: (code: string) => Promise<void>;
}

export function CreateServerModal({ onClose, onCreate, onJoin }: CreateServerModalProps) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleIconPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIconFile(file);
    setIconPreview(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    setError("");
    setLoading(true);
    try {
      if (mode === "create") {
        if (!name.trim()) {
          setError("Dê um nome ao seu servidor.");
          return;
        }
        await onCreate(name.trim(), iconFile);
      } else {
        if (!code.trim()) {
          setError("Cole um código de convite.");
          return;
        }
        await onJoin(code.trim());
      }
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Algo deu errado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg bg-discord-bg-secondary p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-discord-header-primary">
            {mode === "create" ? "Crie seu servidor" : "Entrar em um servidor"}
          </h2>
          <button onClick={onClose} className="text-discord-text-muted hover:text-discord-text-normal">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 flex gap-2 rounded-lg bg-discord-bg-primary p-1">
          <button
            onClick={() => setMode("create")}
            className={cn(
              "flex-1 rounded-md py-1.5 text-sm font-medium",
              mode === "create" ? "bg-theme-gradient text-white" : "text-discord-text-muted"
            )}
          >
            Criar
          </button>
          <button
            onClick={() => setMode("join")}
            className={cn(
              "flex-1 rounded-md py-1.5 text-sm font-medium",
              mode === "join" ? "bg-theme-gradient text-white" : "text-discord-text-muted"
            )}
          >
            Já tenho um convite
          </button>
        </div>

        {mode === "create" ? (
          <>
            <p className="mb-4 text-sm text-discord-text-muted">
              Dê um nome e, se quiser, um ícone. Você pode mudar isso depois.
            </p>

            <div className="mb-4 flex items-center gap-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-discord-bg-primary">
                {iconPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={iconPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-discord-text-muted">
                    +
                  </div>
                )}
              </div>
              <label className="cursor-pointer rounded bg-discord-bg-primary px-3 py-2 text-sm text-discord-text-normal hover:bg-discord-bg-modifier-hover">
                Enviar ícone
                <input type="file" accept="image/*" className="hidden" onChange={handleIconPick} />
              </label>
            </div>

            <label className="mb-1 block text-xs font-semibold uppercase text-discord-text-muted">
              Nome do servidor
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Servidor do(a) {seu nome}"
              className="mb-2 w-full rounded bg-discord-bg-primary px-3 py-2.5 text-discord-text-normal focus:outline-none"
            />
          </>
        ) : (
          <>
            <label className="mb-1 block text-xs font-semibold uppercase text-discord-text-muted">
              Código ou link de convite
            </label>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ex: 8f3a1b2c"
              className="mb-2 w-full rounded bg-discord-bg-primary px-3 py-2.5 text-discord-text-normal focus:outline-none"
            />
          </>
        )}

        {error && <p className="mb-2 text-sm text-discord-danger">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="mt-3 w-full rounded bg-theme-gradient py-2.5 font-medium text-white hover:brightness-110 disabled:opacity-60"
        >
          {loading ? "Aguarde..." : mode === "create" ? "Criar servidor" : "Entrar"}
        </button>
      </div>
    </div>
  );
}
