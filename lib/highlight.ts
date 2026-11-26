export type TokenKind = "com" | "str" | "key" | "plain";

export interface Token {
  text: string;
  kind: TokenKind;
}

const PATTERN =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(import|from|export|const|let|async|await|function|return|new|if|else|for|of|true|false|null|undefined)\b/g;

/**
 * Minimal TypeScript tokenizer for the review panel.
 *
 * One pass over an alternation, so tokens can't nest and mangle each other.
 * Returns tokens rather than HTML: the code being highlighted comes from a model,
 * and rendering it as React text means there is no markup path to get wrong.
 */
export function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;

  for (const match of code.matchAll(PATTERN)) {
    const at = match.index;
    if (at > last) tokens.push({ text: code.slice(last, at), kind: "plain" });

    const [text, comment, string] = match;
    tokens.push({ text, kind: comment ? "com" : string ? "str" : "key" });
    last = at + text.length;
  }

  if (last < code.length) tokens.push({ text: code.slice(last), kind: "plain" });
  return tokens;
}
