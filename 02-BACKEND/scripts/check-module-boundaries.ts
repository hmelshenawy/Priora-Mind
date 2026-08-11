import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';

type Violation = { file: string; rule: string; detail: string };

const backendRoot = resolve(__dirname, '..');
const modulesRoot = resolve(backendRoot, 'src/modules');
const hardened = new Set(['auth', 'profile', 'assessment', 'safety', 'ai', 'retrieval']);
const writeMethods = '(create|update|updateMany|upsert|delete|deleteMany)';
const ownedModels: Record<string, string[]> = {
  auth: ['userAccount', 'verificationToken', 'refreshToken', 'noticeVersionSet', 'consentRecord'],
  profile: ['profile', 'preferences', 'onboardingState'],
  assessment: ['assessmentDefinition', 'assessment', 'assessmentAnswer', 'assessmentResult'],
  safety: ['safetyDefinition', 'safetyCopy', 'emergencyResource', 'safetyEvaluation'],
  coaching: ['coachingPlan', 'focusArea', 'goal', 'actionStep', 'coachingPlanGeneration', 'coachingActionLibrary', 'coachingDisclaimer'],
  conversations: ['conversation', 'conversationMessage', 'assistantMessageSource'],
  retention: ['deletionLog'],
};

function tsFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return tsFiles(path);
    return extname(entry.name) === '.ts' ? [path] : [];
  });
}

function moduleOf(file: string): string | null {
  const rel = relative(modulesRoot, file).split(sep);
  return rel.length > 1 && !rel[0].startsWith('..') ? rel[0] : null;
}

function resolveImport(file: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(file), specifier);
  for (const candidate of [`${base}.ts`, resolve(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function importsOf(source: string): Array<{ specifier: string; typeOnly: boolean }> {
  const imports = [...source.matchAll(/(?:import|export)\s+(type\s+)?[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/g)]
    .map((match) => ({ specifier: match[2], typeOnly: Boolean(match[1]) }));
  const sideEffects = [...source.matchAll(/import\s+['"]([^'"]+)['"]/g)]
    .map((match) => ({ specifier: match[1], typeOnly: false }));
  return [...imports, ...sideEffects];
}

export function checkModuleBoundaries(): Violation[] {
  const files = tsFiles(modulesRoot);
  const violations: Violation[] = [];
  const graph = new Map<string, string[]>();

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const owner = moduleOf(file);
    const relFile = relative(backendRoot, file);
    const edges: string[] = [];

    for (const { specifier, typeOnly } of importsOf(source)) {
      const target = resolveImport(file, specifier);
      if (!target) continue;
      if (!typeOnly) edges.push(target);
      const targetModule = moduleOf(target);
      if (!owner || !targetModule || owner === targetModule) continue;
      const targetName = target.split(sep).at(-1) ?? '';
      const allowedPublic = targetName === `${targetModule}.public.ts`;
      const allowedModule = targetName.endsWith('.module.ts');
      if (hardened.has(targetModule) && !allowedPublic && !allowedModule) {
        violations.push({ file: relFile, rule: 'public-entry-point', detail: specifier });
      }
      if (/\/(services|utils|constants|providers|dto|ports)\//.test(specifier.replaceAll('\\', '/'))) {
        violations.push({ file: relFile, rule: 'cross-module-internal-import', detail: specifier });
      }
    }
    graph.set(file, edges);

    for (const [modelOwner, models] of Object.entries(ownedModels)) {
      if (owner === modelOwner) continue;
      for (const model of models) {
        const pattern = new RegExp(`\\.${model}\\.${writeMethods}\\s*\\(`, 'g');
        if (pattern.test(source)) {
          violations.push({ file: relFile, rule: 'foreign-prisma-write', detail: `${model} is owned by ${modelOwner}` });
        }
      }
    }

    if (owner !== 'retrieval' && /RAG_BASE_URL|RAG_SERVICE_TOKEN|RAG_TIMEOUT_MS|\/v1\/search/.test(source)) {
      violations.push({ file: relFile, rule: 'retrieval-transport-owner', detail: 'Python RAG transport outside Retrieval' });
    }
    if (['profile', 'assessment', 'safety', 'ai', 'retrieval', 'coaching', 'conversations'].includes(owner ?? '') && /forwardRef\s*\(/.test(source)) {
      violations.push({ file: relFile, rule: 'no-forward-ref', detail: 'forwardRef requires explicit architecture approval' });
    }
    if (owner !== 'ai' && /providers:\s*\[[\s\S]*?(ConversationLlmAdapter|CoachingLlmAdapter|OllamaConversation|OpenAiConversation)/m.test(source)) {
      violations.push({ file: relFile, rule: 'ai-provider-registration', detail: 'AI implementation registered by consumer' });
    }
  }

  const packageSource = readFileSync(resolve(backendRoot, 'package.json'), 'utf8');
  if (/qdrant/i.test(packageSource) || files.some((file) => /qdrant|query_points|QdrantClient/i.test(readFileSync(file, 'utf8')))) {
    violations.push({ file: 'package.json/src/modules', rule: 'no-direct-qdrant', detail: 'NestJS must not access Qdrant directly' });
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (file: string, stack: string[]) => {
    if (visiting.has(file)) {
      const cycle = [...stack.slice(stack.indexOf(file)), file].map((item) => relative(backendRoot, item)).join(' -> ');
      violations.push({ file: relative(backendRoot, file), rule: 'import-cycle', detail: cycle });
      return;
    }
    if (visited.has(file)) return;
    visiting.add(file);
    for (const target of graph.get(file) ?? []) visit(target, [...stack, file]);
    visiting.delete(file);
    visited.add(file);
  };
  for (const file of files) visit(file, []);

  return violations;
}

if (require.main === module) {
  const violations = checkModuleBoundaries();
  if (violations.length) {
    for (const violation of violations) {
      console.error(`[${violation.rule}] ${violation.file}: ${violation.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log('Module boundary checks passed.');
  }
}
