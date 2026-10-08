const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const DIRECT_CALL_INVITE = "[[sekai-voice-call]]";

export function directVoiceRoomId(firstUserId: string, secondUserId: string) {
  const pair = [firstUserId.toLowerCase(), secondUserId.toLowerCase()].sort();
  return `dm-${pair[0]}-${pair[1]}`;
}

export function parseDirectVoiceRoomId(roomId: string) {
  const match = /^dm-([0-9a-f-]{36})-([0-9a-f-]{36})$/i.exec(roomId);
  if (!match || !UUID_PATTERN.test(match[1]) || !UUID_PATTERN.test(match[2])) return null;
  const pair = [match[1].toLowerCase(), match[2].toLowerCase()].sort();
  if (pair[0] === pair[1] || roomId !== `dm-${pair[0]}-${pair[1]}`) return null;
  return pair as [string, string];
}
