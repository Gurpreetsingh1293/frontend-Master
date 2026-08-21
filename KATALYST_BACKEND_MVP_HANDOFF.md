# Katalyst Backend MVP Handoff — Personalised Learning + Two-Portal Architecture

> **Purpose:** Rough backend skeleton for the hackathon MVP.  
> **Portals:** Student + Admin only.  
> **This document is a delta/clarification over the existing Katalyst build spec.** Where this file conflicts with the older build spec, use this file for the hackathon MVP.

---

## 1. Product decisions locked for MVP

### Roles

Only two authenticated application roles exist:

```text
student
admin
```

There is **no Mentor portal** and no authenticated `mentor` role for the MVP.

Mentors can still exist as records managed by Admin and can be attached to meetings, activities, projects, and students. Any mentor confirmation required by a scoring rubric is captured by Admin on behalf of the mentor or from an externally received confirmation.

Treat `higher_management` as an Admin permission/view for the MVP rather than a separate portal.

---

## 2. Personalised registration / onboarding

A student must choose her learning interests during registration/onboarding.

These interests are used to personalise:

- recommended courses
- recommended training sessions
- recommended projects
- recommended optional activities
- AI Coach suggestions
- course-added email notifications
- dashboard "Recommended for You"
- future learning-path recommendations

Interests must be editable later from the Student Profile.

### Suggested initial interest/domain catalogue

Seed a configurable catalogue instead of hardcoding values into frontend logic.

Examples:

```text
technology
business
leadership
communication
languages
financial_literacy
entrepreneurship
sustainability
professional_development
social_impact
digital_literacy
```

Admin should be able to add/disable domains later.

---

## 3. Required schema changes

### 3.1 Users

For the MVP, update role constraint:

```sql
users (
  id UUID PRIMARY KEY,
  external_id TEXT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,

  role TEXT NOT NULL CHECK (role IN ('student', 'admin')),

  cohort TEXT,
  batch_year INT CHECK (batch_year BETWEEN 1 AND 4),

  onboarding_completed BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

### 3.2 Student profile

Do not overload the base `users` row with all personalisation fields.

```sql
student_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id),

  college_name TEXT NULL,
  academic_field TEXT NULL,
  programme_year INT CHECK (programme_year BETWEEN 1 AND 4),

  bio TEXT NULL,

  email_notifications_enabled BOOLEAN DEFAULT true,
  course_recommendation_emails BOOLEAN DEFAULT true,
  meeting_update_emails BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

### 3.3 Interest catalogue

```sql
interest_domains (
  id UUID PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

### 3.4 Student interests

A student may select multiple interests.

```sql
student_interests (
  user_id UUID REFERENCES users(id),
  interest_domain_id UUID REFERENCES interest_domains(id),

  priority INT DEFAULT 1,
  selected_at TIMESTAMPTZ DEFAULT now(),

  PRIMARY KEY (user_id, interest_domain_id)
);
```

`priority` is optional for the demo. If the frontend only supports equal-weight selections, store all values as `1`.

---

## 4. Modules / activities need personalisation metadata

The existing `modules` model needs domain/skill metadata so recommendations can be generated.

Recommended additions:

```sql
ALTER TABLE modules
ADD COLUMN summary TEXT NULL,
ADD COLUMN difficulty TEXT NULL
  CHECK (difficulty IN ('beginner','intermediate','advanced')),
ADD COLUMN estimated_minutes INT NULL,
ADD COLUMN thumbnail_url TEXT NULL;
```

Use many-to-many tags/domains rather than one single domain.

```sql
module_interests (
  module_id UUID REFERENCES modules(id),
  interest_domain_id UUID REFERENCES interest_domains(id),

  relevance_weight NUMERIC DEFAULT 1.0,

  PRIMARY KEY (module_id, interest_domain_id)
);
```

Optional additional metadata:

```sql
module_skills (
  id UUID PRIMARY KEY,
  module_id UUID REFERENCES modules(id),
  skill_key TEXT NOT NULL,
  skill_name TEXT NOT NULL
);
```

---

## 5. Registration flow

### Student registration

Recommended flow:

```text
Create account
    ↓
