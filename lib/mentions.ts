export type MentionName = { label: string; mine: boolean };

function maskCode(content: string) {
  return content.replace(/```[\s\S]*?```|`[^`\n]*`/g, (block) => " ".repeat(block.length));
}

function codeParts(content: string) {
  return content.matchAll(/```[\s\S]*?```|`[^`\n]*`/g);
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase();
}

function canStartMention(before: string) {
  return before === "" || /[\s([{"'`]/.test(before);
}

function isNameChar(value: string) {
  return value !== "" && /[\p{L}\p{N}_]/u.test(value);
}

export function mentionCatalog(names: MentionName[]) {
  const byKey = new Map<string, MentionName>();
  function add(label: string | null | undefined, mine: boolean) {
    const trimmed = label?.trim();
    if (!trimmed) return;
    const key = normalized(trimmed);
    const existing = byKey.get(key);
    if (!existing) byKey.set(key, { label: trimmed, mine });
    else if (mine) byKey.set(key, { label: existing.label, mine: true });
  }
  for (const name of names) add(name.label, name.mine);
  add("everyone", true);
  add("here", true);
  return [...byKey.values()].sort((a, b) => b.label.length - a.label.length);
}

export function buildMentionNames(
  people: { id?: string; displayName?: string | null; username?: string | null }[],
  currentUserId?: string | null,
  viewer?: { displayName?: string | null; username?: string | null },
): MentionName[] {
  const names: MentionName[] = [];
  if (viewer?.displayName) names.push({ label: viewer.displayName, mine: true });
  if (viewer?.username) names.push({ label: viewer.username, mine: true });
  for (const person of people) {
    const mine = Boolean(currentUserId && person.id === currentUserId);
    if (person.displayName) names.push({ label: person.displayName, mine });
    if (person.username) names.push({ label: person.username, mine });
  }
  return mentionCatalog(names);
}

function findMention(content: string, index: number, catalog: MentionName[]) {
  if (content[index] !== "@") return null;
  const before = index === 0 ? "" : content[index - 1];
  if (!canStartMention(before)) return null;
  const rest = content.slice(index + 1);
  const match = catalog.find((name) => {
    if (!rest.toLocaleLowerCase().startsWith(normalized(name.label))) return false;
    const after = rest[name.label.length] ?? "";
    return !isNameChar(after);
  });
  if (!match) return null;
  const end = index + 1 + match.label.length;
  return { end, mine: match.mine, label: content.slice(index, end) };
}

export function contentMentionsUser(content: string, selfNames: string[]) {
  if (!content.includes("@")) return false;
  const catalog = mentionCatalog(selfNames.map((label) => ({ label, mine: true })));
  const masked = maskCode(content);
  for (let index = 0; index < masked.length; index += 1) {
    const hit = findMention(masked, index, catalog);
    if (hit?.mine) return true;
    if (hit) index = hit.end - 1;
  }
  return false;
}

function escapeLabel(label: string) {
  return label.replace(/[\\[\]]/g, "\\$&");
}

function replaceMentions(content: string, catalog: MentionName[]) {
  let result = "";
  for (let index = 0; index < content.length; index += 1) {
    const hit = findMention(content, index, catalog);
    if (!hit) {
      result += content[index];
      continue;
    }
    const href = hit.mine ? "#sekai-mention-mine" : "#sekai-mention";
    result += `[${escapeLabel(hit.label)}](${href})`;
    index = hit.end - 1;
  }
  return result;
}

export function linkifyMentions(content: string, names: MentionName[]) {
  if (!content.includes("@")) return content;
  const catalog = mentionCatalog(names);
  let result = "";
  let last = 0;
  for (const match of codeParts(content)) {
    const index = match.index ?? 0;
    result += replaceMentions(content.slice(last, index), catalog);
    result += match[0];
    last = index + match[0].length;
  }
  result += replaceMentions(content.slice(last), catalog);
  return result;
}
