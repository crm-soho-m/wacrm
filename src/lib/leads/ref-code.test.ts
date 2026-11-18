import { describe, it, expect } from 'vitest';
import { formatRefCode, parseRefCode } from './ref-code';

describe('ref code', () => {
  it('formata com 4 dígitos', () => {
    expect(formatRefCode('sm26', 1)).toBe('SM26-0001');
    expect(formatRefCode('SM26', 42)).toBe('SM26-0042');
    expect(formatRefCode('SM26', 12345)).toBe('SM26-12345');
  });
  it('extrai da mensagem', () => {
    expect(parseRefCode('Olá! Quero começar.\nRef: SM26-0042')).toBe('SM26-0042');
    expect(parseRefCode('ref:sm26-0042 oi')).toBe('SM26-0042');
  });
  it('ignora mensagem sem código ou só com prefixo', () => {
    expect(parseRefCode('Oi, tudo bem?')).toBeNull();
    expect(parseRefCode('Ref: SM26')).toBeNull();
    expect(parseRefCode(undefined)).toBeNull();
  });
});
