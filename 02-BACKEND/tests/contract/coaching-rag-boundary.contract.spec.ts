import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RetrievalService } from '../../src/modules/retrieval/retrieval.public';

describe('coaching RAG boundary contract', () => {
  it('uses the backend-owned public Retrieval capability', () => {
    expect(RetrievalService.prototype).toHaveProperty('search');
  });

  it('does not add Qdrant as a backend dependency', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(__dirname, '../../package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect(packageJson.dependencies).not.toHaveProperty('qdrant-client');
    expect(packageJson.devDependencies).not.toHaveProperty('qdrant-client');
  });
});
