export function scriptSourceDirective(nonce: string, development: boolean) {
  const sources = [
    "'self'",
    `'nonce-${nonce}'`,
    "https://challenges.cloudflare.com",
    "stun:",
    "turn:",
    "turns:",
    "'wasm-unsafe-eval'",
    ...(development ? ["'unsafe-eval'"] : []),
  ];
  return `script-src ${sources.join(" ")}`;
}
