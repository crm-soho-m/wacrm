import { randomBytes } from 'crypto';

import { cleanDomain } from '@/lib/leads/form-origin';

export function newFormToken(): string {
  return randomBytes(24).toString('base64url');
}

export function parseDomains(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\n,;\s]+/)
      : [];
  return [
    ...new Set(
      list
        .filter((d): d is string => typeof d === 'string')
        .map(cleanDomain)
        .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))
    ),
  ].slice(0, 20);
}
