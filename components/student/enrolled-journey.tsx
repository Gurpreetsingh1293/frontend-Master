"use client";

import { useState } from "react";
import type { Activity, ActivityType, Enrollment, EnrollmentStatus } from "@/lib/types";
import { catmullRomPath } from "@/lib/data/learning-journey";
import { usePlatform } from "@/lib/data/platform-store";
import { cn, formatDate, levelFromXp } from "@/lib/utils";
import { JourneyRabbit } from "@/components/student/journey-rabbit";
import { JourneyDetailDialog } from "@/components/student/journey-detail";

type Kind = "completed" | "current" | "locked";

const TYPE_LABEL: Record<ActivityType, string> = {
  course: "Course",
  training: "Training",
  mentoring: "Mentorship",
  project: "Project",
  assignment: "Assignment",
  milestone: "Milestone",
};

function isOpen(status: EnrollmentStatus) {
  return status === "in_progress" || status === "submitted" || status === "under_review" || status === "needs_resubmission";
}

function isDone(status: EnrollmentStatus) {
  return status === "completed" || status === "approved";
}

function layout(count: number, variant: "desktop" | "mobile") {
  const vb = variant === "desktop" ? { w: 720, h: 300 } : { w: 320, h: Math.max(520, count * 96) };
  const padX = variant === "desktop" ? 78 : 96;
  const padY = variant === "desktop" ? 62 : 44;
  const pts = Array.from({ length: count }, (_, i) => {
    const t = count <= 1 ? 0 : i / (count - 1);
    const wave = Math.sin(t * Math.PI * 2);
    if (variant === "desktop") {
      return {
        x: padX + t * (vb.w - 2 * padX),
        y: vb.h / 2 + wave * (vb.h / 2 - padY),
        anchor: (wave >= 0 ? "bottom" : "top") as "top" | "bottom",
      };
    }
    return {
      x: vb.w / 2 + wave * (vb.w / 2 - padX),
      y: padY + t * (vb.h - 2 * padY),
      anchor: (wave >= 0 ? "left" : "right") as "left" | "right",
    };
  });
  return { vb, pts, d: catmullRomPath(pts) };
}

