import { describe, expect, it } from 'vitest';
import { TtlCache } from './ttlCache';
import { isPrismaUniqueConstraint } from './prismaErrors';
import { withConnectionLimit } from './prisma';

describe('TtlCache', () => {
  it('returns a value before expiry', () => {
    const cache = new TtlCache<number>(60_000);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('drops expired entries', () => {
    const cache = new TtlCache<number>(-1);
    cache.set('a', 1);
    expect(cache.get('a')).toBeUndefined();
  });
});

describe('isPrismaUniqueConstraint', () => {
  it('matches P2002 on a plain object', () => {
    expect(isPrismaUniqueConstraint({ code: 'P2002' })).toBe(true);
  });

  it('matches unique constraint text when code is missing', () => {
    expect(isPrismaUniqueConstraint(new Error('Unique constraint failed on the fields'))).toBe(true);
  });

  it('rejects other errors', () => {
    expect(isPrismaUniqueConstraint({ code: 'P2025' })).toBe(false);
  });
});

describe('withConnectionLimit', () => {
  it('appends connection_limit when missing', () => {
    expect(withConnectionLimit('postgresql://u:p@localhost:5432/db?schema=public', 25)).toContain(
      'connection_limit=25',
    );
  });

  it('leaves an existing connection_limit alone', () => {
    const url = 'postgresql://u:p@localhost:5432/db?connection_limit=10';
    expect(withConnectionLimit(url, 25)).toBe(url);
  });
});