Basic profile
    ↓
Choose academic field / programme year
    ↓
Choose 3–6 interests
    ↓
Save student profile
    ↓
Mark onboarding_completed = true
    ↓
Return personalised dashboard
```

### API

```http
POST /api/v1/auth/register
```

Example request:

```json
{
  "name": "Ananya Sharma",
  "email": "ananya@example.com",
  "password": "********",
  "role": "student"
}
```

Then:

```http
POST /api/v1/me/onboarding
```

Example request:

```json
{
  "college_name": "Example College",
  "academic_field": "technology",
  "programme_year": 2,
  "interest_keys": [
    "technology",
    "leadership",
    "financial_literacy",
    "entrepreneurship"
  ]
}
```

Example response:

```json
{
  "user_id": "uuid",
  "onboarding_completed": true,
  "interests": [
    {
      "key": "technology",
      "name": "Technology"
    },
    {
      "key": "leadership",
      "name": "Leadership"
    }
  ]
}
```

---

## 6. Editing interests later

Student must be able to view and update interests.

```http
GET /api/v1/interests
GET /api/v1/me/interests
PUT /api/v1/me/interests
```

Example:

```json
{
  "interest_keys": [
    "technology",
    "communication",
    "social_impact"
  ]
}
```

Backend should:

1. validate every key against active `interest_domains`;
2. replace the student's current selections transactionally;
3. return the new set;
4. trigger recommendation-cache invalidation if caching exists.

---

## 7. Personalised recommendation service

The frontend should NOT implement recommendation logic.

Backend should expose:

```http
GET /api/v1/me/recommendations
```

For the hackathon MVP, use a deterministic ranking algorithm. AI is not required for this ranking.

### MVP score

Example:

```text
recommendation_score =
    interest_match * 0.45
  + academic_field_match * 0.15
  + programme_year_match * 0.10
  + activity_relevance * 0.10
  + urgency * 0.10
  + progress_context * 0.10
