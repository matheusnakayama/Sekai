"use client";

import { useState } from "react";
import { X, Hash, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CategoryOption {
  id: string;
  name: string;
}

interface CreateChannelModalProps {
  categories: CategoryOption[];
  defaultCategoryId: string | null;
  onClose: () => void;
  onCreate: (name: string, type: "text" | "voice", categoryId: string | null) => Promise<void>;
}

export function CreateChannelModal({
  categories,
  defaultCategoryId,
  onClose,
  onCreate,
}: CreateChannelModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"text" | "voice">("text");
  const [categoryId, setCategoryId] = useState<string | null>(defaultCategoryId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Dê um nome ao canal.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onCreate(name.trim().toLowerCase().replace(/\s+/g, "-"), type, categoryId);
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
          <h2 className="text-lg font-bold text-discord-header-primary">Criar canal</h2>
          <button onClick={onClose} className="text-discord-text-muted hover:text-discord-text-normal">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-2 text-xs font-semibold uppercase text-discord-text-muted">Tipo de canal</p>
        <div className="mb-4 space-y-2">
          <button
            onClick={() => setType("text")}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border p-3 text-left",
              type === "text" ? "border-discord-brand bg-discord-brand/10" : "border-transparent bg-discord-bg-primary"
            )}
          >
            <Hash className="h-5 w-5 text-discord-text-muted" />
            <div>
              <p className="text-sm font-medium text-discord-header-primary">Texto</p>
              <p className="text-xs text-discord-text-muted">Enviar mensagens, imagens e links</p>
            </div>
          </button>
          <button
            onClick={() => setType("voice")}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border p-3 text-left",
              type === "voice" ? "border-discord-brand bg-discord-brand/10" : "border-transparent bg-discord-bg-primary"
            )}
          >
            <Volume2 className="h-5 w-5 text-discord-text-muted" />
            <div>
              <p className="text-sm font-medium text-discord-header-primary">Voz</p>
              <p className="text-xs text-discord-text-muted">Conversar por voz, vídeo e tela</p>
            </div>
          </button>
        </div>

        <label className="mb-1 block text-xs font-semibold uppercase text-discord-text-muted">
          Nome do canal
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="novo-canal"
          className="mb-4 w-full rounded bg-discord-bg-primary px-3 py-2.5 text-discord-text-normal focus:outline-none"
        />

        {categories.length > 0 && (
          <>
            <label className="mb-1 block text-xs font-semibold uppercase text-discord-text-muted">
              Categoria
            </label>
            <select
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(e.target.value || null)}
              className="mb-4 w-full rounded bg-discord-bg-primary px-3 py-2.5 text-discord-text-normal focus:outline-none"
            >
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </>
        )}

        {error && <p className="mb-2 text-sm text-discord-danger">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full rounded bg-theme-gradient py-2.5 font-medium text-white hover:brightness-110 disabled:opacity-60"
        >
          {loading ? "Criando..." : "Criar canal"}
        </button>
      </div>
    </div>
  );
}
