export function scriptSourceDirective(nonce: string, development: boolean) {
  const sources = [
    "'self'",
    `'nonce-${nonce}'`,
    "https://challenges.cloudflare.com",
    "stun:",
    "turn:",
    "turns:",
    ...(development ? ["'unsafe-eval'"] : []),
  ];
  return `script-src ${sources.join(" ")}`;
}
