import { describe, expect, it } from 'vitest';
import { montantEntier } from '../src/fonds/live';

/**
 * The fund desk reads every money field AS WRITTEN — digits only, never
 * coerced (the Boutik+ rule). `Number('')` is 0, and a 0-franc fact in an
 * append-only book is a false money record nobody can delete.
 */
describe('montantEntier — a money field refuses what it cannot read', () => {
  it.each(['', '   ', '12 500', '1e4', '0x10', '-5', '12.5', '12,5', '+12', '١٢', '12500F', 'Infinity'])(
    'refuses %j',
    (raw) => {
      expect(montantEntier(raw)).toBeNull();
    },
  );

  it('refuses a figure past the safe-integer range rather than rounding it', () => {
    expect(montantEntier('9007199254740993')).toBeNull();
  });

  it.each([
    ['12500', 12_500],
    [' 12500 ', 12_500],
    ['0', 0],
    ['007', 7],
  ])('reads %j as %d', (raw, value) => {
    expect(montantEntier(raw)).toBe(value);
  });
});
