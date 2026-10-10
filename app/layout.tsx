import type { Metadata } from "next";
import type { Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { DialogProvider } from "@/components/DialogProvider";
import { FloatingYoutubeCharm } from "@/components/FloatingYoutubeCharm";
import { complementaryLinkColor } from "@/lib/linkColor";
import { THEMES } from "@/lib/themes";

const linkColors = Object.fromEntries(THEMES.map((theme) => [theme.id, complementaryLinkColor(theme.stops)]));

export const metadata: Metadata = {
  title: "Sekai",
  description: "Comunicação em tempo real para você e seus amigos",
  icons: {
    icon: "/sekai-symbol.jpg",
    shortcut: "/sekai-symbol.jpg",
    apple: "/sekai-symbol.jpg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <head>
        {/* Aplica o tema salvo antes da primeira pintura, para não piscar a cor padrão. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              `try{var m=${JSON.stringify(linkColors)};var t=localStorage.getItem('sekai-theme');if(t){document.documentElement.setAttribute('data-theme',t);if(m[t])document.documentElement.style.setProperty('--sekai-link',m[t])}}catch(e){}`,
          }}
        />
      </head>
      <body className="h-[100dvh] w-full overflow-hidden bg-discord-bg-primary">
        <DialogProvider>
          {children}
          <FloatingYoutubeCharm />
        </DialogProvider>
      </body>
    </html>
  );
}
