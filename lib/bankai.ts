import type { ThemeOption } from "@/lib/themes";

export interface BankaiReward {
  id: string;
  badgeId: string;
  character: string;
  bankai: string;
  themeId: string;
  themeName: string;
  icon: string;
  backgroundColor: string;
  foregroundColor: string;
  imageUrl: string;
}

/**
 * As 15 Bankais. Os mesmos ids, nomes e insígnias estão gravados em
 * db/bankai_themes_migration.sql, que faz o sorteio no banco.
 */
export const BANKAIS: BankaiReward[] = [
  { id: "byakuya", badgeId: "b0000001-0000-4000-8000-000000000001", character: "Byakuya Kuchiki", bankai: "Senbonzakura Kageyoshi", themeId: "bankai-byakuya", themeName: "Jardim das Mil Pétalas", icon: "🌸", backgroundColor: "#111118", foregroundColor: "#F4A7C5", imageUrl: "/bankai/byakuya.svg" },
  { id: "renji", badgeId: "b0000001-0000-4000-8000-000000000002", character: "Renji", bankai: "Sōō Zabimaru", themeId: "bankai-renji", themeName: "Reis Serpentes", icon: "🐍", backgroundColor: "#771A2B", foregroundColor: "#C89D43", imageUrl: "/bankai/renji.svg" },
  { id: "rukia", badgeId: "b0000001-0000-4000-8000-000000000003", character: "Rukia", bankai: "Hakka no Togame", themeId: "bankai-rukia", themeName: "Elegia de Gelo", icon: "❄", backgroundColor: "#F3FBFF", foregroundColor: "#8B8CEB", imageUrl: "/bankai/rukia.svg" },
  { id: "toshiro", badgeId: "b0000001-0000-4000-8000-000000000004", character: "Tōshirō", bankai: "Daiguren Hyōrinmaru", themeId: "bankai-toshiro", themeName: "Dragão Boreal", icon: "❄", backgroundColor: "#071A33", foregroundColor: "#A8E8FF", imageUrl: "/bankai/toshiro.svg" },
  { id: "yamamoto", badgeId: "b0000001-0000-4000-8000-000000000005", character: "Yamamoto", bankai: "Zanka no Tachi", themeId: "bankai-yamamoto", themeName: "Cinzas do Sol", icon: "☀", backgroundColor: "#171411", foregroundColor: "#E25525", imageUrl: "/bankai/yamamoto.svg" },
  { id: "shunsui", badgeId: "b0000001-0000-4000-8000-000000000006", character: "Shunsui", bankai: "Katen Kyōkotsu: Karamatsu Shinjū", themeId: "bankai-shunsui", themeName: "Palco da Tragédia", icon: "🌸", backgroundColor: "#17131C", foregroundColor: "#E0CDB0", imageUrl: "/bankai/shunsui.svg" },
  { id: "mayuri", badgeId: "b0000001-0000-4000-8000-000000000007", character: "Mayuri", bankai: "Konjiki Ashisogi Jizō", themeId: "bankai-mayuri", themeName: "Crisálida Dourada", icon: "⚗", backgroundColor: "#4C288C", foregroundColor: "#A7DF4B", imageUrl: "/bankai/mayuri.svg" },
  { id: "soi-fon", badgeId: "b0000001-0000-4000-8000-000000000008", character: "Soi Fon", bankai: "Jakuhō Raikōben", themeId: "bankai-soi-fon", themeName: "Ferrão Relâmpago", icon: "⚡", backgroundColor: "#14191D", foregroundColor: "#F0C449", imageUrl: "/bankai/soi-fon.svg" },
  { id: "urahara", badgeId: "b0000001-0000-4000-8000-000000000009", character: "Urahara", bankai: "Kannonbiraki Benihime Aratame", themeId: "bankai-urahara", themeName: "Costura Carmesim", icon: "✂", backgroundColor: "#202027", foregroundColor: "#8F2638", imageUrl: "/bankai/urahara.svg" },
  { id: "ichigo", badgeId: "b0000001-0000-4000-8000-00000000000a", character: "Ichigo", bankai: "Tensa Zangetsu", themeId: "bankai-ichigo", themeName: "Lua Negra", icon: "🌙", backgroundColor: "#0A0C12", foregroundColor: "#C8313E", imageUrl: "/bankai/ichigo.svg" },
  { id: "komamura", badgeId: "b0000001-0000-4000-8000-00000000000b", character: "Komamura", bankai: "Kokujō Tengen Myō'ō: Dangai Jōe", themeId: "bankai-komamura", themeName: "Armadura do Voto", icon: "🛡", backgroundColor: "#17151A", foregroundColor: "#D7C8B5", imageUrl: "/bankai/komamura.svg" },
  { id: "gin", badgeId: "b0000001-0000-4000-8000-00000000000c", character: "Gin", bankai: "Kamishini no Yari", themeId: "bankai-gin", themeName: "Lâmina Prateada", icon: "⚔", backgroundColor: "#17191E", foregroundColor: "#D9DCE3", imageUrl: "/bankai/gin.svg" },
  { id: "tosen", badgeId: "b0000001-0000-4000-8000-00000000000d", character: "Tōsen", bankai: "Suzumushi Tsuishiki: Enma Kōrogi", themeId: "bankai-tosen", themeName: "Silêncio Índigo", icon: "◉", backgroundColor: "#101427", foregroundColor: "#8EA5C2", imageUrl: "/bankai/tosen.svg" },
  { id: "kensei", badgeId: "b0000001-0000-4000-8000-00000000000e", character: "Kensei", bankai: "Tekken Tachikaze", themeId: "bankai-kensei", themeName: "Punho da Tempestade", icon: "✊", backgroundColor: "#343A43", foregroundColor: "#B94C46", imageUrl: "/bankai/kensei.svg" },
  { id: "rose", badgeId: "b0000001-0000-4000-8000-00000000000f", character: "Rōjūrō “Rose”", bankai: "Kinshara Butōdan", themeId: "bankai-rose", themeName: "Orquestra Dourada", icon: "♪", backgroundColor: "#2C1B2C", foregroundColor: "#CEAA63", imageUrl: "/bankai/rose.svg" },
];

