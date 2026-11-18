/**
 * Normalização de telefones brasileiros para formulários de site.
 *
 * Formato canônico: `55` + DDD (2 dígitos) + número. Celulares têm o
 * 9º dígito (13 dígitos no total); alguns contatos antigos do WhatsApp
 * chegam sem ele (12 dígitos). `brPhoneVariants` devolve as duas formas
 * para procurar o mesmo contato com ou sem o 9.
 */

/**
 * Normaliza para `55` + DDD + número. Devolve `null` se não parecer um
 * telefone válido. Números de outros países (com código de país
 * diferente de 55 e 12–15 dígitos) são devolvidos só com dígitos.
 */
export function normalizeBrPhone(input: string): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, '');
  if (!digits) return null;

  // Prefixo de saída internacional (00) ou zero de tronco (0DDD...).
  digits = digits.replace(/^0+/, '');
  if (!digits) return null;

  let national: string;
  if (digits.length === 10 || digits.length === 11) {
    national = digits; // DDD + número, sem código do país
  } else if (
    digits.startsWith('55') &&
    (digits.length === 12 || digits.length === 13)
  ) {
    national = digits.slice(2);
  } else if (digits.length >= 12 && digits.length <= 15) {
    return digits; // número de outro país
  } else {
    return null;
  }

  const ddd = national.slice(0, 2);
  let local = national.slice(2);
  if (!/^[1-9][1-9]$/.test(ddd)) return null;

  // Celular antigo sem o 9º dígito: 8 dígitos começando em 6–9.
  if (local.length === 8 && /^[6-9]/.test(local)) local = `9${local}`;
  if (local.length !== 8 && local.length !== 9) return null;
  if (local.length === 9 && local[0] !== '9') return null;

  return `55${ddd}${local}`;
}

/**
 * Variantes do mesmo número: com e sem o 9º dígito (celulares). Para
 * telefone fixo ou número estrangeiro, devolve só o próprio número.
 */
export function brPhoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length === 13 && digits[4] === '9') {
    return [digits, `${digits.slice(0, 4)}${digits.slice(5)}`];
  }
  if (digits.startsWith('55') && digits.length === 12 && /^[6-9]/.test(digits[4])) {
    return [`${digits.slice(0, 4)}9${digits.slice(4)}`, digits];
  }
  return digits ? [digits] : [];
}
