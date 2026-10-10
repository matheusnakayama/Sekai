import type { Metadata } from "next";
import type { Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { DialogProvider } from "@/components/DialogProvider";
import { FloatingYoutubeCharm } from "@/components/FloatingYoutubeCharm";
import { accentVariables, colorsForMode } from "@/lib/colorMode";
import { complementaryLinkColor } from "@/lib/linkColor";
import { STYLESHEET_THEME_IDS, THEMES } from "@/lib/themes";

const linkColors = Object.fromEntries(THEMES.map((theme) => [theme.id, complementaryLinkColor(theme.stops)]));
const stylesheetThemes = new Set<string>(STYLESHEET_THEME_IDS);
const darkAccents = Object.fromEntries(THEMES.map((theme) => {
  const stops = colorsForMode(theme.stops, "dark");
  const background = colorsForMode(theme.backgroundStops ?? [theme.stops[0], theme.stops[6]], "dark") as [string, string];
  return [theme.id, accentVariables(stops, background, stylesheetThemes.has(theme.id) ? 0.3 : 0.48)];
}));

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
              `try{var m=${JSON.stringify(linkColors)};var d=${JSON.stringify(darkAccents)};var t=localStorage.getItem('sekai-theme');var mode=localStorage.getItem('sekai-color-mode');var root=document.documentElement;if(t){root.setAttribute('data-theme',t);if(m[t])root.style.setProperty('--sekai-link',m[t])}if(mode==='dark'){root.setAttribute('data-color-mode','dark');var pack=d[t];if(pack){for(var k in pack)root.style.setProperty(k,pack[k])}}else{root.setAttribute('data-color-mode','light')}}catch(e){}`,
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
