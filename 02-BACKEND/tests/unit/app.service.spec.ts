import { describe, it, expect } from 'vitest';
import { AppService } from '../../src/app.service';

/**
 * Setup-phase smoke test — confirms Vitest bootstraps and the health service
 * returns the expected shape. Domain tests land per user story (US1–US9).
 */
describe('AppService (setup smoke)', () => {
  it('health() reports ok status', () => {
    const service = new AppService();
    expect(service.health()).toEqual({
      status: 'ok',
      service: 'priora-mind-backend',
    });
  });
});