function ProgressStars({ progress }: { progress: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(progress / 20)));
  return (
    <span className="mt-0.5 flex items-center justify-center gap-0.5" aria-label={`Progress ${filled} of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < filled ? "text-gold" : "text-line"} aria-hidden>
          ★
        </span>
      ))}
    </span>
  );
}

function NodeMark({ kind }: { kind: Kind }) {
  if (kind === "completed") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
        <path d="M3.5 8.2 6.4 11l6.1-7" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "locked") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
        <rect x="4" y="7.5" width="8" height="6" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 7.5V5.8a2 2 0 0 1 4 0v1.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />;
}

function nodeKind(status: EnrollmentStatus, isFocus: boolean): Kind {
  if (isDone(status)) return "completed";
  if (isFocus) return "current";
  if (status === "not_started") return "locked";
  return "current";
}

function PlaygroundArt({ vb }: { vb: { w: number; h: number } }) {
  return (
    <g pointerEvents="none" aria-hidden>
      <rect width={vb.w} height={vb.h} fill="#d9ebf6" />
      <ellipse cx={vb.w * 0.5} cy={vb.h + 40} rx={vb.w * 0.7} ry={vb.h * 0.55} fill="#d5e6b8" />
      <ellipse cx={vb.w * 0.18} cy={vb.h * 0.92} rx="70" ry="22" fill="#c8dba8" />
      <ellipse cx={vb.w * 0.82} cy={vb.h * 0.9} rx="80" ry="24" fill="#c8dba8" />
      <circle cx="70" cy="36" r="16" fill="#f4f8fb" />
      <circle cx="86" cy="40" r="12" fill="#f4f8fb" />
      <circle cx={vb.w - 90} cy="30" r="14" fill="#f4f8fb" />
      <circle cx={vb.w - 74} cy="36" r="10" fill="#f4f8fb" />
      <rect x="28" y={vb.h - 58} width="6" height="28" rx="2" fill="#8c3d7a" opacity="0.45" />
      <circle cx="31" cy={vb.h - 62} r="12" fill="#7aa35a" opacity="0.55" />
      <rect x={vb.w - 42} y={vb.h - 54} width="6" height="24" rx="2" fill="#8c3d7a" opacity="0.4" />
      <circle cx={vb.w - 39} cy={vb.h - 58} r="11" fill="#7aa35a" opacity="0.5" />
      <circle cx="48" cy={vb.h - 36} r="3" fill="#ec1975" opacity="0.35" />
      <circle cx="58" cy={vb.h - 32} r="2.5" fill="#c9a227" opacity="0.45" />
      <path d={vb.w > 400 ? "M620 230 l24 0 l-12 28 z" : "M268 70 l18 0 l-9 22 z"} fill="#8c3d7a" opacity="0.22" />
      <path d={vb.w > 400 ? "M610 258 h44" : "M260 94 h36"} stroke="#8c3d7a" strokeWidth="3" opacity="0.22" strokeLinecap="round" />
    </g>
  );
}

export function EnrolledLearningJourney({
  enrollments,
  activities,
  xp,
  completion,
  studentId,
}: {
  enrollments: Enrollment[];
  activities: Activity[];
  xp: number;
  completion: number;
  studentId: string;
}) {
  const lvl = levelFromXp(xp);
  const items = enrollments
    .map((e) => {
      const activity = activities.find((a) => a.id === e.activityId);
      return activity ? { enrollment: e, activity } : null;
    })
    .filter((x): x is { enrollment: Enrollment; activity: Activity } => Boolean(x))
    .sort((a, b) => a.activity.dueDate.localeCompare(b.activity.dueDate));

  const openIndex = items.findIndex((x) => isOpen(x.enrollment.status));
  const lockedFirst = items.findIndex((x) => x.enrollment.status === "not_started");
  const focusIndex = openIndex >= 0 ? openIndex : lockedFirst >= 0 ? lockedFirst : Math.max(0, items.length - 1);
  const next = items.find((x, i) => i >= focusIndex && !isDone(x.enrollment.status)) ?? items[focusIndex];

  if (items.length === 0) {
    return (
      <section className="k-card p-5">
        <h2 className="font-serif text-2xl text-plum">Your Learning Journey</h2>
        <p className="mt-2 text-sm text-muted">Enrol in an activity from Explore to start your path.</p>
      </section>
    );
  }

  return (
    <section className="k-card p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl text-plum">Your Learning Journey</h2>
          {next ? (
            <p className="mt-1 text-sm text-muted">
              Next milestone: <span className="font-semibold text-barbie">{next.activity.title}</span>
              <span className="text-muted">
                {" "}
                · {next.activity.xpReward} XP · due {formatDate(next.activity.dueDate)}
              </span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 text-[12px] font-semibold">
          <span className="rounded-full bg-ivory px-2.5 py-1 text-gold">{xp.toLocaleString()} XP</span>
          <span className="rounded-full bg-plum px-2.5 py-1 text-white">Level {lvl.level}</span>
          <span className="rounded-full border border-line bg-card px-2.5 py-1 text-blue">{completion}% complete</span>
        </div>
      </div>
      <div className="playground-scene mt-4 hidden md:block">
        <JourneyCanvas variant="desktop" items={items} focusIndex={focusIndex} studentId={studentId} />
      </div>
      <div className="playground-scene mt-4 md:hidden">
        <JourneyCanvas variant="mobile" items={items} focusIndex={focusIndex} studentId={studentId} />
      </div>
    </section>
  );
}

function JourneyCanvas({
  variant,
  items,
  focusIndex,
  studentId,
}: {
  variant: "desktop" | "mobile";
  items: { enrollment: Enrollment; activity: Activity }[];
  focusIndex: number;
  studentId: string;
}) {
  const store = usePlatform();
  const { vb, pts, d } = layout(items.length, variant);
  const progress = items.length <= 1 ? 1 : focusIndex / (items.length - 1);
  const [openId, setOpenId] = useState<string | null>(null);
  const selected = items.find((x) => x.enrollment.id === openId);
  const rabbit = pts[focusIndex];

  return (
    <div className="relative overflow-visible px-1 py-8">
      <svg viewBox={`0 0 ${vb.w} ${vb.h}`} className="h-auto w-full" role="img" aria-labelledby={`journey-${variant}-title`}>
        <title id={`journey-${variant}-title`}>Playground learning path through your enrolled activities</title>
        <PlaygroundArt vb={vb} />
        <path d={d} fill="none" stroke="#c9bfb0" strokeWidth="10" strokeLinecap="round" />
        <path d={d} fill="none" stroke="var(--navy)" strokeWidth="4" strokeLinecap="round" opacity="0.55" />
        <path
          d={d}
          fill="none"
          stroke="var(--purple)"
          strokeWidth="4"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={1 - progress}
          className="journey-progress"
        />
      </svg>
      {rabbit ? (
        <div
          className="pointer-events-none absolute z-[2] -translate-x-[118%] -translate-y-[70%]"
          style={{ left: `${(rabbit.x / vb.w) * 100}%`, top: `${(rabbit.y / vb.h) * 100}%` }}
        >
          <JourneyRabbit className="rabbit-idle h-12 w-11 md:h-14 md:w-12" />
        </div>
      ) : null}
      {items.map((item, i) => {
        const pt = pts[i];
        if (!pt) return null;
        const focused = i === focusIndex;
        const kind = nodeKind(item.enrollment.status, focused);
        const prev = items[i - 1];
        const prevDone = !prev || isDone(prev.enrollment.status);
        const unlock = kind === "locked" ? (prevDone ? "Ready to start" : `Unlocks after ${prev?.activity.title}`) : null;
        const stateLabel = kind === "completed" ? "completed" : kind === "current" ? "in progress" : "locked";
        return (
          <div key={item.enrollment.id} className="absolute" style={{ left: `${(pt.x / vb.w) * 100}%`, top: `${(pt.y / vb.h) * 100}%` }}>
            <button
              type="button"
              aria-current={focused ? "step" : undefined}
              aria-label={`${item.activity.title}, ${TYPE_LABEL[item.activity.type]}, ${stateLabel}, ${item.enrollment.progress} percent. Open details.`}
              onClick={() => setOpenId(item.enrollment.id)}
              className={cn(
                "absolute z-[1] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-barbie",
                kind === "completed" && "h-8 w-8 border-blue bg-blue text-white",
                kind === "current" && focused &&
                  "journey-pulse h-10 w-10 border-barbie bg-barbie text-white shadow-[0_0_0_6px_rgba(236,25,117,0.16)]",
                kind === "current" && !focused && "h-8 w-8 border-barbie bg-card text-barbie",
                kind === "locked" && "h-8 w-8 border-line bg-card text-purple",
              )}
            >
              <span className="flex h-full w-full items-center justify-center">
                <NodeMark kind={kind} />
              </span>
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setOpenId(item.enrollment.id)}
              className={cn(
                "absolute w-[8.5rem] text-left text-[11px] leading-snug sm:w-40 sm:text-xs",
                pt.anchor === "bottom" && "top-6 left-1/2 -translate-x-1/2 text-center",
                pt.anchor === "top" && "bottom-6 left-1/2 -translate-x-1/2 text-center",
                pt.anchor === "left" && "right-6 top-1/2 -translate-y-1/2 text-right",
                pt.anchor === "right" && "left-6 top-1/2 -translate-y-1/2 text-left",
              )}
            >
              <p className="line-clamp-2 font-semibold text-plum">{item.activity.title}</p>
              <p className="text-purple">
                {TYPE_LABEL[item.activity.type]} · {item.enrollment.progress}%
              </p>
              <p className="font-medium text-gold">
                {kind === "completed" ? `${item.activity.xpReward} XP earned` : `${item.activity.xpReward} XP`}
              </p>
              <ProgressStars progress={item.enrollment.progress} />
              {unlock ? <p className="mt-0.5 text-[10px] text-muted">{unlock}</p> : null}
            </button>
          </div>
        );
      })}
      {selected ? (
        <JourneyDetailDialog
          open
          onClose={() => setOpenId(null)}
          activity={selected.activity}
          enrollment={selected.enrollment}
          transactions={store.xpTransactions.filter((t) => t.studentId === studentId && t.activityId === selected.activity.id)}
          submission={store.submissions.find((s) => s.activityId === selected.activity.id && s.studentId === studentId)}
          certificateTitle={store.certificates.find((c) => c.studentId === studentId && c.activityId === selected.activity.id)?.title}
        />
      ) : null}
    </div>
  );
}
