/** Código de referência por lead: `{prefixo}-{número com 4 dígitos}`. */

export function formatRefCode(prefix: string, n: number): string {
  return `${prefix.toUpperCase()}-${String(n).padStart(4, '0')}`;
}

// "Ref: SM26-0042" (maiúsculas/minúsculas e espaços variam).
const REF_IN_TEXT = /\bref\s*:?\s*([A-Za-z0-9]{2,12}-\d{3,9})\b/i;

/** Extrai o código `Ref: XXXX-0000` de uma mensagem, em maiúsculas. */
export function parseRefCode(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = REF_IN_TEXT.exec(text);
  return m ? m[1].toUpperCase() : null;
}
