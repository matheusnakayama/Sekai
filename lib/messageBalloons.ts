export const SEKAI_BALLOON_WINDOW_MS = 5 * 60 * 1000;

type BalloonMessage = {
  id: string;
  authorId: string;
  createdAt: string;
  systemType?: string | null;
};

function samePeriod(previous: BalloonMessage, current: BalloonMessage, windowMs: number) {
  if (previous.systemType || current.systemType) return false;
  if (previous.authorId !== current.authorId) return false;
  const previousTime = new Date(previous.createdAt).getTime();
  const currentTime = new Date(current.createdAt).getTime();
  if (new Date(previousTime).toDateString() !== new Date(currentTime).toDateString()) return false;
  const elapsed = currentTime - previousTime;
  return elapsed >= 0 && elapsed <= windowMs;
}

/** Mensagens seguidas da mesma pessoa, no mesmo dia e dentro da janela, entram no mesmo balão. */
export function groupChatBalloons<T extends BalloonMessage>(messages: T[], windowMs: number, isolated?: (message: T) => boolean) {
  const groups: T[][] = [];
  for (const message of messages) {
    const current = groups[groups.length - 1];
    const previous = current?.[current.length - 1];
    if (current && previous && !isolated?.(previous) && !isolated?.(message) && samePeriod(previous, message, windowMs)) current.push(message);
    else groups.push([message]);
  }
  return groups;
}
