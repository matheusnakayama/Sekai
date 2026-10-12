import { NextResponse } from "next/server";
import { accentVariables, colorsForMode } from "@/lib/colorMode";
import { complementaryLinkColor, complementaryLogoColor } from "@/lib/linkColor";
import { DEFAULT_THEME, STYLESHEET_THEME_IDS, THEMES } from "@/lib/themes";

export const dynamic = "force-static";

const linkColors = Object.fromEntries(THEMES.map((theme) => [theme.id, complementaryLinkColor(theme.stops)]));
const logoColors = Object.fromEntries(THEMES.map((theme) => [theme.id, complementaryLogoColor(theme.stops)]));
const stylesheetThemes = new Set<string>(STYLESHEET_THEME_IDS);
const darkAccents = Object.fromEntries(THEMES.map((theme) => {
  const stops = colorsForMode(theme.stops, "dark");
  const background = colorsForMode(theme.backgroundStops ?? [theme.stops[0], theme.stops[6]], "dark") as [string, string];
  return [theme.id, accentVariables(stops, background, stylesheetThemes.has(theme.id) ? 0.3 : 0.48)];
}));

const source = `try{var m=${JSON.stringify(linkColors)};var l=${JSON.stringify(logoColors)};var d=${JSON.stringify(darkAccents)};var t=localStorage.getItem('sekai-theme');var active=t&&l[t]?t:${JSON.stringify(DEFAULT_THEME)};var mode=localStorage.getItem('sekai-color-mode');var storedAccent=localStorage.getItem('sekai-detail-accent');var customAccent=/^#[0-9a-f]{6}$/i.test(storedAccent||'')?storedAccent:null;var root=document.documentElement;root.setAttribute('data-theme',active);if(m[active])root.style.setProperty('--sekai-link',m[active]);var detailAccent=customAccent||l[active];if(detailAccent){root.style.setProperty('--sekai-logo-accent',detailAccent);root.style.setProperty('--sekai-detail-accent',detailAccent)}if(mode==='dark'){root.setAttribute('data-color-mode','dark');var pack=d[active];if(pack){for(var k in pack)root.style.setProperty(k,pack[k])}}else{root.setAttribute('data-color-mode','light')}}catch(e){}`;

export function GET() {
  return new NextResponse(source, {
    headers: {
      "Cache-Control": "public, max-age=3600, immutable",
      "Content-Type": "application/javascript; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
