# Katalyst Gamification Platform — Production Build Spec
## Handoff document for Claude Code implementation

This document finalizes the architecture from the design plan into a concrete,
buildable spec: stack decisions, schema, API contracts, AI Judge/Coach
implementation details, and a sequenced ticket list. Claude Code should build
in the epic order given in §10, committing and testing after each ticket.

**This version incorporates the design team's finalized XP weighting model
(per-module-type criteria weights, level-based scoring, bonus rules, weekly
streaks, engagement-health signals, and the team-XP formula — see §11) and
the mentor document-ingestion / RAG subsystem for the AI Coach's knowledge
base (see §12). §11 and §12 are now authoritative and override any generic
scoring language elsewhere in this document.

---

## 1. Final Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend (Student + Admin) | Next.js (React, TypeScript), Tailwind CSS | Single framework for both apps, SSR for dashboards, fast to scaffold |
| Backend API | Node.js + TypeScript, Fastify (or NestJS if the team wants stronger DI/module structure) | Type-safety shared with frontend, good async I/O for AI calls |
| Database | PostgreSQL | Relational integrity needed for ledger/audit correctness; JSONB columns for flexible rubric/criteria data |
| Cache / Job Queue | Redis + BullMQ | Leaderboard caching, scheduled nudge jobs, async AI Judge processing queue |
| AI Judge & AI Coach | Anthropic Claude API (Claude Sonnet for scoring/nudges; structured JSON output via tool-use/function-calling pattern) | Both need reasoning + structured output; Coach also needs tool-calling to read platform data |
| File/artifact storage | S3-compatible object storage (submissions, certificates, mentor-uploaded documents) | Standard for file uploads |
| Vector DB (RAG, §12) | Managed vector store (e.g. pgvector extension on the same Postgres, or a dedicated service like Pinecone/Weaviate if scale warrants) | Default recommendation: **pgvector** to start — keeps ops simple and metadata filtering (grade/subject/chapter/topic) trivial via normal SQL joins; migrate to a dedicated vector service only if document volume/query latency requires it |
| Auth | OAuth2/OIDC via SSO into Katalyst Konnect if available; else JWT-based auth with role claims | Reuse existing identity where possible |
| Notifications | Email (transactional provider) + WhatsApp Business API | Matches existing student habits per business need |
| Hosting | Containerized (Docker), deployable to any cloud (AWS/GCP/Azure) via ECS/Cloud Run/AKS | Portable, no vendor lock-in assumption |
| Observability | Structured logging (pino/winston) + OpenTelemetry traces + a metrics dashboard (Grafana/Cloud provider) | Needed to track AI Judge auto-approval rate, override rate, nudge effectiveness |

Monorepo recommended (pnpm workspaces or Turborepo) with packages:
```
/apps
  /web-student        (Next.js student app: Coach chat + dashboard)
  /web-admin           (Next.js admin/management console)
  /api                 (Fastify/NestJS backend — all services)
/packages
  /shared-types        (TS types shared across apps: Module, Submission, Review, XPLedgerEntry, etc.)
  /ai-judge             (rubric prompt templates, scoring client, output schema/validators)
  /ai-coach             (coach system prompt, tool definitions, nudge job logic)
  /ui                   (shared component library)
/infra
  (IaC — Terraform or equivalent, Dockerfiles, CI config)
```

---

## 2. Database Schema (PostgreSQL — authoritative for Claude Code)

