import { describe, it, expect } from 'vitest';
import { normalizeBrPhone, brPhoneVariants } from './phone-br';

describe('normalizeBrPhone', () => {
  it('normaliza celular com máscara e sem código do país', () => {
    expect(normalizeBrPhone('(19) 99628-9577')).toBe('5519996289577');
  });
  it('aceita +55 e espaços', () => {
    expect(normalizeBrPhone('+55 19 99628-9577')).toBe('5519996289577');
  });
  it('adiciona o 9º dígito de celular antigo', () => {
    expect(normalizeBrPhone('19 9628-9577')).toBe('5519996289577');
    expect(normalizeBrPhone('551996289577')).toBe('5519996289577');
  });
  it('mantém telefone fixo com 8 dígitos', () => {
    expect(normalizeBrPhone('(19) 3251-1234')).toBe('551932511234');
  });
  it('remove zero de tronco', () => {
    expect(normalizeBrPhone('019 99628-9577')).toBe('5519996289577');
  });
  it('rejeita lixo', () => {
    expect(normalizeBrPhone('')).toBeNull();
    expect(normalizeBrPhone('abc')).toBeNull();
    expect(normalizeBrPhone('12345')).toBeNull();
    expect(normalizeBrPhone('(00) 99628-9577')).toBeNull();
  });
});

describe('brPhoneVariants', () => {
  it('devolve com e sem o 9', () => {
    expect(brPhoneVariants('5519996289577').sort()).toEqual(
      ['551996289577', '5519996289577'].sort()
    );
    expect(brPhoneVariants('551996289577').sort()).toEqual(
      ['551996289577', '5519996289577'].sort()
    );
  });
  it('fixo e estrangeiro: só o próprio', () => {
    expect(brPhoneVariants('551932511234')).toEqual(['551932511234']);
    expect(brPhoneVariants('+1 415 555 0123')).toEqual(['14155550123']);
  });
});
