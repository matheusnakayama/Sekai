"use client";

import Image from "next/image";

export function FloatingYoutubeCharm() {
  return (
    <a
      href="https://www.youtube.com/"
      aria-label="Abrir o YouTube"
      title="Abrir o YouTube"
      className="youtube-charm group fixed bottom-5 right-5 z-[110] grid h-14 w-14 place-items-center rounded-full border border-white/15 bg-[#09090b] shadow-xl shadow-black/40 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:scale-110 hover:border-discord-brand/70 hover:shadow-[0_0_28px_rgba(88,101,242,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-discord-brand focus-visible:ring-offset-2 focus-visible:ring-offset-discord-bg-primary"
    >
      <span className="pointer-events-none absolute inset-0 rounded-full bg-theme-gradient opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-35" />
      <Image
        src="/shinji-charm.gif"
        alt=""
        width={56}
        height={56}
        unoptimized
        className="relative h-full w-full rounded-full object-cover mix-blend-screen transition-transform duration-300 group-hover:rotate-6"
      />
    </a>
  );
}
