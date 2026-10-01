"use client";

import { useState } from "react";
import { X, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface UserSettingsModalProps {
  userId: string;
  initial: {
    displayName: string;
    bio?: string | null;
    customStatus?: string | null;
    avatarUrl?: string | null;
  };
  onClose: () => void;
  onSaved: () => void;
}

export function UserSettingsModal({ userId, initial, onClose, onSaved }: UserSettingsModalProps) {
  const supabase = createClient();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [bio, setBio] = useState(initial.bio ?? "");
  const [customStatus, setCustomStatus] = useState(initial.customStatus ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(initial.avatarUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    setSaving(true);
    setError("");

    let avatarUrl = initial.avatarUrl ?? null;

    if (avatarFile) {
      const ext = avatarFile.name.split(".").pop();
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, { upsert: true });

      if (uploadError) {
        setSaving(false);
        setError("Falha ao enviar imagem: " + uploadError.message);
        return;
      }
      avatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim(),
        bio: bio.trim() || null,
        custom_status: customStatus.trim() || null,
        avatar_url: avatarUrl,
      })
      .eq("id", userId);

    setSaving(false);

    if (updateError) {
      setError("Falha ao salvar: " + updateError.message);
      return;
    }

    onSaved();
    onClose();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-lg bg-discord-bg-secondary p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-discord-header-primary">Configurações de usuário</h2>
          <button onClick={onClose} className="text-discord-text-muted hover:text-discord-text-normal">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-discord-brand">
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl font-bold text-white">
                {displayName[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <label className="cursor-pointer rounded bg-discord-bg-primary px-3 py-2 text-sm text-discord-text-normal hover:bg-discord-bg-modifier-hover">
            Trocar avatar
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
          </label>
        </div>

        <label className="mb-3 block text-xs font-semibold uppercase text-discord-text-muted">
          Nome de exibição
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full rounded bg-discord-bg-primary px-3 py-2 text-discord-text-normal focus:outline-none"
          />
        </label>

        <label className="mb-3 block text-xs font-semibold uppercase text-discord-text-muted">
          Status personalizado
          <input
            value={customStatus}
            maxLength={128}
            onChange={(e) => setCustomStatus(e.target.value)}
            placeholder="O que você está fazendo?"
            className="mt-1 w-full rounded bg-discord-bg-primary px-3 py-2 text-discord-text-normal focus:outline-none"
          />
        </label>

        <label className="mb-4 block text-xs font-semibold uppercase text-discord-text-muted">
          Bio
          <textarea
            value={bio}
            maxLength={190}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            className="mt-1 w-full resize-none rounded bg-discord-bg-primary px-3 py-2 text-discord-text-normal focus:outline-none"
          />
        </label>

        {error && <p className="mb-3 text-sm text-discord-danger">{error}</p>}

        <div className="flex items-center justify-between">
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-discord-danger hover:underline"
          >
            <LogOut className="h-4 w-4" /> Sair da conta
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-discord-brand px-4 py-2 text-sm font-medium text-white hover:bg-discord-brand-hover disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
