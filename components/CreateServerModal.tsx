"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SERVER_TEMPLATES } from "@/lib/serverTemplates";

interface CreateServerModalProps {
  onClose: () => void;
  onCreate: (name: string, iconFile: File | null, templateId: string) => Promise<void>;
  onJoin: (code: string) => Promise<void>;
}

export function CreateServerModal({ onClose, onCreate, onJoin }: CreateServerModalProps) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState("");
  const [templateId, setTemplateId] = useState("basic");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleIconPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.currentTarget.value = "";
    if (!file.type.startsWith("image/")) { setError("Escolha um arquivo de imagem."); return; }
    if (file.size > 8 * 1024 * 1024) { setError("O ícone deve ter no máximo 8 MB."); return; }
    setError("");
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
        await onCreate(name.trim(), iconFile, templateId);
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
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-lg bg-discord-bg-secondary p-6 shadow-xl">
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
                <input type="file" accept="image/gif,image/*" className="hidden" onChange={handleIconPick} />
              </label>
              <span className="text-xs text-discord-text-muted">GIF animado, PNG ou JPG · até 8 MB</span>
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
            <p className="mb-2 mt-3 text-xs font-semibold uppercase tracking-wide text-discord-text-muted">Escolha um modelo</p>
            <div className="grid max-h-52 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {SERVER_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setTemplateId(template.id)}
                  aria-pressed={templateId === template.id}
                  className={cn(
                    "flex min-h-[72px] items-start gap-3 rounded-lg border p-3 text-left transition",
                    templateId === template.id
                      ? "border-discord-brand bg-discord-brand/15 ring-1 ring-discord-brand/40"
                      : "border-white/10 bg-discord-bg-primary/60 hover:border-white/20 hover:bg-discord-bg-primary"
                  )}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-theme-gradient text-lg text-white">{template.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-discord-header-primary">{template.name}</span>
                    <span className="mt-0.5 block line-clamp-2 text-xs leading-4 text-discord-text-muted">{template.description}</span>
                  </span>
                </button>
              ))}
            </div>
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