```sql
-- Users & Teams
users (
  id UUID PK,
  external_id TEXT,              -- Katalyst Konnect ID
  name TEXT, email TEXT UNIQUE,
  role TEXT CHECK (role IN ('student','admin','mentor','higher_management')),
  cohort TEXT, batch_year INT CHECK (batch_year BETWEEN 1 AND 4),
  created_at TIMESTAMPTZ DEFAULT now()
)

teams (
  id UUID PK, name TEXT, cohort TEXT, created_at TIMESTAMPTZ
)

team_memberships (
  id UUID PK,
  team_id UUID FK -> teams,
  user_id UUID FK -> users,
  team_role TEXT CHECK (team_role IN
    ('frontend_developer','backend_developer','database_developer',
     'qa_engineer','product_analyst')),
  UNIQUE(team_id, user_id)
)

-- Modules & Rubrics
modules (
  id UUID PK,
  type TEXT CHECK (type IN
    ('training_session','online_course','mentoring','project',
     'assignment','other')),
  title TEXT, description TEXT,
  mode TEXT CHECK (mode IN ('mandatory','optional','certificate')),
  due_date TIMESTAMPTZ NULL,
  xp_weight INT NOT NULL,
  is_team_based BOOLEAN DEFAULT false,
  rubric_id UUID FK -> rubrics,
  created_by UUID FK -> users,
  status TEXT CHECK (status IN ('draft','published','archived')),
  created_at TIMESTAMPTZ DEFAULT now()
)

rubrics (
  id UUID PK,
  version INT NOT NULL,
  module_type TEXT,          -- training_session|online_course|assignment|mentoring|
                               -- project|team_contribution|certificate_course|optional_activity
  criteria JSONB NOT NULL,   -- [{key, name, weight_pct, description}], weight_pct sums to 100
                               -- per §11's finalized tables; NOT arbitrary max_score anymore —
                               -- scoring is always level-based (see reviews.criteria_levels below)
  ai_judge_prompt_template TEXT NOT NULL,
  confidence_threshold NUMERIC DEFAULT 0.8,
  xp_cap_period TEXT NULL,   -- e.g. 'monthly' for optional_activity module_type (§11.8 cap)
  xp_cap_amount INT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
)

-- fixed system-wide performance levels — seeded once, referenced by key, never per-rubric
performance_levels (
  key TEXT PK CHECK (key IN ('not_demonstrated','developing','proficient','excellent')),
  label TEXT NOT NULL,
  percentage NUMERIC NOT NULL   -- 0 / 50 / 75 / 100, per §11
)

-- role-specific rubric slices for team projects
rubric_role_criteria (
  id UUID PK,
  rubric_id UUID FK -> rubrics,
  team_role TEXT,        -- matches team_memberships.team_role
  criteria JSONB NOT NULL
)

-- Enrollment / Submission / Review
enrollments (
  id UUID PK,
  module_id UUID FK -> modules,
  user_id UUID FK -> users NULL,      -- individual enrollment
  team_id UUID FK -> teams NULL,      -- team enrollment
  status TEXT CHECK (status IN
    ('enrolled','in_progress','submitted','under_review','completed','overdue')),
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  CHECK (user_id IS NOT NULL OR team_id IS NOT NULL)
)

submissions (
  id UUID PK,
  enrollment_id UUID FK -> enrollments,
  submitted_by UUID FK -> users,
  team_role TEXT NULL,               -- which role this artifact represents, if team project
  artifact_type TEXT CHECK (artifact_type IN ('file','link','text','attendance_sync','certificate')),
  artifact_ref TEXT,                 -- S3 key / URL / inline text
  submitted_at TIMESTAMPTZ DEFAULT now()
)

reviews (
  id UUID PK,
  submission_id UUID FK -> submissions,
  reviewer_type TEXT CHECK (reviewer_type IN ('ai_judge','management')),
  reviewer_user_id UUID FK -> users NULL,   -- null if pure AI, set when management edits/approves
  criteria_levels JSONB NOT NULL,   -- [{criterion_key, level_key, weight_pct, earned_pct}]
                                      -- earned_pct = weight_pct * performance_levels.percentage/100
  total_earned_pct NUMERIC,          -- sum of earned_pct, e.g. 81.25 in the §11 worked example
  xp_awarded INT,                     -- total_earned_pct/100 * module.xp_weight, rounded
  feedback_text TEXT,
  confidence NUMERIC,                        -- AI Judge only
  flags JSONB,                                -- e.g. ["possible_plagiarism","incomplete","attendance_only_no_learning_action"]
  rubric_id UUID FK -> rubrics,
  status TEXT CHECK (status IN ('ai_draft','auto_approved','pending_review','approved','overridden','rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  decided_at TIMESTAMPTZ NULL
)

-- Bonus variables (§11.9) — kept separate from the rubric so they stay sparingly-applied and auditable
bonus_awards (
  id UUID PK,
  user_id UUID FK -> users,
  review_id UUID FK -> reviews NULL,   -- the review this bonus relates to, if applicable
  bonus_type TEXT CHECK (bonus_type IN
    ('meaningful_revision','team_mission_help','weekly_consistency',
     'exceptional_improvement','early_completion_quality')),
  xp_amount INT NOT NULL,
  awarded_by UUID FK -> users,   -- always a human (management/mentor) — never auto-granted by AI Judge alone
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
)

-- Topic-level performance (feeds RAG personalization, §12) — kept in SQL, never in the vector DB
student_topic_performance (
  id UUID PK,
  user_id UUID FK -> users,
  subject TEXT, topic TEXT,
  accuracy_pct NUMERIC,
  attempts INT DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  trend TEXT CHECK (trend IN ('improving','stable','declining')),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, subject, topic)
)

-- Mentor-ingested knowledge base metadata (§12) — actual chunks/embeddings live in the vector DB;
-- this table is the system-of-record for what was uploaded, by whom, and its processing status
knowledge_documents (
  id UUID PK,
  uploaded_by UUID FK -> users,           -- mentor or admin
  title TEXT, source_type TEXT CHECK (source_type IN ('curriculum','notes','worksheet','faq','remedial_material','teacher_knowledge')),
  file_ref TEXT,                           -- S3 key
  metadata JSONB,                           -- {grade, subject, chapter, topic, document_type, source, version, language}
  status TEXT CHECK (status IN ('uploaded','parsing','chunked','embedded','failed')),
  vector_namespace TEXT,                    -- pointer into the vector DB collection
  created_at TIMESTAMPTZ DEFAULT now()
)

-- Golden Q&A set for RAG evaluation (§12.6)
rag_eval_set (
  id UUID PK,
  question TEXT,
  approved_answer TEXT,
  subject TEXT, topic TEXT, grade TEXT,
  approved_by UUID FK -> users,
  created_at TIMESTAMPTZ DEFAULT now()
)

-- XP Ledger (append-only — never UPDATE, only INSERT)
xp_ledger (
  id UUID PK,
  user_id UUID FK -> users NULL,
  team_id UUID FK -> teams NULL,
  source_type TEXT CHECK (source_type IN ('review','mission','badge_bonus','manual_adjustment')),
  source_id UUID,               -- review.id or mission.id
  xp_amount INT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
)

-- Gamification
badges (
  id UUID PK, code TEXT UNIQUE, name TEXT, description TEXT,
  rule_expression JSONB,   -- machine-evaluable rule, e.g. {"type":"count","source":"mentoring","op":">=","value":5}
  icon_url TEXT, tier TEXT
)

user_badges (
  id UUID PK, user_id UUID FK -> users, badge_id UUID FK -> badges,
  awarded_at TIMESTAMPTZ DEFAULT now()
)

-- WEEKLY streaks (§11.10) — a streak week counts only if the student completed at least
-- one *meaningful* action (see §11.10 for the qualifying action list), not mere app opens
streaks (
  id UUID PK, user_id UUID FK -> users, activity_type TEXT DEFAULT 'weekly_participation',
  current_week_count INT DEFAULT 0, longest_week_count INT DEFAULT 0,
  last_qualifying_week DATE,   -- ISO week start date of the last week a meaningful action occurred
  freeze_tokens INT DEFAULT 0
)

missions (
  id UUID PK, title TEXT, description TEXT,
  criteria JSONB, reward_xp INT,
  scope TEXT CHECK (scope IN ('individual','team')),
  start_date TIMESTAMPTZ, end_date TIMESTAMPTZ,
  created_by UUID FK -> users
)

mission_progress (
  id UUID PK, mission_id UUID FK -> missions,
  user_id UUID FK -> users NULL, team_id UUID FK -> teams NULL,
  status TEXT CHECK (status IN ('accepted','in_progress','completed')),
  completed_at TIMESTAMPTZ NULL
)

-- Notifications & Escalation
notification_rules (
  id UUID PK, trigger_type TEXT, condition JSONB,
  audience TEXT CHECK (audience IN ('student','management','higher_management')),
  channel TEXT CHECK (channel IN ('in_app','email','whatsapp')),
  message_template TEXT, active BOOLEAN DEFAULT true
)

notification_log (
  id UUID PK, rule_id UUID FK -> notification_rules,
  recipient_user_id UUID FK -> users, sent_at TIMESTAMPTZ,
  payload JSONB
)

-- Audit
audit_log (
  id UUID PK, actor_user_id UUID, action TEXT,
  entity_type TEXT, entity_id UUID, diff JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
)
```

**Invariants Claude Code must enforce at the service layer:**
- `xp_ledger` is insert-only — no UPDATE/DELETE endpoints exist for it, ever.
- A `review` only causes an `xp_ledger` insert when `status IN ('auto_approved','approved')`.
- `reviews.rubric_id` must always be set — never score against an unversioned rubric.
- Every mutation to `modules`, `rubrics`, `reviews` (management edits) writes an `audit_log` row.
- `reviews.criteria_levels` must only contain `level_key` values that exist in `performance_levels`
  — no reviewer (AI or human) ever enters a free-form numeric score; see §11.
- `bonus_awards.awarded_by` must always resolve to a `management`/`mentor` user — the AI Judge may
  *suggest* a bonus in its feedback text, but can never insert a `bonus_awards` row itself.
- `student_topic_performance` and any other individual performance data must never be written into
  the vector DB / knowledge base — it lives only in Postgres and is passed to the LLM as context at
  query time (§12.2).

---

## 3. API Contract (REST, JSON)

Base path `/api/v1`. Auth via `Authorization: Bearer <JWT>`; role enforced by middleware per route.

### Admin/Management
- `POST /modules` — create module (role: admin) → body: `{type, title, mode, due_date, xp_weight, is_team_based, rubric_id}`
- `PATCH /modules/:id` — update/publish/archive
- `POST /rubrics` — create rubric version `{module_type, criteria[], ai_judge_prompt_template, confidence_threshold}`
- `GET /reviews?status=pending_review&cohort=&module_type=` — Management review queue
- `PATCH /reviews/:id` — Management approves/edits: `{score, feedback_text, status}` → triggers XP ledger write if approved
- `GET /reports?filters...` — filterable report endpoint (§11 in design doc dimensions)
- `POST /notification-rules`, `PATCH /notification-rules/:id`
- `GET /escalations` — Higher Management dashboard feed

