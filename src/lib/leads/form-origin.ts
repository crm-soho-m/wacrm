/** Verificação de domínios autorizados de um formulário. */

/** Host (minúsculo, sem porta) de uma URL/Origin, ou null. */
export function hostFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Limpa um domínio digitado na configuração (aceita URL completa). */
export function cleanDomain(value: string): string {
  const v = value.trim().toLowerCase();
  const host = hostFromUrl(/^[a-z][a-z0-9+.-]*:\/\//.test(v) ? v : `https://${v}`);
  return (host ?? v).replace(/^www\./, '');
}

/**
 * O host está autorizado? Vale o domínio exato, `www.` e subdomínios
 * (ex.: `sohom.com.br` autoriza `www.sohom.com.br`). Lista vazia = nada
 * autorizado.
 */
export function isOriginAllowed(
  allowedDomains: string[],
  host: string | null
): boolean {
  if (!host || allowedDomains.length === 0) return false;
  const h = host.replace(/^www\./, '');
  return allowedDomains.some((d) => {
    const dom = d.trim().toLowerCase().replace(/^www\./, '');
    return !!dom && (h === dom || h.endsWith(`.${dom}`));
  });
}
