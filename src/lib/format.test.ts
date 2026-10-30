import { describe, expect, it } from 'vitest';
import { formatAmount, formatMAD, initials, roleLabels } from './format';

describe('formatMAD', () => {
  it('formats integer centimes as MAD with French separators', () => {
    expect(formatMAD(2484381)).toBe('24\u00a0843,81 MAD');
  });

  it('formats zero and negative amounts', () => {
    expect(formatMAD(0)).toBe('0,00 MAD');
    expect(formatMAD(-70000)).toBe('-700,00 MAD');
  });

  it('keeps two decimals for whole dirhams', () => {
    expect(formatAmount(100000)).toBe('1\u00a0000,00');
  });

  it('returns a placeholder for invalid input', () => {
    expect(formatMAD(Number.NaN)).toBe('—');
  });
});

describe('initials', () => {
  it('builds initials from first and last names', () => {
    expect(initials('Rida Alaoui')).toBe('RA');
    expect(initials('Hassan')).toBe('HA');
    expect(initials(null)).toBe('?');
  });
});

describe('roleLabels', () => {
  it('has a French label per role', () => {
    expect(roleLabels.admin).toBe('Administrateur');
    expect(roleLabels.supervisor).toBe('Superviseur');
    expect(roleLabels.rider).toBe('Livreur');
  });
});