### Student
- `GET /modules?status=published` — catalog
- `POST /enrollments` — enroll self or team `{module_id}`
- `POST /submissions` — submit `{enrollment_id, artifact_type, artifact_ref, team_role?}`
- `GET /me/xp` — ledger summary, level, streaks, badges
- `GET /me/enrollments`
- `GET /leaderboard?scope=individual|team&window=week|month|year&cohort=`

### AI Coach (chat surface)
- `POST /coach/message` — `{user_id, message}` → returns Coach reply; internally invokes tool-calling against the read endpoints above plus a constrained `POST /coach/actions/accept-mission`
- `GET /coach/nudges/pending` — used by the scheduled job, not the client directly

### Internal/System
- `POST /internal/ai-judge/score-submission` — invoked by the submission-created event; not client-facing
- `POST /internal/attendance-sync` — webhook from Katalyst Konnect

All list endpoints support `?page=&pageSize=` and return `{data, total, page}`.

---

## 4. AI Judge — Implementation Spec

### 4.1 Trigger
On `submissions` insert (or on `attendance_sync` webhook for session-attendance), enqueue a `score-submission` job (BullMQ) with `submission_id`.

### 4.2 Prompt construction
The job handler:
1. Loads `submission`, its `enrollment` → `module` → `rubric` (and `rubric_role_criteria` if team project + `team_role` set).
2. Builds a Claude API call with:
   - **System prompt** (fixed, from `/packages/ai-judge`): instructs the model it is scoring a student submission against a fixed rubric, must be evidence-based and specific, must not fabricate criteria not in the rubric, must return **only** structured output.
   - **User content**: rubric criteria (JSON), the submission artifact content (extracted text, or attendance/certificate metadata), and module context (mandatory/optional, due date, days late if any).
   - **Tool/function schema** forcing structured JSON output — note this is **level-based**, per
     the design team's model (§11): the AI Judge never emits a raw numeric score, it selects one
     of the four fixed performance levels for each criterion, and the XP is computed deterministically
     by the service layer, not by the model:
     ```json
     {
       "criteria_levels": [
         {
           "criterion_key": "string (must match a criterion key in the rubric)",
           "level_key": "not_demonstrated | developing | proficient | excellent",
           "justification": "string (evidence-based, cites what was/wasn't present)"
         }
       ],
       "confidence": "number (0-1)",
       "flags": ["possible_plagiarism" | "incomplete" | "off_topic" | "late_submission" |
                 "attendance_only_no_learning_action" | "none"],
       "suggested_bonus": "meaningful_revision | team_mission_help | weekly_consistency | "
                          "exceptional_improvement | early_completion_quality | none",
       "student_feedback": "string (warm, specific, references the rubric criteria, 3-5 sentences)"
     }
     ```
   - `suggested_bonus` is advisory only — per the invariant in §2, the AI Judge cannot itself write
     a `bonus_awards` row; a human must confirm it. This keeps bonuses "used sparingly" as specified.
3. Validate the response against this schema — every `criterion_key` must exist in the rubric and every
   `level_key` must exist in `performance_levels` (reject/retry once on malformed or unknown-key output;
   on second failure, route straight to `pending_review` with `flags: ["ai_parse_error"]`).
4. **Service layer computes XP deterministically** (never trust the model to do arithmetic):
   ```
   for each criteria_level:
     earned_pct = criterion.weight_pct * performance_levels[level_key].percentage / 100
   total_earned_pct = sum(earned_pct across all criteria)
   xp_awarded = round(total_earned_pct / 100 * module.xp_weight)
   ```
   This reproduces the worked example in §11 exactly (Completion 25×100%=25, Quality 30×75%=22.5,
   Application 25×75%=18.75, Originality 10×50%=5, Timeliness 10×100%=10 → 81.25% → XP scaled by
   the module's example-maximum weight).

### 4.3 Routing logic
```
if module.type == 'online_course' and evidence is purely auto-graded (completion+quiz signals only,
                                                                        no open-ended reflection text):
    status = 'auto_approved'   # no LLM call needed for pure system-of-record signals
elif module.type == 'training_session':
    # IMPORTANT (design team rule): physical/virtual attendance alone is NEVER auto-approved
    # for full XP. Attendance is only 40% of the rubric — the AI Judge must still evaluate
    # participation + quiz/activity + reflection evidence before this can auto-approve.
    if attendance == true and no other learning-action evidence submitted:
        status = 'pending_review'
        flags += ['attendance_only_no_learning_action']
    elif confidence >= rubric.confidence_threshold and flags has no blocking flag:
        status = 'auto_approved'
    else:
        status = 'pending_review'
elif confidence >= rubric.confidence_threshold and flags has no blocking flag:
    status = 'auto_approved'
else:
    status = 'pending_review'
```
- `auto_approved` → immediately: insert `xp_ledger` row using `reviews.xp_awarded` (computed per §4.2 step 4), update `enrollments.status = 'completed'`, notify AI Coach service to deliver feedback.
- `pending_review` → appears in Management's `/reviews` queue with the AI draft (`criteria_levels` + `suggested_bonus`) pre-filled; Management's `PATCH /reviews/:id` can change any `level_key` before approving — `xp_awarded` is always recomputed server-side from whatever levels are finally confirmed, never taken from the AI's number as-is.

### 4.4 Team project & team-contribution roll-up (finalized formula, §11.6)
For `is_team_based` modules, two module types apply this differently:

- **`project` (team variant)**: each `team_role` submission is scored independently against its
  `rubric_role_criteria` slice (Problem understanding, Quality of solution, Practical implementation,
  Documentation/presentation, Milestone completion, Collaboration — individual projects substitute
  Collaboration with Individual initiative). Once **all required roles** for a team have an
  `approved`/`auto_approved` review, a final integration review scores the "Collaboration" criterion
  against the merged deliverable.
- **`team_contribution` module type**: uses the explicit two-part formula from §11.6:
  ```
  final_team_xp_for_member = team_outcome_xp + individual_contribution_xp
  ```
  where:
  - `team_outcome_xp` — same value awarded to every member, from the shared team-level rubric
    (Assigned responsibility completed, Quality of contribution, Collaboration & communication,
    Timeliness, Peer/mentor acknowledgment) — computed exactly like §4.2 step 4, level-based.
  - `individual_contribution_xp` — a **0–30 XP** discretionary amount Management (optionally
    mentor-assisted) assigns per member based on their specific contribution — **never
    auto-computed or defaulted to equal split** by the AI Judge; this must always be an explicit
    human input per the design team's "do not give identical XP to every team member automatically" rule.
  - Result capped at the module's example maximum (100 XP in the design team's example).
  - Two `xp_ledger` rows are written per member: one `source_type='review', reason='team_outcome'`
    and one `source_type='review', reason='individual_contribution'` — kept separate for audit/reporting
    even though they're shown to the student as one combined total.

### 4.5 Calibration/monitoring
- Nightly job samples 10% of `auto_approved` reviews from the prior 24h and creates a `pending_review` shadow-copy for Management to blind-score, logging agreement for a dashboard metric (`ai_judge_override_rate`).

---

## 5. AI Coach — Implementation Spec

### 5.1 Interaction model
Claude API call with **tool-calling** — Coach is given read-only tools (and one narrow write tool) so it always answers from live data, never invents progress numbers.

