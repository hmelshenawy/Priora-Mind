import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SQ02_TRIGGER_CODES, type Sq01Code, type Sq02Code, type Sq03Code } from '../safety/safety-definition';
import {
  ASSESSMENT_DEFINITION_VERSION,
  COACHING_QUESTION_IDS,
  REQUIRED_COACHING_IDS,
} from './assessment-definition';

/**
 * Assessment answer store (Constitution VIII split — handwritten files MUST NOT exceed
 * 300 lines). Owns persistence + reads of `AssessmentAnswer` rows, the active
 * `Assessment` upsert, and the required/unanswered-set computation used to drive the
 * next-question pointer and submit completeness (FR-014a, data-model §8/§9). All reads
 * are scoped by `assessmentId` (itself owner-scoped by the caller). No logging of answer
 * content (FR-030). Holds no safety/scoring logic — scoring stays separate (FR-019).
 */
@Injectable()
export class AssessmentAnswerStore {
  constructor(private readonly prisma: PrismaService) {}

  /** Required-question completeness for submit (FR-014a). Returns missing ids in the
   * full required order: 16 current-state + AG-01/02/03, then SQ-01, SQ-02 (when
   * SQ-01 ∈ {S1,S2,SX}), SQ-03 (US6). */
  async missingRequired(assessmentId: string): Promise<string[]> {
    const answers = await this.loadAnswers(assessmentId);
    const have = new Set(answers.map((a) => a.questionId));
    const required = await this.requiredIds(assessmentId);
    return required.filter((id) => !have.has(id));
  }

  /** Load all saved answers for an assessment (ordered by definition question order). */
  async loadAnswers(assessmentId: string): Promise<{ questionId: string; value: unknown; questionKind: string }[]> {
    const rows = await this.prisma.assessmentAnswer.findMany({ where: { assessmentId } });
    const order = new Map(COACHING_QUESTION_IDS.map((id, i) => [id, i]));
    return rows
      .map((r) => ({ questionId: r.questionId, value: r.value, questionKind: r.questionKind }))
      .sort((a, b) => (order.get(a.questionId) ?? 999) - (order.get(b.questionId) ?? 999));
  }

  /** First required unanswered question id (coaching, then safety), or null when all
   * required are answered. Async because SQ-02 requiredness depends on stored SQ-01. */
  async nextQuestion(assessmentId: string, answers: { questionId: string }[]): Promise<string | null> {
    const have = new Set(answers.map((a) => a.questionId));
    const required = await this.requiredIds(assessmentId);
    return required.find((id) => !have.has(id)) ?? null;
  }

  /** Load the currently-answered safety codes for the classifier (US6). */
  async loadSqAnswers(
    assessmentId: string,
  ): Promise<Partial<{ 'SQ-01': Sq01Code; 'SQ-02': Sq02Code; 'SQ-03': Sq03Code }>> {
    const rows = await this.prisma.assessmentAnswer.findMany({ where: { assessmentId } });
    const out: Partial<{ 'SQ-01': Sq01Code; 'SQ-02': Sq02Code; 'SQ-03': Sq03Code }> = {};
    for (const r of rows) {
      const code = (r.value as { code?: string } | undefined)?.code;
      if (r.questionId === 'SQ-01' && code) out['SQ-01'] = code as Sq01Code;
      else if (r.questionId === 'SQ-02' && code) out['SQ-02'] = code as Sq02Code;
      else if (r.questionId === 'SQ-03' && code) out['SQ-03'] = code as Sq03Code;
    }
    return out;
  }

  /** The stored SQ-01 code, or null if SQ-01 is unanswered. */
  async storedSq01(assessmentId: string): Promise<Sq01Code | null> {
    const row = await this.prisma.assessmentAnswer.findFirst({
      where: { assessmentId, questionId: 'SQ-01' },
    });
    const code = (row?.value as { code?: string } | undefined)?.code;
    return (code as Sq01Code | undefined) ?? null;
  }

  /** Upsert the active assessment for a user (one active initial assessment, data-model
   * §8). Creates with the current definition version + NOT_STARTED when absent. */
  async upsertActive(userId: string) {
    const existing = await this.prisma.assessment.findFirst({ where: { userId } });
    if (existing) return existing;
    return this.prisma.assessment.create({
      data: { userId, definitionVersion: ASSESSMENT_DEFINITION_VERSION, state: 'NOT_STARTED' },
    });
  }

  /** Upsert a single answer row (create or update by assessmentId+questionId). */
  async upsertAnswer(
    assessmentId: string,
    questionId: string,
    kind: string,
    value: unknown,
    now: Date,
  ): Promise<void> {
    const existing = await this.prisma.assessmentAnswer.findFirst({
      where: { assessmentId, questionId },
    });
    if (existing) {
      await this.prisma.assessmentAnswer.update({
        where: { id: existing.id },
        data: { value: value as Prisma.InputJsonValue, updatedAt: now },
      });
    } else {
      await this.prisma.assessmentAnswer.create({
        data: {
          assessmentId,
          questionId,
          questionKind: kind as never,
          value: value as Prisma.InputJsonValue,
        },
      });
    }
  }

  // ─────────────────────────── private ───────────────────────────

  /** The full ordered required-id list: coaching questions first, then the safety
   * questions (END-of-flow ordering — safety gates completion, Safety §4). SQ-02 is
   * required only when SQ-01 ∈ {S1,S2,SX} (Safety §3). */
  private async requiredIds(assessmentId: string): Promise<string[]> {
    const sq01 = await this.storedSq01(assessmentId);
    const safety: string[] = ['SQ-01'];
    if (sq01 && SQ02_TRIGGER_CODES.includes(sq01)) safety.push('SQ-02');
    safety.push('SQ-03');
    return [...REQUIRED_COACHING_IDS, ...safety];
  }
}