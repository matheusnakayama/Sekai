import { createClient } from "@/lib/supabase/client";
import type { SlashCommand } from "@/components/ChatArea";

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "clear", description: "Limpa as últimas mensagens do canal", usage: "/clear [quantidade]" },
  { name: "kick", description: "Remove um membro do servidor", usage: "/kick @usuario" },
  { name: "mute", description: "Aplica timeout (silencia) em um membro por X minutos", usage: "/mute @usuario [minutos=10]" },
  { name: "unmute", description: "Remove o mute de um membro", usage: "/unmute @usuario" },
  { name: "help", description: "Lista todos os comandos disponíveis", usage: "/help" },
  { name: "roll", description: "Rola um dado de N lados (padrão 6)", usage: "/roll [N]" },
  { name: "troll", description: "Envia uma simulação visual inofensiva para um membro abrir se quiser", usage: ".troll @usuario" },
];

interface CommandContext {
  serverId: string;
  channelId: string;
  currentUserId: string;
  /** Resolve "@nome" para o user_id do membro dentro do servidor atual */
  resolveMentionToUserId: (mention: string) => Promise<string | null>;
}

export interface CommandResult {
  ok: boolean;
  message: string; // feedback exibido só para quem executou (ex: mensagem de sistema local)
}

/**
 * Executa um slash command já digitado (ex: "/kick @bruno").
 * Toda ação de moderação passa pelas mesmas tabelas protegidas por RLS —
 * ou seja, mesmo que alguém chame a função diretamente, o Postgres barra
 * quem não tiver a permissão (has_permission) certa no servidor.
 */
export async function executeSlashCommand(
  raw: string,
  ctx: CommandContext
): Promise<CommandResult> {
  const supabase = createClient();
  const [cmdName, ...args] = raw.trim().replace(/^[/.]/, "").split(/\s+/);

  switch (cmdName) {
    case "help": {
      const list = SLASH_COMMANDS.map((c) => `**/${c.name}** — ${c.description}`).join("\n");
      return { ok: true, message: list };
    }

    case "roll": {
      const sides = Math.max(2, parseInt(args[0] ?? "6", 10) || 6);
      const result = Math.floor(Math.random() * sides) + 1;
      await supabase.from("messages").insert({
        channel_id: ctx.channelId,
        author_id: ctx.currentUserId,
        content: `🎲 rolou um d${sides} e tirou **${result}**`,
      });
      return { ok: true, message: `Você rolou ${result}` };
    }

    case "troll": {
      const userId = await ctx.resolveMentionToUserId(args[0] ?? "");
      if (!userId) return { ok: false, message: "Usuário não encontrado neste servidor." };
      if (userId === ctx.currentUserId) return { ok: false, message: "Escolha outra pessoa para enviar a simulação." };

      const { error } = await supabase.from("messages").insert({
        channel_id: ctx.channelId,
        author_id: ctx.currentUserId,
        content: `[sekai-troll:${userId}]`,
      });
      return error
        ? { ok: false, message: "Não foi possível enviar o convite da brincadeira." }
        : { ok: true, message: "Convite da simulação enviado. A pessoa decide se quer abrir." };
    }

    case "clear": {
      const amount = Math.min(100, parseInt(args[0] ?? "20", 10) || 20);
      const { data: toDelete } = await supabase
        .from("messages")
        .select("id")
        .eq("channel_id", ctx.channelId)
        .order("created_at", { ascending: false })
        .limit(amount);

      if (!toDelete?.length) return { ok: true, message: "Nada para apagar." };

      // RLS ("messages_delete_own_or_mod") só permite se tiver manage_messages
      const { error } = await supabase
        .from("messages")
        .delete()
        .in("id", toDelete.map((m) => m.id));

      return error
        ? { ok: false, message: "Sem permissão para limpar mensagens." }
        : { ok: true, message: `${toDelete.length} mensagens apagadas.` };
    }

    case "kick": {
      const userId = await ctx.resolveMentionToUserId(args[0] ?? "");
      if (!userId) return { ok: false, message: "Usuário não encontrado." };

      // RLS ("members_delete_self_or_kick") exige kick_members
      const { error } = await supabase
        .from("members")
        .delete()
        .match({ server_id: ctx.serverId, user_id: userId });

      return error
        ? { ok: false, message: "Sem permissão para expulsar membros." }
        : { ok: true, message: "Membro removido do servidor." };
    }

    case "mute": {
      const userId = await ctx.resolveMentionToUserId(args[0] ?? "");
      if (!userId) return { ok: false, message: "Usuário não encontrado." };

      const minutes = Math.max(1, parseInt(args[1] ?? "10", 10) || 10);
      const until = new Date(Date.now() + minutes * 60_000).toISOString();

      const { error } = await supabase
        .from("members")
        .update({ communication_disabled_until: until })
        .match({ server_id: ctx.serverId, user_id: userId });

      return error
        ? { ok: false, message: "Sem permissão para mutar." }
        : { ok: true, message: `Membro mutado por ${minutes} minuto(s).` };
    }

    case "unmute": {
      const userId = await ctx.resolveMentionToUserId(args[0] ?? "");
      if (!userId) return { ok: false, message: "Usuário não encontrado." };

      const { error } = await supabase
        .from("members")
        .update({ communication_disabled_until: null })
        .match({ server_id: ctx.serverId, user_id: userId });

      return error
        ? { ok: false, message: "Sem permissão para desmutar." }
        : { ok: true, message: "Mute removido." };
    }

    default:
      return { ok: false, message: `Comando "/${cmdName}" não existe. Use /help.` };
  }
}