**Tool definitions (function-calling schema):**
- `get_student_progress(user_id)` → XP total, level, streaks, active enrollments, days-to-due-date list
- `get_leaderboard(user_id, scope, window)` → rank + neighbors
- `get_recent_reviews(user_id, limit)` → recently approved feedback not yet delivered
- `get_available_missions(user_id)` → open missions matching gaps
- `accept_mission(user_id, mission_id)` → write action, inserts `mission_progress`
- `get_module_catalog(filter)` → answer "what's due / what's this worth" questions
- `search_knowledge_base(query, filters)` → RAG lookup against mentor-ingested documents (§12.4),
  filtered by `grade`/`subject`/`chapter`/`topic` metadata; used when the student asks a content
  question rather than a progress question (e.g. "I don't understand quadratic equations")
- `get_topic_performance(user_id, subject?)` → reads `student_topic_performance` (SQL, never the
  vector DB) to ground personalized explanations in the student's actual weak areas

**System prompt (fixed, `/packages/ai-coach`):** defines persona (warm, encouraging, concise, never shaming), instructs it to always call `get_student_progress` before making any claim about the student's status, forbids inventing XP numbers, instructs it to frame competition positively and keep team-inactivity nudges private, and — for content questions — instructs it to always call `search_knowledge_base` and ground its answer in retrieved, mentor-approved material rather than general knowledge, citing the source document type (e.g. "from your Grade 10 Algebra notes") so students trust the answer as programme-endorsed.

### 5.2 Scheduled nudge job — participation nudges vs. engagement-health support
Two distinct trigger families, evaluated separately (per §11.11 — engagement-health variables must
never reduce XP, only trigger support):

- **Participation/motivation nudges** (`notification_rules.trigger_type IN ('inactivity','due_soon','streak_risk','rank_drop')`) — light, gamified, sent directly to the student by the Coach.
- **Engagement-health signals** (`trigger_type IN ('days_since_last_activity','overdue_mandatory_count','consecutive_missed_sessions','unread_feedback','submission_awaiting_revision','upcoming_deadline_load','declining_completion_trend','mentoring_inactivity')`) — computed nightly per student from live data (no new "penalty" table — these are read-model queries, e.g. `days_since_last_activity = now() - MAX(xp_ledger.created_at)`), and when a threshold is crossed:
  1. The student still gets a supportive, non-judgmental Coach nudge (never phrased as a warning).
  2. Additionally, `management`/`mentor` audience notification rules fire so a human can proactively reach out — this is the "trigger support, not reduce XP" behavior explicitly required by the design team.

A BullMQ cron job runs daily per active student, evaluates both rule families, and for any rule that fires:
1. Calls the Coach's message-generation path (same system prompt, but a "proactive nudge" instruction + the specific trigger context) to draft a natural-language nudge.
2. Delivers via `in_app` (push into Coach chat as a Coach-initiated message) and, per rule config, also `email`/`whatsapp`.
3. Logs to `notification_log`.

### 5.3 Feedback delivery
When a `review` transitions to `approved`/`auto_approved`, an event triggers the Coach to proactively message the student with a natural-language rendering of `feedback_text` (Coach rewrites the rubric-based feedback conversationally — same underlying content, friendlier delivery), not a raw score dump.

---

## 6. Gamification Engine Logic

