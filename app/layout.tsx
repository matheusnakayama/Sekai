import type { Metadata } from "next";
import "./globals.css";
import { DialogProvider } from "@/components/DialogProvider";
import { FloatingYoutubeCharm } from "@/components/FloatingYoutubeCharm";

export const metadata: Metadata = {
  title: "Sekai",
  description: "Comunicação em tempo real para você e seus amigos",
  icons: {
    icon: "/sekai-symbol.jpg",
    shortcut: "/sekai-symbol.jpg",
    apple: "/sekai-symbol.jpg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <head>
        {/* Aplica o tema salvo antes da primeira pintura, para não piscar a cor padrão. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('sekai-theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}",
          }}
        />
      </head>
      <body className="h-screen w-screen overflow-hidden bg-discord-bg-primary">
        <DialogProvider>
          {children}
          <FloatingYoutubeCharm />
        </DialogProvider>
      </body>
    </html>
  );
}
