import type { Metadata } from "next";
import type { Viewport } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import "./globals.css";
import { DialogProvider } from "@/components/DialogProvider";
import { FloatingYoutubeCharm } from "@/components/FloatingYoutubeCharm";
import { accentVariables, colorsForMode } from "@/lib/colorMode";
import { complementaryLinkColor, complementaryLogoColor } from "@/lib/linkColor";
import { DEFAULT_THEME, STYLESHEET_THEME_IDS, THEMES } from "@/lib/themes";
import { SEKAI_LOGO_RED } from "@/lib/brandAssets";

const linkColors = Object.fromEntries(THEMES.map((theme) => [theme.id, complementaryLinkColor(theme.stops)]));
const logoColors = Object.fromEntries(THEMES.map((theme) => [theme.id, complementaryLogoColor(theme.stops)]));
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
  const nonce = headers().get("x-nonce") ?? undefined;
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <head>
        {/* Aplica o tema salvo antes da primeira pintura, para não piscar a cor padrão. */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html:
              `try{var m=${JSON.stringify(linkColors)};var l=${JSON.stringify(logoColors)};var d=${JSON.stringify(darkAccents)};var t=localStorage.getItem('sekai-theme');var active=t&&l[t]?t:${JSON.stringify(DEFAULT_THEME)};var mode=localStorage.getItem('sekai-color-mode');var storedAccent=localStorage.getItem('sekai-detail-accent');var customAccent=/^#[0-9a-f]{6}$/i.test(storedAccent||'')?storedAccent:null;var root=document.documentElement;root.setAttribute('data-theme',active);if(m[active])root.style.setProperty('--sekai-link',m[active]);var detailAccent=customAccent||l[active];if(detailAccent){root.style.setProperty('--sekai-logo-accent',detailAccent);root.style.setProperty('--sekai-detail-accent',detailAccent)}if(mode==='dark'){root.setAttribute('data-color-mode','dark');var pack=d[active];if(pack){for(var k in pack)root.style.setProperty(k,pack[k])}}else{root.setAttribute('data-color-mode','light')}}catch(e){}`,
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