- **XP calculation**: per §4.2 step 4 — level-based, computed server-side as `sum(criterion.weight_pct * level.percentage/100) → scaled by module.xp_weight`, written once per approved review — never recalculated after the fact (corrections happen via a new `manual_adjustment` ledger entry with a reason, preserving history).
- **Optional-activity monthly cap (§11.8)**: for `module.mode == 'optional'`, before inserting the `xp_ledger` row, sum that user's `optional`-mode XP already earned in the current calendar month; if `already_earned + new_xp_awarded > rubric.xp_cap_amount` (design team default: 150/month), clip the inserted amount to the remaining headroom and record the clipped amount in `reason` (e.g. `"capped: 20 of 35 XP counted, monthly optional cap reached"`) — the full uncapped score is still stored on the `review` for transparency, only the ledger insert is capped.
- **Levels**: static threshold table (config, not hardcoded) mapping cumulative XP → level name; computed on read from `SUM(xp_ledger.xp_amount)`.
- **Bonus variables (§11.9)**: applied via a *separate* `bonus_awards` insert (never folded into the rubric's `xp_awarded`), always human-authorized (see invariant in §2). Suggested defaults: meaningful revision +5–10, team-mission help +5, weekly consistency +5, exceptional improvement +10, early completion with accepted quality +5 — **never** award early-completion bonus if the same review's quality-related criteria came in at `developing` or `not_demonstrated` (a rushed low-quality submission must not get rewarded for speed).
- **Streaks — weekly, meaningful-action only (§11.10)**: updated by a job that runs at each week boundary (not daily). A "qualifying week" requires at least one of: attended a session, submitted an activity, completed a mentoring action item, responded to feedback, or completed a course unit — detected by checking for a qualifying `xp_ledger`/`reviews` event within that ISO week. If the just-ended week qualifies, increment `current_week_count`; if it doesn't and a `freeze_token` is available, consume one and hold the streak; otherwise reset `current_week_count` to 0. Weekly (not daily) is a deliberate design-team choice to accommodate differing student schedules.
- **Engagement-health signals do not touch XP or streaks** — they are pure read-model queries (§5.2) used only for Coach support-nudges and Management/mentor escalation, never for scoring or leaderboard penalties.
- **Badges**: evaluated synchronously right after every `xp_ledger` insert — run all `badges.rule_expression` against the user's updated aggregate stats; insert `user_badges` for any newly satisfied rule (idempotent — check not already awarded).
- **Leaderboard**: computed via a materialized view or Redis sorted set, refreshed on each ledger write (`ZINCRBY leaderboard:{scope}:{window} xp_amount user_id`), read-through cache with the DB as fallback of truth.

---

## 7. Non-Functional Requirements

- **Security**: all file submissions scanned/validated by type & size; signed S3 URLs for upload; RBAC enforced server-side on every route, never trust client role claims.
- **Auditability**: every `reviews` and `modules`/`rubrics` mutation logged to `audit_log`; `xp_ledger` immutability enforced at the DB permission level (app's DB role has no UPDATE/DELETE grant on that table).
- **Performance**: leaderboard reads must be O(1)-ish via Redis; AI Judge calls are async (never block the submission API response — submission returns `202 Accepted` with `status: pending_scoring`).
- **Resilience**: AI Judge/Coach calls wrapped with retry + circuit breaker; on sustained AI Judge outage, all new submissions route straight to `pending_review` (fail open to human queue, never fail closed / silently drop).
- **Observability**: dashboards for AI Judge auto-approval rate, override rate, average review turnaround time, nudge delivery success rate, monthly engagement %.

---

## 8. Environment & Config

- `.env` (never committed): `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`, `S3_*`, `WHATSAPP_API_*`, `EMAIL_PROVIDER_*`, `JWT_SECRET`, `KATALYST_KONNECT_API_*`.
- Feature flags table or config service for: AI Judge confidence thresholds per module type, nudge rule toggles, escalation thresholds — so Management can tune without a redeploy.

---

## 9. Testing Strategy

- **Unit**: XP calculation, badge rule evaluator, streak logic, rubric-score-to-XP mapping — pure functions, high coverage.
- **Contract tests**: AI Judge output schema validation (reject malformed LLM output deterministically in tests using fixture responses).
- **Integration**: submission → AI Judge → routing → (auto-approve or queue) → ledger write → leaderboard update, run end-to-end against a test DB.
- **Golden-set eval for AI Judge**: a curated set of ~30–50 real/sample submissions per module type with human-assigned "true" scores, run nightly in CI against the current rubric/prompt to catch scoring drift before it ships.
- **Load test**: leaderboard read path and AI Judge queue under simulated cohort-wide submission bursts (e.g., assignment due-date rush).

---

## 10. Build Plan — Sequenced Epics for Claude Code

Build and verify each epic before starting the next; each should end in a working, tested slice.

**Epic 1 — Foundations**
1.1 Monorepo scaffold, shared-types package, CI pipeline (lint/test/build).
1.2 Postgres schema migrations for §2 (core tables only: users, teams, modules, rubrics, enrollments, submissions, reviews, xp_ledger).
1.3 Auth middleware + RBAC (student/admin roles only for now).

**Epic 2 — Admin module management (A, D, E)**
2.1 `POST/PATCH /modules`, `POST /rubrics` endpoints + admin UI form.
2.2 Module catalog listing + publish/archive flow.

**Epic 3 — Student enrollment & submission (B, I, J)**
3.1 `GET /modules`, `POST /enrollments`, `POST /submissions` + file upload to S3.
3.2 Student catalog + "My Enrollments" UI.

**Epic 4 — AI Judge (F, G, C)**
4.1 BullMQ job + Claude API integration with the level-based schema in §4.2, fixture-based tests first (no live API needed to test routing logic).
4.2 Seed `performance_levels` (§11.9) and per-module-type `rubrics.criteria` from §11.1–§11.8; deterministic XP calculation service (§4.2 step 4) as a pure, independently unit-tested function.
4.3 Routing logic (§4.3), including the training-session "attendance alone ≠ full XP" rule, + `xp_ledger` insert on auto-approval.
4.4 Management review queue UI (level-picker per criterion, not a numeric field) + `PATCH /reviews/:id` approve/edit flow.
4.5 `bonus_awards` endpoint + UI (human-only, with the early-completion/quality guardrail from §6).
4.6 Golden-set eval harness (§9).

**Epic 5 — XP & student view (K)**
5.1 `GET /me/xp` endpoint, level thresholds, student dashboard UI.

**Epic 6 — AI Coach (L)**
6.1 Tool-calling setup with the read-only tools (§5.1), `/coach/message` endpoint.
6.2 Chat UI (primary student surface).
6.3 Feedback delivery event hook (§5.3).
6.4 Scheduled nudge job (§5.2) for due-date and inactivity rules only, to start.

**Epic 7 — Reporting (H)**
7.1 `/reports` endpoint with filter dimensions, admin reporting UI.

→ **MVP complete at end of Epic 7 (Must-Haves A–L fully working).**

**Epic 8 — Gamification layer**
8.1 Badges + rule evaluator, streaks job, leaderboard (Redis) + UI.
8.2 Missions engine + Coach tool `get_available_missions`/`accept_mission`.

**Epic 9 — Team-based work (M, N)**
9.1 `teams`, `team_memberships`, `rubric_role_criteria` tables + team enrollment flow.
9.2 Per-role AI Judge scoring + Project team roll-up (§4.4).
9.3 `team_contribution` module type: `team_outcome_xp` + human-entered `individual_contribution_xp` (0–30) flow (§11.6/§4.4) — UI must force explicit per-member entry, no default/equal-split affordance.
9.4 Team leaderboard.

**Epic 10 — Notifications & Escalation (O)**
10.1 `notification_rules` engine + email/WhatsApp integration.
10.2 Engagement-health read-model queries (§11.12) feeding both student support-nudges and management/higher-management escalation feeds — implemented as queries, not stored penalty state.
10.3 Escalation dashboard for Higher Management.

**Epic 11 — Weekly streaks & optional-activity cap rework**
11.1 Migrate `streaks` to weekly semantics (§11.11) with the qualifying-action detection job.
11.2 Optional-activity monthly XP cap enforcement at ledger-insert time (§11.8/§6).

**Epic 12 — Mentor Knowledge Base & RAG (§12)**
12.1 `knowledge_documents` table + mentor/admin upload UI + S3 storage.
12.2 Ingestion pipeline job (parse → clean → chunk → embed → vector DB) per §12.3.
12.3 `student_topic_performance` table + a population strategy (from `reviews`/assessment data — define the mapping as part of this ticket).
12.4 `search_knowledge_base` + `get_topic_performance` Coach tools (§12.4/§5.1), wired into the Coach's content-question path.
12.5 `rag_eval_set` seeding UI/import + eval harness (§12.6), ideally sharing infrastructure with the AI Judge golden-set harness (§9).

**Epic 13 — Hardening**
13.1 Full observability dashboards, load testing, calibration sampling job, security review pass.

---

## 11. Finalized XP Weighting & Scoring Model (Design Team Input — Authoritative)

This section is the ground truth for every `rubrics.criteria` row Claude Code seeds/migrates, and
for the AI Judge prompt templates in `/packages/ai-judge`. Weights are percentages that must sum to
100 per module type. "Example maximum" is the `modules.xp_weight` a typical module of that type
should be configured with — actual XP scales with `total_earned_pct` per §4.2 step 4.

### 11.1 Training session — example max 40 XP
| Criterion key | Weight |
|---|---|
| `attendance` | 40% |
| `participation` | 25% |
| `quiz_activity` | 25% |
| `reflection_feedback` | 10% |

**Rule**: attendance alone must never yield full XP — the student must show at least one other
meaningful learning action (participation, quiz/activity, or reflection) or the submission routes to
`pending_review` with `flags: ["attendance_only_no_learning_action"]` (§4.3).

### 11.2 Online course — example max 100 XP
| Criterion key | Weight |
|---|---|
| `course_completion` | 35% |
| `assessment_score` | 30% |
| `certificate_evidence` | 15% |
| `learning_reflection` | 10% |
| `timeliness` | 10% |

### 11.3 Assignment — example max 100 XP
| Criterion key | Weight |
|---|---|
| `requirement_completion` | 25% |
| `quality_accuracy` | 30% |
| `application_of_learning` | 25% |
| `originality_problem_solving` | 10% |
| `timeliness` | 10% |

### 11.4 Mentoring/coaching task — example max 60 XP
| Criterion key | Weight |
|---|---|
| `session_attendance` | 20% |
| `preparation` | 15% |
| `participation` | 20% |
| `action_item_completion` | 30% |
| `reflection_progress_update` | 15% |

**Rule**: the mentor must explicitly confirm whether agreed action items were completed —
`action_item_completion` cannot be scored by the AI Judge from submitted text alone; it requires a
`reviewer_type='management'` (mentor) confirmation step, so mentoring reviews for this criterion
always route to `pending_review` at minimum for that criterion's confirmation.

### 11.5 Project (individual or team) — example max 200 XP
| Criterion key | Weight |
|---|---|
| `problem_understanding` | 15% |
| `quality_of_solution` | 25% |
| `practical_implementation` | 20% |
| `documentation_presentation` | 10% |
| `milestone_completion` | 15% |
| `collaboration` (team) / `individual_initiative` (individual) | 15% |

The rubric's `criteria` JSON should include both variants; module setup picks the applicable one
based on `modules.is_team_based`.

### 11.6 Team contribution — example max 100 XP (own module type, distinct from Project)
| Criterion key | Weight |
|---|---|
| `assigned_responsibility_completed` | 35% |
| `quality_of_contribution` | 25% |
| `collaboration_communication` | 20% |
| `timeliness` | 10% |
| `peer_mentor_acknowledgment` | 10% |

**Formula**: `final_team_xp_for_member = team_outcome_xp + individual_contribution_xp` (0–30 XP,
human-assigned, never auto-split equally) — see §4.4 for full implementation detail.

### 11.7 Certificate-based course — example max 120 XP
| Criterion key | Weight |
|---|---|
| `valid_certificate` | 30% |
| `course_completion` | 20% |
| `assessment_score` | 25% |
| `relevance_to_pathway` | 10% |
| `reflection_application` | 15% |

### 11.8 Optional/self-driven activity — capped at 150 XP/month
| Criterion key | Weight |
|---|---|
| `verified_completion` | 30% |
| `relevance` | 20% |
| `quality` | 20% |
| `application` | 20% |
| `reflection` | 10% |

Cap implementation: §6 (Gamification Engine Logic) — enforced at ledger-insert time, not at
review-scoring time, so the true score is always preserved for the record.

### 11.9 Performance levels (used for every criterion, every module type)
| Level key | Label | Percentage |
|---|---|---|
| `not_demonstrated` | Not demonstrated | 0% |
| `developing` | Developing | 50% |
| `proficient` | Proficient | 75% |
| `excellent` | Excellent | 100% |

Reviewers (AI Judge draft, Management confirm) select **one level per criterion** — never a free
numeric entry. Worked example (Assignment): Completion 25%×100%=25.0, Quality 30%×75%=22.5,
Application 25%×75%=18.75, Originality 10%×50%=5.0, Timeliness 10%×100%=10.0 → **81.25%** total
→ XP = `0.8125 × module.xp_weight`.

### 11.10 Bonus variables (use sparingly — always human-authorized)
| Bonus type | XP |
|---|---|
| `meaningful_revision` | +5 to +10 |
| `team_mission_help` | +5 |
| `weekly_consistency` | +5 |
| `exceptional_improvement` | +10 |
| `early_completion_quality` | +5 |

Guardrail: never grant `early_completion_quality` if the submission's quality-type criteria scored
`developing` or below — see §6.

### 11.11 Streaks — weekly, meaningful participation only
Qualifying actions for a streak week: attended a session · submitted an activity · completed a
mentoring action item · responded to feedback · completed a course unit. Daily streaks are
explicitly rejected by the design team in favor of weekly, to accommodate varying student schedules.
Implementation: §6.

### 11.12 Engagement-health variables — trigger support, never reduce XP
`days_since_last_meaningful_activity`, `overdue_mandatory_task_count`, `consecutive_missed_sessions`,
`unread_feedback_count`, `submissions_awaiting_revision`, `upcoming_deadline_load`,
`declining_completion_trend`, `mentoring_inactivity_days`. These are computed read-models (no XP or
streak impact) that drive Coach support-nudges and Management/mentor escalation only — see §5.2, §10 (O).

---

## 12. Mentor-Ingested Knowledge Base & RAG Subsystem

Extends the AI Coach so it can answer *content* questions ("I don't understand quadratic equations")
using mentor-approved material, personalized against the student's actual weak topics — not just
progress questions. This is additive to the AI Coach in §5, sharing the same chat surface.

### 12.1 Data intake (from NGO/programme content owners)
Request five categories from Katalyst content owners, ingested as `knowledge_documents`:
1. **Curriculum** — syllabus, subjects, chapters, learning objectives
2. **Learning content** — notes, PDFs, worksheets, study material
3. **Assessments** — tests, question papers, answer keys, rubrics
4. **Personalization data** — student scores, topic-wise performance, previous attempts (→ **not**
   ingested into the knowledge base; this maps to `student_topic_performance` in SQL, §2)
5. **Teacher/mentor knowledge** — FAQs, common mistakes, improvement strategies

Also collect **20–100 real student questions with mentor-approved answers** up front — this becomes
the `rag_eval_set` used for evaluation before scaling (§12.6), not an afterthought.

### 12.2 Data separation — hard rule
| Goes into Vector DB (RAG) | Goes into PostgreSQL |
|---|---|
| Curriculum, notes, worksheets | Student profile, scores, attempts |
| FAQs, mentor-approved explanations | Topic-wise performance (`student_topic_performance`) |
| Remedial material | Progress, previous recommendations |

**Never put individual student performance data in the vector DB** — it must only ever be passed to
the LLM as retrieved *context* from a SQL query at answer time, never embedded/indexed as a document
(enforced by the invariant in §2).

### 12.3 Ingestion pipeline
```
Mentor/Admin uploads document (PDF/DOCX/etc. via admin or mentor UI, stored to S3, row in
  knowledge_documents, status='uploaded')
  → Parse (extract text; status='parsing')
  → Clean + de-duplicate
  → Structure-aware chunking (respect headings/sections, not fixed-size blind chunking)
  → Attach metadata to every chunk: {grade, subject, chapter, topic, document_type, source,
    version, language} — pulled from the document's knowledge_documents.metadata plus any
    chunk-level overrides
  → Generate embeddings → write to vector DB collection (status='embedded',
    vector_namespace set)
  → On any failure at any stage: status='failed', surfaced in the admin UI for re-upload/retry
```
Runs as a BullMQ job triggered on `knowledge_documents` insert, mirroring the AI Judge's async
pattern (§4.1) — uploads must not block the mentor's UI.

### 12.4 RAG query pipeline (invoked by the Coach's `search_knowledge_base` tool, §5.1)
```
Student question
  → Identify student + resolve grade/cohort context
  → get_topic_performance(user_id) from SQL (student's weak topics, accuracy %)
  → Vector search filtered by grade/subject (+ topic if inferable from the question)
  → Rerank/filter top results for relevance
  → LLM call: question + retrieved mentor-approved material + student's topic-performance context
  → Response: grounded explanation + a personalized suggestion tied to the student's actual gap
    (e.g. targeted practice for the specific weak topic, not generic content)
```
Example (from the design brief): a Grade 10 student asking about quadratic equations, with SQL
showing 42% algebra accuracy and "quadratic equations" flagged weak, retrieves Grade 10 Algebra
material from the vector DB and produces an explanation plus targeted exercises — not a generic
textbook answer.

### 12.5 Coach integration
The `search_knowledge_base` tool (§5.1) is called whenever the Coach's system prompt classifies the
incoming message as a content/learning question rather than a progress/XP question. The Coach must
cite that its answer comes from programme material (builds trust, and lets Claude Code write a
straightforward eval: does the response reference retrieved content, not just model knowledge).

### 12.6 Evaluation before scaling
Before wiring the RAG pipeline into production nudges/answers broadly, run the `rag_eval_set`
(20–100 mentor-approved Q&A pairs) through it and score:
- **Retrieval accuracy** — did the right document/chunk come back for the question
- **Answer correctness** — does the LLM's answer match the mentor-approved answer's substance
- **Hallucination rate** — does the answer introduce claims not present in retrieved material
- **Personalization quality** — does the answer actually use the student's topic-performance context
  when relevant, rather than ignoring it
- **Alignment with mentor/teacher expectations** — spot-check against `teacher_knowledge`-sourced
  documents specifically (common mistakes, expected framing)

This mirrors the AI Judge's golden-set eval harness (§9) and should reuse the same CI eval pattern —
Claude Code should build one shared "LLM eval harness" package if practical, rather than two
divergent ones.

---

## 13. Definition of Done (MVP, end of Epic 7)

- An Admin can create a module of every type, mandatory/optional/certificate.
- A Student can enroll, submit, and see status change through the pipeline in real time.
- The AI Judge scores every module type against its §11 weight table using level selection (never free numeric entry), auto-approves pure auto-graded/system-of-record signals, and routes everything else — including any training session with attendance but no other learning-action evidence — to a Management queue with a usable level-based draft.
- Management can approve/edit levels and see the resulting, deterministically-computed XP land in the student's ledger within seconds.
- A Student can converse with the AI Coach and get accurate, live progress info and delivered feedback — no hallucinated numbers (verified against golden-set + tool-forced answers).
- Admin can pull a filtered completion report by cohort/module type/date.
- Every score is traceable via `audit_log` back to a rubric version, the exact per-criterion levels selected, and a decision-maker (AI or named human).

**Note**: weekly streaks/optional-activity caps (Epic 11), the mentor RAG knowledge base (Epic 12),
and the full team-contribution formula (Epic 9.3) are scoped as post-MVP but are fully specified
above (§11, §12) so they can be built immediately after Epic 7 without further design input.

---

## 14. Free-Tier External API Stack (Hackathon-Ready Amendment)

§1's stack assumes paid managed services (AWS S3, Anthropic pay-as-you-go, dedicated vector DB).
For a one-shot build with **zero required paid signups**, substitute the following. Every item below
has a free tier sufficient for a hackathon demo / small-cohort pilot. This supersedes §1/§8 where they
conflict; keep §1's architecture, swap only the providers.

| Need | Free provider | Free-tier limit | Notes |
|---|---|---|---|
| LLM (AI Judge + AI Coach) | **Groq API** (Llama 3.3 70B / Llama 4) | Generous free requests/min, no card required | Fastest free inference, good structured-output/tool-calling support. Fallback: **Google Gemini API** free tier (Gemini 2.5 Flash) — also free, strong JSON-mode + tool-calling |
| Postgres + Auth + Object storage | **Supabase** | 500MB DB, 1GB file storage, 50k monthly active users, free forever tier | Replaces Postgres+S3+Auth in one signup; ships `pgvector` extension enabled — no separate vector DB needed |
| Vector DB (RAG, §12) | **Supabase pgvector** (same instance) | Included in Supabase free tier | No separate service — confirms §1's "default recommendation: pgvector" |
| Cache / Job Queue | **Upstash Redis** | 10k commands/day free, no card required | REST-based, works from serverless; BullMQ-compatible via ioredis-compatible endpoint or use Upstash's own QStash for the cron/nudge jobs |
| Transactional email | **Resend** or **Brevo** | Resend: 3,000 emails/mo free · Brevo: 300/day free | Either works with a simple SMTP/HTTP call |
| WhatsApp notifications | **Meta WhatsApp Cloud API** | 1,000 free service conversations/month | Official Meta API, no third-party markup; requires a Meta developer app + test number (free) |
| Frontend hosting | **Vercel** (Hobby tier) | Free for non-commercial/small projects | Native Next.js support |
| Backend hosting | **Render** or **Railway** free tier / or fold API into Next.js API routes deployed on Vercel | Free tier with sleep-on-idle | For a one-shot build, simplest is to **not** run a separate Fastify service at all — see §16 |
| Auth (if not using Supabase Auth) | **Google OAuth** | Free, unlimited | Standard OIDC, zero cost regardless of scale |
| Content moderation (peer chat, §15) | **Groq/Gemini free LLM call** as a moderation classifier | Same free quota as above | No dedicated moderation API needed — a small classification prompt is enough at this scale |

**No paid API is required to build or demo the full platform**, including AI Judge, AI Coach, RAG,
notifications, and peer matching. `ANTHROPIC_API_KEY` in §8's env list becomes optional — replace with
`GROQ_API_KEY` (primary) and `GEMINI_API_KEY` (fallback/secondary), selected via a single
`packages/ai-client` abstraction so swapping providers later (e.g. to Claude) is a one-line config
change, not a rewrite.

---

## 15. Peer Collaboration & Complementary-Skill Matching (New Feature)

**Goal**: turn each student's measured strengths/weaknesses (already tracked in
`student_topic_performance`, §2) into constructive peer pairings — group students so that what one
lacks, another in the group already excels at, and vice versa, so every group produces a **net
positive** skill transfer in both directions rather than one-directional tutoring.

### 15.1 Design principles
- **Reciprocity, not charity**: a match is only proposed if it's mutually beneficial — Student A is
  strong where B is weak, *and* B is strong where A is weak (in a different topic/subject). Purely
  one-directional "tutor/tutee" pairing is deprioritized in favor of reciprocal squads.
- **Constructive framing only**: no public "weakest student" labeling anywhere in the UI — matching
  runs entirely off backend data; students only ever see "you're strong in X, this group needs that"
  and "this group has strength in Y, which matches your growth area."
- **Opt-in, gamified, low-friction**: joining a squad earns XP (reuses the existing `team_mission_help`
  bonus type, §11.9/§6) — collaboration is rewarded, not mandatory.
- **Safety**: lightweight AI moderation on group chat (§15.5) keeps interaction constructive; students
  can report/leave a squad at any time.

### 15.2 New schema (extends §2)
```sql
-- A short-lived, purpose-formed group (distinct from `teams`, which is project/org structure)
study_squads (
  id UUID PK,
  subject TEXT, topic TEXT,          -- the primary skill-gap this squad targets
  status TEXT CHECK (status IN ('proposed','active','completed','disbanded')),
  formed_by TEXT CHECK (formed_by IN ('system_match','student_request','mentor_assigned')),
  created_at TIMESTAMPTZ DEFAULT now(),
  disbanded_at TIMESTAMPTZ NULL
)

squad_members (
  id UUID PK,
  squad_id UUID FK -> study_squads,
  user_id UUID FK -> users,
  role_in_squad TEXT CHECK (role_in_squad IN ('seeking_help','offering_help','both')),
  matched_strength_topic TEXT NULL,   -- topic this member is strong in, relevant to the squad
  matched_gap_topic TEXT NULL,        -- topic this member is weak in, relevant to the squad
  joined_at TIMESTAMPTZ DEFAULT now(),
  left_at TIMESTAMPTZ NULL,
  UNIQUE(squad_id, user_id)
)

-- one row per matching-engine run; keeps the algorithm auditable/tunable
squad_match_runs (
  id UUID PK,
  run_at TIMESTAMPTZ DEFAULT now(),
  candidates_considered INT,
  squads_formed INT,
  avg_reciprocity_score NUMERIC     -- see §15.3
)

squad_messages (
  id UUID PK,
  squad_id UUID FK -> study_squads,
  sender_id UUID FK -> users,
  body TEXT,
  moderation_flag TEXT NULL CHECK (moderation_flag IN (NULL,'toxic','off_topic','reviewed_ok')),
  created_at TIMESTAMPTZ DEFAULT now()
)

-- lightweight positive-only feedback after a squad session/completion
peer_endorsements (
  id UUID PK,
  squad_id UUID FK -> study_squads,
  from_user_id UUID FK -> users,
  to_user_id UUID FK -> users,
  topic TEXT,
  comment TEXT,           -- required, constructive-only (min length, profanity-filtered)
  created_at TIMESTAMPTZ DEFAULT now()
)
```

### 15.3 Matching algorithm
Runs as a nightly (or on-demand, student-triggered) BullMQ job, `match-study-squads`:

1. **Build the skill graph**: for every active student, read `student_topic_performance` — topics
   with `accuracy_pct >= 75` and `trend IN ('stable','improving')` are that student's **strengths**;
   topics with `accuracy_pct < 50` (or `trend = 'declining'`) are their **gaps**.
2. **Score candidate pairs**: for every pair of students (A, B) in the same cohort, compute a
   **reciprocity score**:
   ```
   reciprocity(A, B) = |{topics where A is strong AND B has a gap}|
                      + |{topics where B is strong AND A has a gap}|
   ```
   Pairs with `reciprocity = 0` (one-directional or no overlap) are only used as a fallback if no
   reciprocal match exists for a student who requested help.
3. **Group formation**: greedily grow reciprocal pairs into 3–4 person squads by adding the next
   candidate whose strengths cover the squad's remaining uncovered gaps (a simple weighted
   set-cover heuristic — no external optimization library needed, plain TS is enough at cohort scale).
