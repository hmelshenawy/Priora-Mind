# Priora Mind — Initial Assessment Specification

**Version:** 1.0  
**Status:** Product Approved for Feature Planning  
**Owner:** Assessment Module  
**Feature:** `001-user-onboarding-and-assessment`  
**Last updated:** 2026-07-29

## 1. Purpose

The initial assessment creates a structured, non-diagnostic picture of:

1. The user's current wellbeing across eight equally weighted coaching domains.
2. The areas the user personally wants to improve.
3. The starting context required by the future coaching-plan feature.

It is a coaching assessment, not a medical or psychological diagnosis, and does
not use generative AI.

## 2. Product Boundaries

- The assessment MUST NOT diagnose a condition or claim clinical validity.
- The assessment MUST NOT recommend medication or replace professional care.
- Scoring and result generation are deterministic.
- Safety classification is separate from assessment scoring.
- A safety-sensitive answer may interrupt the assessment regardless of scores.
- No overall score is calculated or displayed.
- Arabic and English versions have equal meaning and product status.

## 3. Structure

The assessment contains 21 questions:

- 16 required current-state questions.
- Eight equally weighted domains.
- One positive and one negative item per domain.
- Five goal and priority questions.
- Estimated completion time: 7–9 minutes.
- Current-state reference period: the previous two weeks.

Safety checks defined in `Safety_Decision_Matrix.md` are unscored and are not
part of the 21 coaching questions.

## 4. Current-State Answer Scale

| Value | English | العربية |
|---:|---|---|
| 0 | Never | أبدًا |
| 1 | Rarely | نادرًا |
| 2 | Sometimes | أحيانًا |
| 3 | Often | غالبًا |
| 4 | Always | دائمًا |

Instruction:

- **EN:** During the past two weeks, how often has each statement been true for you?
- **AR:** خلال الأسبوعين الماضيين، كم مرة كان كل تعبير من التعبيرات التالية صادقًا بالنسبة لك؟

## 5. Current-State Questions

`P` means positively scored. `N` means reverse scored.

| ID | Domain | Key | English | العربية |
|---|---|---|---|---|
| AS-01 | Stress management | P | I felt able to handle the pressures of my day. | شعرت أنني قادر على التعامل مع ضغوط يومي. |
| AS-02 | Mood | N | Difficult feelings affected most of my day. | أثّرت المشاعر الصعبة في معظم يومي. |
| AS-03 | Energy and motivation | P | I had enough energy to do the things that mattered to me. | كانت لدي طاقة كافية للقيام بالأشياء المهمة بالنسبة لي. |
| AS-04 | Sleep and rest | N | Poor or unsettled sleep affected my day. | أثّر النوم غير المريح أو المتقطع في يومي. |
| AS-05 | Focus and thought organization | P | I could focus and organize my thoughts when I needed to. | استطعت التركيز وتنظيم أفكاري عندما احتجت إلى ذلك. |
| AS-06 | Self-confidence | N | Self-doubt stopped me from taking useful action. | منعني الشك في نفسي من اتخاذ خطوات مفيدة. |
| AS-07 | Relationships and support | P | I felt supported or able to reach out to someone I trust. | شعرت بوجود دعم أو بقدرتي على التواصل مع شخص أثق به. |
| AS-08 | Life balance and organization | N | My responsibilities felt disorganized or out of balance. | شعرت أن مسؤولياتي غير منظمة أو أن حياتي غير متوازنة. |
| AS-09 | Stress management | N | The pressures I faced felt greater than my ability to manage them. | شعرت أن الضغوط التي أواجهها أكبر من قدرتي على إدارتها. |
| AS-10 | Mood | P | I experienced moments of calm, enjoyment, or emotional balance. | عشت لحظات من الهدوء أو الاستمتاع أو التوازن النفسي. |
| AS-11 | Energy and motivation | N | Low energy or motivation made it hard to begin important tasks. | جعل انخفاض الطاقة أو الدافعية بدء المهام المهمة أمرًا صعبًا. |
| AS-12 | Sleep and rest | P | My sleep gave me enough rest for the following day. | منحني نومي قدرًا كافيًا من الراحة لليوم التالي. |
| AS-13 | Focus and thought organization | N | Distraction or racing thoughts made everyday tasks difficult. | جعل التشتت أو تسارع الأفكار أداء المهام اليومية صعبًا. |
| AS-14 | Self-confidence | P | I trusted my ability to make decisions and handle challenges. | وثقت بقدرتي على اتخاذ القرارات والتعامل مع التحديات. |
| AS-15 | Relationships and support | N | I felt disconnected from people whose support matters to me. | شعرت بالانفصال عن أشخاص يهمني دعمهم. |
| AS-16 | Life balance and organization | P | I was able to balance my main responsibilities and personal needs. | استطعت الموازنة بين مسؤولياتي الأساسية واحتياجاتي الشخصية. |

