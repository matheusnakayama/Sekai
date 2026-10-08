export interface ServerTemplateCategory {
  name: string;
  channels: { name: string; type: "text" | "voice" }[];
}

export interface ServerTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  categories: ServerTemplateCategory[];
}

export const SERVER_TEMPLATES: ServerTemplate[] = [
  {
    id: "basic",
    name: "Básico",
    description: "Uma base organizada para qualquer comunidade.",
    icon: "✦",
    categories: [
      { name: "INFORMAÇÕES", channels: [{ name: "regras", type: "text" }, { name: "anúncios", type: "text" }] },
      { name: "TEXTO", channels: [{ name: "geral", type: "text" }, { name: "mídia", type: "text" }] },
      { name: "VOZ", channels: [{ name: "Sala 1", type: "voice" }, { name: "Sala 2", type: "voice" }] },
    ],
  },
  {
    id: "games",
    name: "Jogos",
    description: "Monte grupos, combine partidas e converse durante o jogo.",
    icon: "🎮",
    categories: [
      { name: "INFORMAÇÕES", channels: [{ name: "regras", type: "text" }, { name: "anúncios", type: "text" }] },
      { name: "JOGOS", channels: [{ name: "procurando-grupo", type: "text" }, { name: "clips-e-mídia", type: "text" }] },
      { name: "SALAS DE VOZ", channels: [{ name: "Grupo 1", type: "voice" }, { name: "Grupo 2", type: "voice" }, { name: "AFK", type: "voice" }] },
    ],
  },
  {
    id: "study",
    name: "Estudos",
    description: "Separe matérias, dúvidas e salas de estudo em foco.",
    icon: "📚",
    categories: [
      { name: "COMECE AQUI", channels: [{ name: "avisos", type: "text" }, { name: "materiais", type: "text" }] },
      { name: "MATÉRIAS", channels: [{ name: "geral", type: "text" }, { name: "dúvidas", type: "text" }] },
      { name: "ESTUDO EM VOZ", channels: [{ name: "Sala silenciosa", type: "voice" }, { name: "Grupo de estudo", type: "voice" }] },
    ],
  },
  {
    id: "creator",
    name: "Criadores",
    description: "Organize ideias, projetos, feedback e gravações.",
    icon: "🎨",
    categories: [
      { name: "COMUNIDADE", channels: [{ name: "anúncios", type: "text" }, { name: "apresentações", type: "text" }] },
      { name: "PRODUÇÃO", channels: [{ name: "ideias", type: "text" }, { name: "feedback", type: "text" }, { name: "referências", type: "text" }] },
      { name: "GRAVAÇÃO", channels: [{ name: "Estúdio", type: "voice" }, { name: "Conversa", type: "voice" }] },
    ],
  },
  {
    id: "friends",
    name: "Amigos",
    description: "Um espaço simples para conversar e entrar em chamada.",
    icon: "☕",
    categories: [
      { name: "PONTO DE ENCONTRO", channels: [{ name: "geral", type: "text" }, { name: "fotos-e-vídeos", type: "text" }] },
      { name: "CONVERSAS", channels: [{ name: "Conversa 1", type: "voice" }, { name: "Conversa 2", type: "voice" }] },
    ],
  },
];

export function getServerTemplate(id: string) {
  return SERVER_TEMPLATES.find((template) => template.id === id) ?? SERVER_TEMPLATES[0];
}