```

Simpler implementation is acceptable.

Minimum rules:

1. Exclude archived/unpublished modules.
2. Prioritise modules matching the student's selected interests.
3. Prioritise mandatory modules when due soon.
4. Do not recommend already completed modules as "next action".
5. Optional activities remain capped by existing XP rules.
6. Return a human-readable `recommendation_reason`.

Example response:

```json
{
  "data": [
    {
      "module_id": "uuid",
      "title": "Introduction to Financial Inclusion",
      "type": "online_course",
      "matched_interests": [
        "financial_literacy",
        "social_impact"
      ],
      "recommendation_score": 0.91,
      "recommendation_reason": "Matches your Financial Literacy interest and is recommended for Year 2.",
      "xp_weight": 100,
      "due_date": null
    }
  ]
}
```

This endpoint will power:

- Student Dashboard recommendations
- Explore suggestions
- AI Coach context
- new-course email targeting

---

## 8. Student dashboard aggregation endpoint

Add one aggregate endpoint so the frontend does not need 10 requests for the homepage.

```http
GET /api/v1/me/dashboard
```

Suggested response skeleton:

```json
{
  "profile": {
    "id": "uuid",
    "name": "Ananya Sharma",
    "programme_year": 2,
    "academic_field": "technology",
    "interests": [
      "technology",
      "leadership",
      "financial_literacy"
    ]
  },

  "gamification": {
    "total_xp": 2340,
    "level": 7,
    "level_name": "Trailblazer",
    "xp_to_next_level": 160,
    "weekly_streak": 4,
    "rank": 18,
    "completion_pct": 72
  },

  "next_best_action": {},

  "recommendations": [],

  "upcoming_deadlines": [],

  "upcoming_meetings": [],

  "active_projects": [],

  "recent_achievements": [],

  "recent_activity": []
}
```

The detailed endpoints may still exist; this is a frontend-friendly read model.

---

## 9. Meetings / mentor sessions

Because there is no Mentor portal, Admin manages meetings.

### Mentor records

```sql
mentors (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NULL,
  organisation TEXT NULL,
  expertise JSONB NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Mentors are NOT authenticated app users for the MVP.

### Meetings

```sql
mentor_meetings (
  id UUID PRIMARY KEY,

  mentor_id UUID NULL REFERENCES mentors(id),

  title TEXT NOT NULL,
  description TEXT NULL,

  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,

  meeting_mode TEXT CHECK (
    meeting_mode IN ('online','offline','hybrid')
  ),

  meeting_link TEXT NULL,
  location TEXT NULL,

  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','rescheduled','cancelled','completed')),

  created_by UUID NOT NULL REFERENCES users(id),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Meeting participants

```sql
meeting_participants (
  meeting_id UUID REFERENCES mentor_meetings(id),
  student_id UUID REFERENCES users(id),

  attendance_status TEXT DEFAULT 'pending'
    CHECK (
      attendance_status IN
      ('pending','attended','missed','excused')
    ),

  PRIMARY KEY (meeting_id, student_id)
);
```

### Required APIs

```http
GET  /api/v1/me/meetings

GET  /api/v1/admin/meetings
POST /api/v1/admin/meetings
GET  /api/v1/admin/meetings/:id
PATCH /api/v1/admin/meetings/:id
```

---

## 10. Automated email notifications

Automated email is an MVP requirement.

### Required trigger A — meeting update

If Admin changes any material meeting field:

```text
start_at
end_at
meeting_mode
meeting_link
location
status
```

send an email to affected student participants.

Examples:

- meeting rescheduled
- meeting cancelled
- meeting link changed
- venue changed

Do not send a "meeting changed" email for internal metadata changes that do not affect students.

---

### Required trigger B — new course/activity addition

When an Admin publishes a NEW module/activity:

```text
draft → published
```

identify students whose selected interests overlap with the module's `module_interests`.

Send those students a personalised email.

Example logic:

```text
Admin publishes course tagged:
technology + financial_literacy

Student interests:
technology + leadership

=> student qualifies for notification
```

For mandatory activities, notification can go to all students in the relevant cohort/year regardless of interest.

---

## 11. Notification architecture

Do not send email directly inside the main database transaction.

Recommended flow:

```text
Admin action
   ↓
DB transaction succeeds
   ↓
Create domain event / notification job
   ↓
Queue
   ↓
Email worker
   ↓
Transactional email provider
   ↓
notification_log
```

For a hackathon implementation, a lightweight async job or background queue is enough.

Use an idempotency key so retries do not send duplicate messages.

---

## 12. Notification event model

Add a generic event/outbox table if time allows:

```sql
notification_events (
  id UUID PRIMARY KEY,

  event_type TEXT NOT NULL,

  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,

  payload JSONB NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','sent','failed')),

  attempts INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ NULL
);
```

Suggested `event_type` values:

```text
meeting_created
meeting_rescheduled
meeting_cancelled
meeting_updated
module_published
submission_approved
xp_awarded
feedback_available
deadline_reminder
```

Only `meeting_*` and `module_published` are required immediately for this change.

---

## 13. Notification preferences

Students should be able to opt out of non-essential recommendation emails.

Required API:

```http
GET /api/v1/me/notification-preferences
PUT /api/v1/me/notification-preferences
```

Example:

```json
{
  "email_notifications_enabled": true,
  "meeting_update_emails": true,
  "course_recommendation_emails": true
}
```

Meeting cancellation/rescheduling may be treated as an important operational message. Decide with product owner whether this remains enabled even when recommendation emails are disabled.

For the hackathon MVP:

- `course_recommendation_emails` respects opt-out;
- meeting updates should still create in-app notifications;
- email sending follows `meeting_update_emails`.

---

## 14. In-app notification feed

Email alone is not enough because the Student Dashboard also needs updates.

Keep/create:

```http
GET /api/v1/me/notifications
PATCH /api/v1/me/notifications/:id/read
```

Notification object:

```json
{
  "id": "uuid",
  "type": "meeting_rescheduled",
  "title": "Mentor session rescheduled",
  "message": "Your Career Readiness session is now on 24 Aug at 3:00 PM.",
  "entity_type": "meeting",
  "entity_id": "uuid",
  "read": false,
  "created_at": "2026-08-21T10:00:00Z"
}
```

---

## 15. Two-portal RBAC

### Student

Student can:

- register/login
- complete onboarding
- choose/edit interests
- view personalised dashboard
- browse/search/filter activities
- enroll
- submit work
- view XP
- view feedback
- view journey
- view meetings
- view notifications
- use AI Coach
- view leaderboard

Student cannot:

- create/publish modules
- approve reviews
- change XP
- create/update meetings
- manage other students

### Admin

Admin can:

- manage activities/modules
- manage rubrics
- manage students
- manage mentors as records
- manage meetings
- publish courses
- review submissions
- approve/edit AI Judge recommendations
- award/confirm XP
- view programme analytics
- manage partner organisations
- view engagement-health signals
- generate reports
- manage notification rules

---

## 16. Remove / defer old role assumptions

For the hackathon MVP:

### Remove from authentication/RBAC

```text
mentor
higher_management
```

Do not expose routes such as:

```text
/mentor/*
```

as authenticated portal routes.

### Keep concepts where needed

Mentor data may still be referenced by:

- meetings
- mentoring activities
- mentor name
- mentor email
- expertise
- external organisation
- mentor confirmation evidence

Management/Admin owns these workflows in the app.

---

## 17. Mentoring XP with no Mentor portal

The existing rubric rule still applies:

```text
Session attendance          20%
Preparation                 15%
Participation               20%
Action-item completion      30%
Reflection/progress update  15%
```

Because no Mentor portal exists, `action_item_completion` must not be silently AI-approved.

For MVP:

```text
Student submits mentoring reflection/action evidence
    ↓
AI Judge may draft other criterion levels
    ↓
Review routes to Admin
    ↓
Admin records mentor-confirmed action_item_completion
    ↓
Admin approves
    ↓
XP service calculates result
```

Add optional review metadata:

```json
{
  "mentor_confirmation": {
    "confirmed": true,
    "mentor_id": "uuid",
    "confirmed_at": "2026-08-21T10:00:00Z",
    "notes": "Action items verified after mentor session."
  }
}
```

---

## 18. AI Coach personalisation changes

Existing AI Coach must also receive:

```text
student interests
academic field
programme year
recommended modules
recent activity
progress
deadlines
meetings
review feedback
XP / level / streak
```

Add/read tool:

```text
get_student_preferences(user_id)
```

Returns:

```json
{
  "academic_field": "technology",
  "programme_year": 2,
  "interests": [
    "technology",
    "financial_literacy",
    "leadership"
  ]
}
```

Add/read tool:

```text
get_personalised_recommendations(user_id)
```

AI Coach should use backend recommendation results rather than inventing course IDs/titles.

---

## 19. Partner organisations

Partner organisations remain an Admin-managed feature.

Suggested skeleton:

```sql
partner_organisations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NULL,
  logo_url TEXT NULL,
  contact_name TEXT NULL,
  contact_email TEXT NULL,
  website TEXT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Optional relation to domains:

```sql
partner_interest_domains (
  partner_id UUID REFERENCES partner_organisations(id),
  interest_domain_id UUID REFERENCES interest_domains(id),
  PRIMARY KEY (partner_id, interest_domain_id)
);
```

Optional module relation:

```sql
ALTER TABLE modules
ADD COLUMN partner_organisation_id UUID NULL
REFERENCES partner_organisations(id);
```

Admin APIs:

```http
GET    /api/v1/admin/partners
POST   /api/v1/admin/partners
GET    /api/v1/admin/partners/:id
PATCH  /api/v1/admin/partners/:id
```

---

## 20. Core APIs backend should prioritise now

### Auth + onboarding

```http
POST /api/v1/auth/register
POST /api/v1/auth/login
GET  /api/v1/me

GET  /api/v1/interests
POST /api/v1/me/onboarding
GET  /api/v1/me/interests
PUT  /api/v1/me/interests
```

### Student homepage

```http
GET /api/v1/me/dashboard
GET /api/v1/me/recommendations
GET /api/v1/me/notifications
GET /api/v1/me/meetings
GET /api/v1/me/xp
```

### Activities

```http
GET  /api/v1/modules
GET  /api/v1/modules/:id
POST /api/v1/enrollments
POST /api/v1/submissions
```

### Admin

```http
POST  /api/v1/modules
PATCH /api/v1/modules/:id

GET   /api/v1/reviews
GET   /api/v1/reviews/:id
PATCH /api/v1/reviews/:id

GET   /api/v1/admin/dashboard

GET   /api/v1/admin/meetings
POST  /api/v1/admin/meetings
PATCH /api/v1/admin/meetings/:id
```

### AI

```http
POST /api/v1/coach/message
POST /api/v1/internal/ai-judge/score-submission
```

---

## 21. Recommended frontend/backend contract for module cards

The Student frontend needs enough information to render recommendations without additional calls.

Example:

```json
{
  "id": "uuid",
  "type": "online_course",
  "title": "Introduction to Financial Inclusion",
  "summary": "Understand the foundations of inclusive financial systems.",

  "mode": "optional",

  "domains": [
    {
      "key": "financial_literacy",
      "name": "Financial Literacy"
    },
    {
      "key": "social_impact",
      "name": "Social Impact"
    }
  ],

  "difficulty": "beginner",
  "estimated_minutes": 90,

  "due_date": null,
  "xp_weight": 100,

  "is_team_based": false,

  "enrollment_status": null,

  "recommendation": {
    "is_recommended": true,
    "reason": "Matches your Financial Literacy interest."
  }
}
```

---

## 22. Recommended meeting response

```json
{
  "id": "uuid",
  "title": "Career Readiness Mentoring Session",

  "mentor": {
    "id": "uuid",
    "name": "Priya Mehta",
    "organisation": "Partner Organisation"
  },

  "start_at": "2026-08-24T15:00:00+05:30",
  "end_at": "2026-08-24T16:00:00+05:30",

  "meeting_mode": "online",
  "meeting_link": "https://example.com/meeting",

  "status": "scheduled"
}
```

---

## 23. Recommended email payloads

### New relevant course

Subject:

```text
New Katalyst learning opportunity for you
```

Template data:

```json
{
  "student_name": "Ananya",
  "module_title": "Introduction to Financial Inclusion",
  "module_type": "Online Course",
  "matching_interests": [
    "Financial Literacy"
  ],
  "xp_available": 100,
  "cta_url": "/student/explore/module-id"
}
```

---

### Meeting rescheduled

Subject:

```text
Your Katalyst mentor session has been updated
```

Template data:

```json
{
  "student_name": "Ananya",
  "meeting_title": "Career Readiness Session",
  "old_start_at": "2026-08-23T15:00:00+05:30",
  "new_start_at": "2026-08-24T15:00:00+05:30",
  "meeting_mode": "online",
  "meeting_link": "https://example.com/meeting",
  "cta_url": "/student/dashboard"
}
```

---

## 24. Event behaviour

### Publish module

```text
PATCH /modules/:id
draft -> published
    ↓
save module
    ↓
find relevant students
    ↓
create in-app notifications
    ↓
enqueue email jobs
    ↓
respond success
```

Relevant students:

```text
mandatory module:
relevant cohort/year

optional/recommended module:
intersection(student_interests, module_interests) > 0
```

Do not send the same `module_published` email twice if an Admin edits the already-published module.

---

### Update meeting

```text
PATCH /admin/meetings/:id
    ↓
load previous meeting values
    ↓
apply update transaction
    ↓
compare material fields
    ↓
if student-visible change:
    create meeting_updated event
    ↓
find participants
    ↓
create in-app notifications
    ↓
enqueue email jobs
```

---

## 25. Email delivery requirements

Minimum:

- asynchronous delivery
- retry failed sends
- idempotency
- log success/failure
- never expose provider API keys to frontend
- provider abstraction so Resend/Brevo/etc. can be swapped
- use environment variables

Suggested service interface:

```ts
interface EmailService {
  sendCoursePublishedEmail(input: CoursePublishedEmailInput): Promise<void>;
  sendMeetingUpdatedEmail(input: MeetingUpdatedEmailInput): Promise<void>;
}
```

---

## 26. Audit requirements

Audit at minimum:

- Admin creates module
- Admin publishes module
- Admin changes module
- Admin creates/reschedules/cancels meeting
- Admin modifies rubric
- Admin approves/overrides AI review
- interests updated by student

Do not store passwords, tokens or provider secrets in audit payloads.

---

## 27. What already exists in the old spec and should be retained

Retain existing:

- modules
- rubrics
- performance levels
- enrollments
- submissions
- reviews
- deterministic XP calculation
- XP ledger
- bonus awards
- weekly meaningful streaks
- badges
- leaderboard
- AI Judge
- AI Coach
- engagement-health signals
- reports
- audit log

Do not redesign those unless required by this delta.

---

## 28. Important conflicts with the old spec

Use these new rules for the hackathon MVP:

| Old assumption | New MVP decision |
|---|---|
| Student/Admin/Mentor/Higher Management roles | Student + Admin only |
| Mentor portal | No mentor portal |
| Mentor as authenticated user | Mentor is a managed record |
| Generic module discovery | Personalised discovery based on student interests |
| No onboarding interest capture | Interest selection required during onboarding |
| Interests static | Student can edit later |
| Generic notifications | Meeting-update + relevant new-course email triggers required |
| Broad notification channels | Email + in-app first; WhatsApp deferred |
| Course additions sent broadly | Target by interests/cohort where possible |

---

## 29. MVP implementation order

### Phase 1 — Authentication + personalisation

- two-role auth
- student profile
- interest catalogue
- onboarding
- edit interests
- module domain tagging

### Phase 2 — Existing core learning loop

- Admin create/publish module
- Student browse personalised catalog
- enroll
- submit

### Phase 3 — Notifications

- mentor meeting tables
- Admin meeting CRUD
- in-app notifications
- email provider
- meeting-update events
- module-published personalised email events

### Phase 4 — Scoring

- AI Judge
- management review
- deterministic XP
- ledger update

### Phase 5 — Student experience

- dashboard aggregate endpoint
- recommendations endpoint
- meetings
- upcoming deadlines
- achievements
- leaderboard

### Phase 6 — AI Coach

- student progress context
- student preferences
- personalised recommendations
- feedback and nudges

---

## 30. Hackathon acceptance tests

Backend should be considered demo-ready when these flows pass.

### Flow A — Personalised onboarding

```text
Student registers
→ selects Technology + Leadership
→ preferences save
→ dashboard recommendations contain matching modules
→ Student changes interests
→ recommendations change
```

### Flow B — Relevant course notification

```text
Admin creates optional Technology course
→ tags it Technology
→ publishes it
→ Technology-interested students receive in-app notification
→ email job is created
→ unrelated students do not receive recommendation email
```

### Flow C — Meeting reschedule notification

```text
Admin schedules meeting with Student A
→ Admin changes time
→ Student A receives in-app notification
→ email job is created
→ notification contains new meeting time
```

### Flow D — XP loop

```text
Student submits assignment
→ AI Judge creates criterion-level draft
→ Admin reviews
→ Admin approves
→ server calculates XP
→ XP ledger receives entry
→ Student dashboard total changes
```

### Flow E — AI Coach personalisation

```text
Student asks "What should I do next?"
→ Coach fetches progress
→ Coach fetches preferences/recommendations
→ Coach references a real matching activity
→ Coach never invents XP or course data
```

---

## 31. Definition of Done for this backend skeleton

For the first backend handoff, implementation does NOT need every production feature.

It should provide:

- migrations/schema for the new tables/fields;
- two-role RBAC;
- onboarding + interest APIs;
- editable preferences;
- module-domain tagging;
- personalised recommendations endpoint;
- meeting model + Admin CRUD;
- Student meetings endpoint;
- in-app notification model;
- email provider abstraction;
- meeting-update email trigger;
- module-published personalised email trigger;
- API response contracts;
- seed data;
- basic unit/integration tests for recommendation targeting and email triggers.

Then integrate the existing:

- submission/review flow;
- AI Judge;
- XP engine;
- dashboard;
- AI Coach.

---

## 32. Backend team: please do not block frontend development

Freeze the request/response shapes for these first:

```text
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

Frontend will build against mocks using these contracts while backend implementation is in progress.

