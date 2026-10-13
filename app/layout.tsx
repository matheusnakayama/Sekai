import type { Metadata } from "next";
import type { Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { DialogProvider } from "@/components/DialogProvider";
import { FloatingYoutubeCharm } from "@/components/FloatingYoutubeCharm";
import { SEKAI_LOGO_RED } from "@/lib/brandAssets";

// O CSP com nonce precisa renderizar por requisicao para que o Next aplique o
// nonce recebido do middleware aos scripts internos do framework.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sekai",
  description: "Comunicação em tempo real para você e seus amigos",
  icons: {
    icon: SEKAI_LOGO_RED,
    shortcut: SEKAI_LOGO_RED,
    apple: SEKAI_LOGO_RED,
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
        {/* Aplica o tema salvo antes da primeira pintura, para não piscar a cor padrão.
            Script síncrono comum (permitido pelo CSP via 'self'): o next/script com
            beforeInteractive injeta `nonce` e o navegador o esconde no DOM (nonce=""),
            causando o erro de hidratação. */}
        <script src="/theme-init.js" suppressHydrationWarning />
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