4. **Cap and diversify**: no student is placed in more than one active squad at a time; prefer squads
   that mix `team_role`/cohort where possible so it's not always the same clique.
5. Insert `study_squads` (`status='proposed'`) + `squad_members` with each member's
   `matched_strength_topic`/`matched_gap_topic` recorded for transparency, and one `squad_match_runs`
   row for auditability/tuning.
6. AI Coach (§5) proactively messages each proposed member: *"You're strong in [topic] and this squad
   could use that — you also get matched with someone strong in [your gap topic]. Want to join?"*
   Squad activates (`status='active'`) once a quorum (e.g. 2+) accept.

### 15.4 API additions
- `POST /squads/request-help` — student explicitly asks for help in a subject/topic → feeds the next
  matching run as a priority candidate.
- `GET /me/squads` — student's active/past squads.
- `POST /squads/:id/join`, `POST /squads/:id/leave`
- `GET /squads/:id/messages`, `POST /squads/:id/messages` — squad chat, moderated (§15.5)
- `POST /squads/:id/endorsements` — post-session constructive feedback → triggers `team_mission_help`
  XP bonus (§11.9/§6) for the endorsed member, `awarded_by` set to the endorsing student's action but
  still subject to the existing human-authorization audit trail (auto-approved for small fixed amounts
  since it's peer-to-peer and capped, e.g. +5, no management step required — configurable).
- `GET /admin/squads?status=&cohort=` — Management visibility into squad health (formed, active,
  stalled, disbanded), reusing the reporting patterns of §3/§10.

### 15.5 Moderation
Every `squad_messages` insert runs (async, non-blocking) through a single free LLM classification
call (Groq/Gemini, §14) with a fixed prompt: *"Classify this peer-study message as
constructive/neutral, off-topic, or toxic/harassing. Return only the label."* — `toxic` flags surface
in `admin/squads` for mentor review and, above a per-student threshold, temporarily suspend that
student's squad messaging (never their XP/enrollment access — moderation only ever affects the chat
feature, per the same "trigger support, never punish progress" philosophy as §11.12).

