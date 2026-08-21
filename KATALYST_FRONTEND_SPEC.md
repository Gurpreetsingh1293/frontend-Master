# Katalyst — Frontend Spec (Student + Admin Portals)

> Consolidates the frontend-relevant parts of `Katalyst_Build_Spec_for_Claude_Code.md` and
> `KATALYST_BACKEND_MVP_HANDOFF.md` into one spec scoped purely to the two Next.js portals. Backend
> data model/API implementation lives in `KATALYST_BACKEND_SPEC.md` (MongoDB); AI Judge/Coach
> internals live in `KATALYST_AI_SPEC.md`. This doc only covers what the frontend renders and which
> API contracts it builds against.

---

## 1. Stack

- **Next.js (App Router), React, TypeScript, Tailwind CSS** — one framework for both portals.
- Two portals, two role-gated route trees in the same app (or two apps sharing `backend/shared-types`
  + a `ui` component package) — whichever is faster to ship for the hackathon; role-gating happens
  at the route/middleware level, never trust a client-held role for access control (server
  re-checks every mutating call).
- Shared types come from `backend/shared-types` — never hand-duplicate API response shapes in
  frontend code.
- AI Coach is the **primary student surface** (chat), not a bolted-on widget.

---

## 2. Roles (locked for MVP)

Only two authenticated roles: **student** and **admin**. No Mentor portal, no Higher-Management
portal — do not build `/mentor/*` routes or a third nav tree. Mentors only ever appear as data
(name, organisation, expertise) inside meetings/activities managed by Admin.

---

## 3. API contracts to build against (frozen — build against mocks if backend isn't ready)

These are the contracts the backend team commits to first, per `KATALYST_BACKEND_SPEC.md` §18.
Build UI against typed mocks of these shapes so frontend work isn't blocked by backend sequencing.

```
POST /me/onboarding
GET  /interests
GET  /me/interests
PUT  /me/interests

GET  /me/dashboard
GET  /me/recommendations

GET  /modules
GET  /modules/:id

GET  /me/meetings
GET  /me/notifications

GET  /reviews
PATCH /reviews/:id
```

Full contract list (auth, XP, coach, admin CRUD, etc.) is in `KATALYST_BACKEND_SPEC.md` §5 — treat
that as the API reference; this doc only calls out the shapes that directly drive layout below.

---

## 4. Student portal

### 4.1 Registration & onboarding (first-run flow)
```
Create account (name, email, password)
  -> Basic profile
  -> Choose academic field / programme year
  -> Choose 3–6 interests (from GET /interests — a configurable catalogue, don't hardcode the list)
  -> POST /me/onboarding
  -> Redirect to personalised dashboard
```
Interests must remain editable later from the **Student Profile** screen (`GET/PUT /me/interests`).
Don't let the UI assume a fixed interest list — always fetch the active catalogue.

### 4.2 Dashboard (home)
Single aggregate fetch — `GET /me/dashboard` — renders:
- Profile summary (name, programme year, academic field, interests as chips)
- Gamification strip: total XP, level + level name, XP-to-next-level, weekly streak, leaderboard
  rank, overall completion %
- "Next best action" card
- Recommended-for-you rail (from the same payload's `recommendations`, or a follow-up call to
  `GET /me/recommendations` for the full list)
- Upcoming deadlines
- Upcoming meetings
- Active projects
- Recent achievements (badges)
- Recent activity feed

Do not implement recommendation *ranking* logic client-side — the backend returns a pre-ranked
list with a `recommendation_reason` string per item; just render it.

### 4.3 Explore / Catalog
`GET /modules?status=published&domain=&type=` — filterable by interest domain and module type.
Each module renders from the **module card contract**:
```json
{
  "id": "...", "type": "online_course", "title": "...", "summary": "...",
  "mode": "optional",
  "domains": [{"key":"financial_literacy","name":"Financial Literacy"}],
  "difficulty": "beginner", "estimated_minutes": 90,
  "due_date": null, "xp_weight": 100, "is_team_based": false,
  "enrollment_status": null,
  "recommendation": {"is_recommended": true, "reason": "Matches your Financial Literacy interest."}
}
```
Show `recommendation.reason` as a small badge/tooltip when `is_recommended` is true — this is the
main way students see *why* something is surfaced, so don't drop it in the card design.

Enroll (`POST /enrollments`) and submit (`POST /submissions` — file/link/text artifact types) flows
live here and on the module detail page (`GET /modules/:id`).

