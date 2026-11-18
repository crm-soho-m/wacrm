import { describe, it, expect } from 'vitest';
import { cleanDomain, hostFromUrl, isOriginAllowed } from './form-origin';

describe('form origin', () => {
  it('extrai host', () => {
    expect(hostFromUrl('https://www.sohom.com.br/pagina?x=1')).toBe('www.sohom.com.br');
    expect(hostFromUrl('lixo')).toBeNull();
    expect(hostFromUrl(null)).toBeNull();
  });
  it('limpa domínio digitado', () => {
    expect(cleanDomain('https://www.SohoM.com.br/')).toBe('sohom.com.br');
    expect(cleanDomain('sohom.com.br')).toBe('sohom.com.br');
  });
  it('autoriza domínio, www e subdomínios', () => {
    const list = ['sohom.com.br'];
    expect(isOriginAllowed(list, 'sohom.com.br')).toBe(true);
    expect(isOriginAllowed(list, 'www.sohom.com.br')).toBe(true);
    expect(isOriginAllowed(list, 'lp.sohom.com.br')).toBe(true);
  });
  it('recusa outros domínios, ausência e lista vazia', () => {
    expect(isOriginAllowed(['sohom.com.br'], 'evilsohom.com.br')).toBe(false);
    expect(isOriginAllowed(['sohom.com.br'], 'sohom.com.br.evil.com')).toBe(false);
    expect(isOriginAllowed(['sohom.com.br'], null)).toBe(false);
    expect(isOriginAllowed([], 'sohom.com.br')).toBe(false);
  });
});