### 15.6 Net-positive metric
Track `avg_reciprocity_score` per matching run (§15.2) and, per squad, whether **both** directions of
the intended skill exchange show measurable movement — i.e. each member's `matched_gap_topic`
`accuracy_pct` in `student_topic_performance` trends `improving` within 2–4 weeks of squad activity.
Surface this as a simple admin metric ("squad effectiveness rate") — this is the platform's evidence
that matching produces a net positive outcome, not just social pairing.

---

## 16. One-Shot Execution Plan (Condensed Build Order)

§10's 13-epic plan is the *full* production roadmap. For building a working, demoable model in a
**single continuous Claude Code session**, collapse it into 6 phases, using the free stack from §14
throughout, and folding in the peer-matching feature (§15) as its own phase rather than a post-MVP
add-on. Skip anything not needed for the demo path (no separate Fastify service — use Next.js API
routes / route handlers for both student and admin apps to halve the surface area; no WhatsApp in
phase 1 — email only, add WhatsApp last if time remains).

**Phase 1 — Foundation (schema + auth + scaffolding)**
- Single Next.js app (App Router), TypeScript, Tailwind; Supabase project (Postgres+pgvector+Auth+Storage).
- Run all §2 table migrations in one pass, including §15.2's squad tables — no reason to defer schema.
- Supabase Auth (email/password or Google OAuth) with `role` claim (`student`/`admin`); RBAC middleware.

