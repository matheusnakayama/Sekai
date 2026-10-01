import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sekai",
  description: "Comunicação em tempo real para você e seus amigos",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="h-screen w-screen overflow-hidden bg-discord-bg-primary">
        {children}
      </body>
    </html>
  );
}
