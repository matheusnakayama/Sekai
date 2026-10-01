// Bits de permissão idênticos aos do Discord real (mesmos valores do
// public.perm() no banco). Usamos BigInt porque alguns bits passam de 2^32.

export type PermissionBit =
  | "CREATE_INSTANT_INVITE" | "KICK_MEMBERS" | "BAN_MEMBERS" | "ADMINISTRATOR"
  | "MANAGE_CHANNELS" | "MANAGE_GUILD" | "ADD_REACTIONS" | "VIEW_AUDIT_LOG"
  | "VIEW_CHANNEL" | "SEND_MESSAGES" | "MANAGE_MESSAGES" | "EMBED_LINKS"
  | "ATTACH_FILES" | "READ_MESSAGE_HISTORY" | "MENTION_EVERYONE" | "USE_EXTERNAL_EMOJIS"
  | "CONNECT" | "SPEAK" | "MUTE_MEMBERS" | "DEAFEN_MEMBERS" | "MOVE_MEMBERS"
  | "CHANGE_NICKNAME" | "MANAGE_NICKNAMES" | "MANAGE_ROLES" | "MODERATE_MEMBERS";

export const PERMISSIONS: Record<PermissionBit, bigint> = {
  CREATE_INSTANT_INVITE: 1n,
  KICK_MEMBERS: 2n,
  BAN_MEMBERS: 4n,
  ADMINISTRATOR: 8n,
  MANAGE_CHANNELS: 16n,
  MANAGE_GUILD: 32n,
  ADD_REACTIONS: 64n,
  VIEW_AUDIT_LOG: 128n,
  VIEW_CHANNEL: 1024n,
  SEND_MESSAGES: 2048n,
  MANAGE_MESSAGES: 8192n,
  EMBED_LINKS: 16384n,
  ATTACH_FILES: 32768n,
  READ_MESSAGE_HISTORY: 65536n,
  MENTION_EVERYONE: 131072n,
  USE_EXTERNAL_EMOJIS: 262144n,
  CONNECT: 1048576n,
  SPEAK: 2097152n,
  MUTE_MEMBERS: 4194304n,
  DEAFEN_MEMBERS: 8388608n,
  MOVE_MEMBERS: 16777216n,
  CHANGE_NICKNAME: 67108864n,
  MANAGE_NICKNAMES: 134217728n,
  MANAGE_ROLES: 268435456n,
  MODERATE_MEMBERS: 1099511627776n,
};

// O Postgres devolve bigint como string via supabase-js — sempre convertemos por aqui.
export function toBigInt(value: string | number | bigint | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

export function hasPermission(aggregatedPermissions: bigint, bit: PermissionBit): boolean {
  if ((aggregatedPermissions & PERMISSIONS.ADMINISTRATOR) !== 0n) return true;
  return (aggregatedPermissions & PERMISSIONS[bit]) !== 0n;
}

// Soma (OR bit a bit) as permissões de uma lista de cargos do usuário.
export function aggregateRolePermissions(
  rolePermissions: (string | number | bigint | null | undefined)[],
): bigint {
  return rolePermissions.reduce<bigint>((acc, p) => acc | toBigInt(p), 0n);
}

export const PERMISSION_LABELS: Record<PermissionBit, string> = {
  CREATE_INSTANT_INVITE: "Criar convite",
  KICK_MEMBERS: "Expulsar membros",
  BAN_MEMBERS: "Banir membros",
  ADMINISTRATOR: "Administrador (todas as permissões)",
  MANAGE_CHANNELS: "Gerenciar canais",
  MANAGE_GUILD: "Gerenciar servidor",
  ADD_REACTIONS: "Adicionar reações",
  VIEW_AUDIT_LOG: "Ver registro de auditoria",
  VIEW_CHANNEL: "Ver canal",
  SEND_MESSAGES: "Enviar mensagens",
  MANAGE_MESSAGES: "Gerenciar mensagens",
  EMBED_LINKS: "Inserir links",
  ATTACH_FILES: "Anexar arquivos",
  READ_MESSAGE_HISTORY: "Ver histórico de mensagens",
  MENTION_EVERYONE: "Mencionar @everyone",
  USE_EXTERNAL_EMOJIS: "Usar emojis externos",
  CONNECT: "Conectar (voz)",
  SPEAK: "Falar (voz)",
  MUTE_MEMBERS: "Silenciar membros (voz)",
  DEAFEN_MEMBERS: "Ensurdecer membros (voz)",
  MOVE_MEMBERS: "Mover membros entre salas",
  CHANGE_NICKNAME: "Alterar o próprio apelido",
  MANAGE_NICKNAMES: "Gerenciar apelidos",
  MANAGE_ROLES: "Gerenciar cargos",
  MODERATE_MEMBERS: "Timeout (silenciar temporariamente)",
};

export const PERMISSION_GROUPS: { label: string; bits: PermissionBit[] }[] = [
  {
    label: "Geral do servidor",
    bits: ["ADMINISTRATOR", "MANAGE_GUILD", "MANAGE_ROLES", "MANAGE_CHANNELS", "VIEW_AUDIT_LOG", "CREATE_INSTANT_INVITE", "CHANGE_NICKNAME", "MANAGE_NICKNAMES"],
  },
  { label: "Membros", bits: ["KICK_MEMBERS", "BAN_MEMBERS", "MODERATE_MEMBERS"] },
  {
    label: "Texto",
    bits: ["VIEW_CHANNEL", "SEND_MESSAGES", "MANAGE_MESSAGES", "EMBED_LINKS", "ATTACH_FILES", "READ_MESSAGE_HISTORY", "MENTION_EVERYONE", "ADD_REACTIONS", "USE_EXTERNAL_EMOJIS"],
  },
  { label: "Voz", bits: ["CONNECT", "SPEAK", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS"] },
];