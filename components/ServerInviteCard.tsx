"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inviteUrl } from "@/lib/invites";
import { loadInvitePreview, type ServerInvitePreview } from "@/lib/invitePreview";

export type { ServerInvitePreview };

const previewCache = new Map<string, ServerInvitePreview | null>();

function sinceLabel(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" }).format(date);
  return `Desde ${formatted}`;
}

export function ServerInviteCard({
  code,
  preview,
  href,
  previewOnly = false,
}: {
  code: string;
  preview?: ServerInvitePreview | null;
  href?: string;
  previewOnly?: boolean;
}) {
  const name = preview?.name?.trim() || "Servidor";
  const initial = name.charAt(0).toUpperCase() || "S";
  const since = preview?.createdAt ? sinceLabel(preview.createdAt) : null;
  const destination = href ?? inviteUrl(code);
  const className = "group mt-2 block w-full max-w-[320px] overflow-hidden rounded-lg bg-[#111214] no-underline shadow-lg ring-1 ring-black/40";
  const body = (
    <>
      <div className="h-[76px] bg-[#4f3d86]">
        {preview?.bannerUrl ? (
          <img src={preview.bannerUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-r from-[#6a4cc4] via-[#7a5af8] to-[#9b6dff]" />
        )}
      </div>
      <div className="px-4 pb-4">
        <div className="-mt-7 mb-2 grid h-[68px] w-[68px] place-items-center overflow-hidden rounded-[22px] border-[5px] border-[#111214] bg-[#1e1f22] text-xl font-bold text-white">
          {preview?.iconUrl ? <img src={preview.iconUrl} alt="" className="h-full w-full object-cover" /> : initial}
        </div>
        <p className="truncate text-[16px] font-bold leading-5 text-white">{name}</p>
        {(preview?.online != null || preview?.members != null) && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#b5bac1]">
            {preview.online != null && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#23a559]" />
                {preview.online} online
              </span>
            )}
            {preview.members != null && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#80848e]" />
                {preview.members === 1 ? "1 membro" : `${preview.members} membros`}
              </span>
            )}
          </p>
        )}
        {since && <p className="mt-1 text-[13px] text-[#b5bac1]">{since}</p>}
        <span className="mt-3 flex h-10 items-center justify-center rounded-[3px] bg-[#23a559] text-sm font-medium text-white transition group-hover:bg-[#1a9c4e]">
          Ir para o Servidor
        </span>
      </div>
    </>
  );

  if (previewOnly) return <div className={className}>{body}</div>;
  return <a href={destination} className={className}>{body}</a>;
}

export function ServerInviteEmbed({ code }: { code: string }) {
  const normalized = code.trim();
  const cached = previewCache.get(normalized.toUpperCase()) ?? null;
  const [preview, setPreview] = useState<ServerInvitePreview | null>(cached);
  const [ready, setReady] = useState(Boolean(cached));
  const supabase = createClient();

  useEffect(() => {
    const key = normalized.toUpperCase();
    const cached = previewCache.get(key);
    if (cached) {
      setPreview(cached);
      setReady(true);
      return;
    }
    let cancelled = false;
    void loadInvitePreview(supabase, normalized).then((next) => {
      if (cancelled) return;
      if (next) previewCache.set(key, next);
      setPreview(next);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [normalized, supabase]);

  if (!ready) return <div className="mt-2 h-44 w-full max-w-[320px] animate-pulse rounded-lg bg-[#111214]" aria-hidden="true" />;
  return <ServerInviteCard code={normalized} preview={preview} />;
}
