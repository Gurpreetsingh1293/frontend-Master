"use client";

import Link from "next/link";
import { useId } from "react";
import type { Activity, ActivityType, Enrollment, EnrollmentStatus } from "@/lib/types";
import { catmullRomPath } from "@/lib/data/learning-journey";
import { cn, formatDate, levelFromXp } from "@/lib/utils";

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
  const vb = variant === "desktop" ? { w: 720, h: 280 } : { w: 320, h: Math.max(480, count * 92) };
  const padX = variant === "desktop" ? 78 : 96;
  const padY = variant === "desktop" ? 58 : 40;
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
    <span className="mt-0.5 flex items-center gap-0.5" aria-label={`Progress ${filled} of 5`}>
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

export function EnrolledLearningJourney({
  enrollments,
  activities,
  xp,
  completion,
}: {
  enrollments: Enrollment[];
  activities: Activity[];
  xp: number;
  completion: number;
}) {
  const uid = useId();
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
  const next =
    items.find((x, i) => i >= focusIndex && !isDone(x.enrollment.status)) ?? items[focusIndex];

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
      <div className="mt-4 hidden md:block">
        <JourneyCanvas variant="desktop" items={items} focusIndex={focusIndex} uid={`${uid}-d`} />
      </div>
      <div className="mt-4 md:hidden">
        <JourneyCanvas variant="mobile" items={items} focusIndex={focusIndex} uid={`${uid}-m`} />
      </div>
    </section>
  );
}

function JourneyCanvas({
  variant,
  items,
  focusIndex,
  uid,
}: {
  variant: "desktop" | "mobile";
  items: { enrollment: Enrollment; activity: Activity }[];
  focusIndex: number;
  uid: string;
}) {
  const { vb, pts, d } = layout(items.length, variant);
  const progress = items.length <= 1 ? 1 : focusIndex / (items.length - 1);

  return (
    <div className="relative overflow-visible py-8">
      <svg viewBox={`0 0 ${vb.w} ${vb.h}`} className="h-auto w-full" role="img" aria-labelledby={`${uid}-title`}>
        <title id={`${uid}-title`}>Enrolled learning journey path</title>
        <path d={d} fill="none" stroke="var(--line)" strokeWidth="5" strokeLinecap="round" />
        <path
          d={d}
          fill="none"
          stroke="var(--purple)"
          strokeWidth="5"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={1 - progress}
          className="journey-progress"
        />
      </svg>
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
            <Link
              href={`/student/activities/${item.activity.id}`}
              aria-current={focused ? "step" : undefined}
              aria-label={`${item.activity.title}, ${TYPE_LABEL[item.activity.type]}, ${stateLabel}, ${item.enrollment.progress}%`}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 motion-safe:transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-barbie",
                kind === "completed" && "h-8 w-8 border-blue bg-blue text-white",
                kind === "current" && focused &&
                  "journey-pulse z-[1] h-10 w-10 border-barbie bg-barbie text-white shadow-[0_0_0_6px_rgba(236,25,117,0.16)]",
                kind === "current" && !focused && "h-8 w-8 border-barbie bg-card text-barbie",
                kind === "locked" && "h-8 w-8 border-line bg-card text-purple",
              )}
            >
              <span className="flex h-full w-full items-center justify-center">
                <NodeMark kind={kind} />
              </span>
            </Link>
            <div
              className={cn(
                "pointer-events-none absolute w-[8.5rem] text-[11px] leading-snug sm:w-40 sm:text-xs",
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