**Phase 2 — Core loop: modules → enrollment → submission**
- Admin: create/publish modules + rubrics (seed §11's criteria tables directly as fixture data, all
  module types at once — it's just JSON, no reason to build one type at a time).
- Student: catalog, enroll, submit (file → Supabase Storage, link, or text).

**Phase 3 — AI Judge**
- `packages/ai-client` abstraction over Groq (primary) / Gemini (fallback), §14.
- Level-based scoring schema + deterministic XP calc (§4.2) as pure functions, unit-tested first.
- Routing logic (§4.3) incl. training-session attendance rule; `xp_ledger` insert; Management review
  queue UI with level-pickers.

**Phase 4 — Gamification + AI Coach**
- XP ledger read model, levels, badges, weekly streaks (build weekly semantics directly — §11.10 —
  don't build-then-migrate daily streaks).
- Leaderboard via Upstash Redis sorted sets.
- AI Coach with tool-calling (§5.1) on Groq/Gemini; chat UI; feedback delivery hook.

**Phase 5 — Peer Collaboration (§15)**
- Squad/member/message/endorsement tables (already migrated in Phase 1).
- Matching algorithm as a callable job (manually triggerable button in admin UI is fine for a demo —
  BullMQ/cron optional if time-boxed).
- Squad chat with async moderation call; endorsement → XP bonus flow; admin squad-health view.

**Phase 6 — RAG Coach knowledge base (§12) + polish**
- Mentor doc upload → chunk → embed into Supabase pgvector → `search_knowledge_base` Coach tool.
- Seed a small `rag_eval_set` (10–15 pairs is enough for a demo, not the full 20–100) and sanity-check
  retrieval before declaring done.
- Reporting endpoint (§3 `/reports`) with basic cohort/module-type filters.

**Definition of done for the one-shot build**: everything in §13's MVP checklist, **plus** — a student
can request help in a weak topic, get matched into a reciprocal squad within one matching run, see why
they were matched (their strength + their gap), chat with squad-mates, and receive an endorsement that
lands as real XP in their ledger; an admin can see squad formation and effectiveness alongside the
existing AI Judge/reporting dashboards. All of it running on providers with $0 required spend (§14).