The order above deliberately separates the two items belonging to each domain.
The approved wording may be corrected for linguistic quality without changing
meaning, polarity, domain, scale, or scoring version.

## 6. Goal and Priority Questions

Goal answers do not affect domain scores.

### AG-01 — Select domains

**Prompt:** Select one to three areas you want to improve.

Options are the eight domains in section 5. At least one and no more than three
are required.

### AG-02 — Rank priorities

**Prompt:** Arrange the selected areas from most to least important to you now.

All selected domains must have a unique rank.

### AG-03 — Desired change

**Prompt:** What change would you like to achieve in each selected area?

Each domain presents approved suggested goals plus **Other goal**. One desired
change is required for every selected domain. If **Other goal** is chosen, a
short free-text answer is required.

### AG-04 — Personal importance

**Prompt:** Why is this change important to you?

Optional short free-text answer.

### AG-05 — Expected obstacle

**Prompt:** What is the biggest obstacle you expect?

Optional suggested options plus **Other obstacle** with optional short
free-text. The user may skip this question.

Free text MUST NOT be used to infer a diagnosis. It is still subject to the
safety evaluation rules.

## 7. Deterministic Scoring

For positive items:

`item_score = answer_value`

For negative items:

`item_score = 4 - answer_value`

Each domain contains exactly two items:

`domain_score = round(((item_1_score + item_2_score) / 8) × 100)`

The resulting domain score is an integer from 0 to 100. Both questions are
required; no domain score is produced from a partial answer.

## 8. Result Bands

| Score | English label | Arabic label |
|---:|---|---|
| 75–100 | Current strength | نقطة قوة حالية |
| 50–74 | Relatively steady | مستقر نسبيًا |
| 25–49 | Needs attention | يحتاج إلى اهتمام |
| 0–24 | Needs near-term support | يحتاج إلى دعم قريب |

These labels describe coaching needs only. They are not severity levels,
clinical thresholds, or safety classifications.

## 9. Result Presentation

The result MUST:

- Show all eight domain scores and descriptive bands.
- Identify the strongest domain.
- Identify the domain most in need of support.
- Preserve and display the user's selected priorities separately.
- Explain when the lowest-scoring domain differs from the first chosen goal.
- State clearly that the result is non-diagnostic.
- Avoid an overall score, diagnosis, disorder name, or clinical prediction.
- Provide the transition point to future coaching-plan creation.

Ties use the fixed domain order in section 5 only for presentation. A tie MUST
NOT imply that one tied domain is clinically more important.

No normal result is presented while onboarding is in `SAFETY_HOLD`.

## 10. Lifecycle and Submission Rules

- Every current-state question is required.
- Required goal inputs: AG-01, AG-02, and AG-03.
- Optional goal inputs: AG-04 and AG-05.
- Answers are saved individually.
- A returning user resumes at the last incomplete question.
- The user may revise any answer before final submission.
- A review screen appears before final confirmation.
- Restart clears the active incomplete attempt after explicit confirmation.
- Only one active initial assessment exists per user.
- Restarted or abandoned incomplete answers are overwritten, not retained as
  separate assessment history.
- Final submission is idempotent and creates exactly one result.
- After successful submission, answers and the result are immutable.
- The MVP permits one completed initial assessment only.
- Retaking and revisiting the initial result are outside this feature.

## 11. Versioning

The assessment definition has a stable version. A completed result stores the
version used to produce it.

A new version is required when any of the following changes:

- Question meaning, domain, or polarity.
- Answer scale.
- Scoring formula.
- Band thresholds or labels.
- Required goal structure.

Spelling, punctuation, or translation corrections that do not change meaning
may be released as a patch version. Historical results MUST never be silently
recalculated under a newer version.

## 12. Validation Fixtures

At minimum, independent tests MUST verify:

- All answers `4` on positive and `0` on negative items produce `100`.
- All answers `0` on positive and `4` on negative items produce `0`.
- Two adjusted item scores totaling `4` produce `50`.
- Boundary scores map correctly at `24/25`, `49/50`, and `74/75`.
- Missing required answers prevent submission and scoring.
- Duplicate submission produces one immutable result.
- Arabic and English question IDs produce identical scoring.
- A safety classification never changes a domain score.
- `SAFETY_HOLD` suppresses normal result presentation.

## 13. Dependencies

- `Safety_Decision_Matrix.md` controls unscored safety classification and routing.
- `Consent_and_Data_Retention_Policy.md` controls consent, retention, and deletion.
- The feature specification controls the surrounding onboarding lifecycle.
- The future coaching-plan feature may consume scores and chosen goals but MUST
  preserve the assessment version and non-diagnostic meaning.