### 4.4 My Enrollments / Journey
`GET /me/enrollments` — status pipeline visualization (`enrolled → in_progress → submitted →
under_review → completed`/`overdue`). Submitted work should visibly transition in near-real-time
once Admin/AI Judge acts (poll or re-fetch on focus is fine for a hackathon build — no websockets
required).

### 4.5 XP / Level / Achievements
`GET /me/xp` — ledger summary, level, streaks, badges. Show the weekly streak as **weekly**, not
daily (a deliberate design choice — don't build a daily-streak calendar widget).

### 4.6 Leaderboard
`GET /leaderboard?scope=individual|team&window=week|month|year&cohort=` — frame competition
positively; never publicly rank or label anyone as "weakest" (this also applies to any peer-squad
UI, §4.9).

### 4.7 Meetings
`GET /me/meetings` — renders from the **meeting response contract**:
```json
{
  "id": "...", "title": "Career Readiness Mentoring Session",
  "mentor": {"id":"...", "name":"Priya Mehta", "organisation":"Partner Organisation"},
  "start_at": "2026-08-24T15:00:00+05:30", "end_at": "2026-08-24T16:00:00+05:30",
  "meeting_mode": "online", "meeting_link": "https://example.com/meeting",
  "status": "scheduled"
}
```
Student is read-only here — no create/edit affordance (Admin manages meetings, §5.4).

### 4.8 Notifications
`GET /me/notifications`, `PATCH /me/notifications/:id/read` — in-app feed, object shape:
```json
{
  "id": "uuid", "type": "meeting_rescheduled", "title": "Mentor session rescheduled",
  "message": "Your Career Readiness session is now on 24 Aug at 3:00 PM.",
  "entity_type": "meeting", "entity_id": "uuid", "read": false, "created_at": "2026-08-21T10:00:00Z"
}
```
Also give students a **Notification Preferences** screen
(`GET/PUT /me/notification-preferences`: `email_notifications_enabled`,
`meeting_update_emails`, `course_recommendation_emails`) — meeting-cancellation/reschedule stays
important even if recommendation emails are off, so don't let one toggle silence both.

### 4.9 AI Coach (chat — primary surface)
`POST /coach/message`. Persistent chat UI, not a modal. The Coach:
- Always answers progress questions from live tool calls — the UI should never need to
  client-side-compute XP/rank/streak; trust what the Coach returns.
- Handles both progress questions ("what's my rank?") and content questions ("I don't understand
  quadratic equations") in the same thread — content answers should visibly cite their source
  (e.g. "from your Grade 10 Algebra notes") so render that citation, don't strip it.
- Proactively delivers feedback and nudges as Coach-initiated messages in the same thread (not
  separate toast/email-only) — design the chat to support system-initiated messages, not just
  student-initiated ones.
- Can propose accepting a mission or joining a peer study squad inline — render these as actionable
  cards inside the chat (accept/decline), not free text the student has to interpret.

### 4.10 Peer study squads (if time allows — post-MVP but fully specified)
`GET /me/squads`, `POST /squads/:id/join`, `POST /squads/:id/leave`,
`GET/POST /squads/:id/messages`, `POST /squads/:id/endorsements`. Framing matters: show *why* a
student was matched ("you're strong in X, this group needs it; you're matched with someone strong
in your gap area Y") — never a raw weakness callout. Endorsements are positive-only, required
comment field, feed an XP bonus automatically for small capped amounts.

### 4.11 Missions / Badges
Rendered from Coach tool output (`get_available_missions`) and `GET /me/xp`'s badge list — treat as
gamification chrome, secondary to the core learning loop.

---

## 5. Admin portal

### 5.1 Module & rubric management
`POST/PATCH /modules`, `POST /rubrics`. Form must capture: type, title, description, mode
(mandatory/optional/certificate), due date, XP weight, is-team-based, rubric selection, **and the
MVP additions**: summary, difficulty, estimated minutes, thumbnail, and **domain tags**
(many-to-many against the interest catalogue with a relevance weight) plus optional skill tags.
Publish/archive is a status transition (`draft → published → archived`) — publishing is the trigger
for the module-published notification flow (§5.6), so make the publish action explicit and
confirmable, not silent.

### 5.2 Review queue (AI Judge oversight)
`GET /reviews?status=pending_review&cohort=&module_type=`. This is the most detail-sensitive screen
in the whole app:
- Render **level-pickers per criterion** (`not_demonstrated / developing / proficient /
  excellent`) — never a free numeric input. This mirrors the AI Judge's own output schema exactly.
- Show the AI Judge's draft levels + `justification` text per criterion, plus `confidence` and any
  `flags` (e.g. `attendance_only_no_learning_action`, `possible_plagiarism`).
- For mentoring-type reviews, always show a **mentor confirmation** control (confirmed/not,
  optional notes) — there's no Mentor portal, so Admin is entering this on the mentor's behalf; the
  `action_item_completion` criterion cannot be approved without it.
- `PATCH /reviews/:id` submits final levels + status; XP is always server-computed from whatever
  levels Admin confirms — the UI should show a computed XP preview but never let Admin type a raw
  XP number directly into the ledger.
- A separate, clearly-labeled **bonus award** action (`meaningful_revision`,
  `team_mission_help`, `weekly_consistency`, `exceptional_improvement`,
  `early_completion_quality`) — always human-initiated, never a default/auto-suggested checkbox
  that's pre-checked.

### 5.3 Team-contribution XP entry
For `team_contribution` modules, Admin must enter `individual_contribution_xp` (0–30) **explicitly
per member** — the UI must force one input per team member with no "apply to all"/equal-split
shortcut, per the design team's rule that identical XP must never be auto-applied across a team.

### 5.4 Meetings
`GET/POST /admin/meetings`, `PATCH /admin/meetings/:id`. Fields: mentor (record picker, not a
user picker — mentors aren't authenticated users), title, description, start/end time, mode
(online/offline/hybrid), link/location, participant students, status. Editing a "material" field
(time, mode, link, location, status) should visibly warn Admin that it triggers a student
notification — this isn't a silent save.

### 5.5 Student & cohort management
Manage students (view, cohort/batch assignment), manage mentor **records** (name, email,
organisation, expertise — not login credentials, they're not app users).

### 5.6 Partner organisations
`GET/POST/PATCH /admin/partners` — simple CRUD (name, description, logo, contact, website,
active). Optional linkage to interest domains and to specific modules.

### 5.7 Reporting & analytics
`GET /reports?filters...` — filterable by cohort/module-type/date at minimum. Also: AI Judge
auto-approval rate, override rate, review turnaround time — surfaced as an admin dashboard, not
just a raw export.

### 5.8 Engagement-health / escalation view
Read-model driven (never a stored "penalty"): days-since-last-activity, overdue mandatory count,
consecutive missed sessions, declining completion trend, mentoring inactivity, etc. Frame this
screen as "students who may need outreach," not a leaderboard-of-shame — this data never affects a
student's own visible XP/rank.

### 5.9 Notification rules
`POST/PATCH /notification-rules` — admin-tunable trigger/audience/channel/template config, so
thresholds can change without a redeploy.

### 5.10 Peer-squad health (if built)
`GET /admin/squads?status=&cohort=` — squad formation/active/stalled/disbanded counts and the
"squad effectiveness rate" metric, reusing the reporting patterns from §5.7.

---

## 6. Cross-cutting UI rules

- **RBAC UI must mirror backend RBAC** — hide (don't just disable) admin-only actions from
  students, but never rely on hiding alone; every mutating call is re-checked server-side.
- **Never invent numbers.** XP, rank, streak, recommendation scores always come from an API
  response — no client-side recomputation of anything gamification-related.
- **Constructive framing everywhere gamification touches social comparison** (leaderboard, peer
  squads, engagement-health) — no public shaming, no "weakest" labels.
- **Two roles only** — don't scaffold nav items, routes, or permission checks for `mentor` or
  `higher_management`; those are explicitly out of scope for this MVP.
- **Async status is normal** — submission review is not instant; design status chips/timelines
  (`pending_scoring → pending_review/auto_approved → approved`) rather than assuming a synchronous
  result.

---

## 7. Build order (frontend, mirrors backend phases in `KATALYST_BACKEND_SPEC.md` §16)

1. **Auth + onboarding** — register/login, interest selection, editable profile.
2. **Core loop** — Admin module create/publish form; Student catalog + enroll + submit.
3. **Notifications** — in-app feed + preferences screen (email delivery is backend-only, but the
   UI must expose the opt-in/opt-out controls).
4. **Review queue** — Admin level-picker screen (§5.2) — this is the highest-craft screen in the
   MVP; budget real design time here.
5. **Student dashboard** — aggregate view, recommendations rail, leaderboard, XP/badges.
6. **AI Coach chat** — persistent thread, actionable cards for missions/squads, source citations
   for content answers.
7. **Post-MVP, if time remains** — peer squads UI, partner org management, escalation dashboard,
   reporting polish.
