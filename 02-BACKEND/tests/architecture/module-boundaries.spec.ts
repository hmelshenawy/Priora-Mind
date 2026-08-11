import { describe, expect, it } from 'vitest';
import { checkModuleBoundaries } from '../../scripts/check-module-boundaries';

describe('backend module boundaries', () => {
  it('keeps public imports, persistence ownership, provider ownership, and dependency cycles hardened', () => {
    expect(checkModuleBoundaries()).toEqual([]);
  });
});