function theme(id: string, name: string, stops: string[], backgroundStops: [string, string], overlay?: ThemeOption["overlay"]): ThemeOption {
  return { id, name, stops, backgroundStops, secret: true, overlay };
}

export const BANKAI_THEMES: ThemeOption[] = [
  theme("bankai-byakuya", "Jardim das Mil Pétalas", ["#F2EEF2", "#F8D0E0", "#F4A7C5", "#E56B9A", "#A84B70", "#4A2A38", "#111118"], ["#2A1A24", "#111118"]),
  theme("bankai-renji", "Reis Serpentes", ["#E6D7C0", "#E4C98A", "#C89D43", "#A67C2E", "#771A2B", "#4C1220", "#1A0C10"], ["#2A1218", "#140C0E"]),
  theme("bankai-rukia", "Elegia de Gelo", ["#F3FBFF", "#D7F6FF", "#8EDDF2", "#6AA8E8", "#8B8CEB", "#3E4A86", "#12182A"], ["#16303A", "#101820"]),
  theme("bankai-toshiro", "Dragão Boreal", ["#F7FDFF", "#D5F4FF", "#A8E8FF", "#5EC4F0", "#2A7CB8", "#123A66", "#071A33"], ["#0C2744", "#071A33"]),
  theme("bankai-yamamoto", "Cinzas do Sol", ["#F6E2C4", "#D99B3D", "#E25525", "#C2411A", "#7A2E16", "#3A2418", "#171411"], ["#241812", "#171411"], "ash"),
  theme("bankai-shunsui", "Palco da Tragédia", ["#E0CDB0", "#C9A98E", "#A86B78", "#61203A", "#8A3A55", "#3A2030", "#17131C"], ["#241820", "#17131C"]),
  theme("bankai-mayuri", "Crisálida Dourada", ["#F4E7B0", "#D6B449", "#A7DF4B", "#7BC23A", "#4C288C", "#2E1A58", "#140E22"], ["#1C1430", "#120E1C"]),
  theme("bankai-soi-fon", "Ferrão Relâmpago", ["#FFE7A3", "#F0C449", "#FF5B83", "#E23A68", "#8A3048", "#243038", "#14191D"], ["#1A2228", "#14191D"]),
  theme("bankai-urahara", "Costura Carmesim", ["#F0E6D9", "#E2C8C4", "#C46A78", "#8F2638", "#6E1E2C", "#3A2228", "#202027"], ["#24181C", "#202027"], "stitch"),
  theme("bankai-ichigo", "Lua Negra", ["#E9E9EE", "#C9CCD4", "#E07A84", "#C8313E", "#8E2430", "#2A1A22", "#0A0C12"], ["#16141A", "#0A0C12"]),
  theme("bankai-komamura", "Armadura do Voto", ["#D7C8B5", "#C4B09A", "#A87880", "#8C2637", "#6A3038", "#32262C", "#17151A"], ["#221C22", "#17151A"]),
  theme("bankai-gin", "Lâmina Prateada", ["#D9DCE3", "#B7BCC8", "#8E96A6", "#C45A66", "#7D1F2B", "#3A2428", "#17191E"], ["#1C1E24", "#17191E"], "slash"),
  theme("bankai-tosen", "Silêncio Índigo", ["#E4EAF2", "#8EA5C2", "#6E86B0", "#493A83", "#332864", "#1C2240", "#101427"], ["#16182C", "#101427"], "rings"),
  theme("bankai-kensei", "Punho da Tempestade", ["#D6C1A1", "#C4A888", "#B94C46", "#8E3A38", "#5C4038", "#343A43", "#1A1E24"], ["#22262C", "#16191E"]),
  theme("bankai-rose", "Orquestra Dourada", ["#F3E2C4", "#CEAA63", "#C7799D", "#A85A82", "#6E3A58", "#3A2438", "#2C1B2C"], ["#2A1C2A", "#1A121C"]),
];
