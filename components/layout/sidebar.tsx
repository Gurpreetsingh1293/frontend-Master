"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Award,
  Bell,
  BookOpen,
  Bot,
  CalendarClock,
  ChevronDown,
  Compass,
  Flag,
  LayoutDashboard,
  LifeBuoy,
  MessageCircle,
  MessageSquare,
  Phone,
  Settings,
  Sparkles,
  Trophy,
  User,
  Users,
  AlertTriangle,
  CalendarHeart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { useI18n } from "@/lib/i18n/provider";
import type { en } from "@/lib/i18n/dictionaries";

type StudentNavKey = keyof typeof en;

const studentGroups: { id: string; heading: string; items: { href: string; key?: StudentNavKey; label?: string; icon: LucideIcon }[] }[] = [
  {
    id: "main",
    heading: "MAIN",
    items: [
      { href: "/student", key: "dashboard", icon: LayoutDashboard },
      { href: "/student/learning", key: "myLearning", icon: BookOpen },
      { href: "/student/explore", key: "explore", icon: Compass },
    ],
  },
  {
    id: "progress",
    heading: "PROGRESS",
    items: [
      { href: "/student/gamification", key: "gamification", icon: Sparkles },
      { href: "/student/achievements", key: "achievements", icon: Award },
      { href: "/student/missions", key: "missions", icon: Flag },
      { href: "/student/leaderboard", key: "leaderboard", icon: Trophy },
    ],
  },
  {
    id: "community",
    heading: "COMMUNITY",
    items: [
      { href: "/student/teams", key: "teams", icon: Users },
      { href: "/student/ai-coach", key: "aiCoach", icon: Bot },
      { href: "/student/chatbot", key: "chatbot", icon: MessageCircle },
    ],
  },
  {
    id: "activity",
    heading: "ACTIVITY",
    items: [
      { href: "/student/notifications", key: "notifications", icon: Bell },
      { href: "/student/extracurricular", key: "extracurricular", icon: CalendarHeart },
      { href: "/student/reschedule", key: "reschedule", icon: CalendarClock },
    ],
  },
  {
    id: "account",
    heading: "ACCOUNT",
    items: [
      { href: "/student/profile", key: "profile", icon: User },
      { href: "/student/settings", key: "settings", icon: Settings },
    ],
  },
  {
    id: "support",
    heading: "SUPPORT",
    items: [
      { href: "/student/feedback", key: "feedback", icon: MessageSquare },
      { href: "/student/complaints", key: "complaints", icon: AlertTriangle },
      { href: "/student/contact", key: "contact", icon: Phone },
      { href: "/student/emergency", key: "emergency", icon: LifeBuoy },
    ],
  },
];

const adminNav: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/activities", label: "Activities", icon: BookOpen },
  { href: "/admin/activities/create", label: "Create activity", icon: Sparkles },
  { href: "/admin/courses", label: "Courses", icon: BookOpen },
  { href: "/admin/training", label: "Training", icon: Flag },
  { href: "/admin/mentoring", label: "Mentoring", icon: Users },
  { href: "/admin/projects", label: "Projects", icon: Compass },
  { href: "/admin/assignments", label: "Assignments", icon: Award },
  { href: "/admin/milestones", label: "Milestones", icon: Trophy },
  { href: "/admin/submissions", label: "Submissions", icon: MessageSquare },
  { href: "/admin/students", label: "Students", icon: User },
  { href: "/admin/teams", label: "Teams", icon: Users },
  { href: "/admin/leaderboards", label: "Leaderboards", icon: Trophy },
  { href: "/admin/reports", label: "Reports", icon: Flag },
  { href: "/admin/analytics", label: "Analytics", icon: Sparkles },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/escalations", label: "Escalations", icon: AlertTriangle },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function isRouteActive(pathname: string, href: string) {
  if (href === "/student" || href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function groupForPath(pathname: string) {
  return studentGroups.find((g) => g.items.some((i) => isRouteActive(pathname, i.href)))?.id ?? "main";
}

export function Sidebar({ variant }: { variant: "student" | "admin" }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const activeGroup = groupForPath(pathname);
  const [open, setOpen] = useState<Record<string, boolean>>({ main: true, [activeGroup]: true });

  useEffect(() => {
    setOpen((prev) => ({ ...prev, [groupForPath(pathname)]: true }));
  }, [pathname]);

  return (
    <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-line bg-card md:block">
      <div className="sticky top-0 z-10 bg-card px-4 py-5">
        <Link href={variant === "student" ? "/student" : "/admin"}>
          <Logo />
        </Link>
        <p className="mt-1.5 text-[13px] font-semibold uppercase tracking-[0.14em] text-purple">{variant} portal</p>
      </div>
      {variant === "student" ? (
        <nav className="flex flex-col gap-0.5 p-3 pb-6">
          {studentGroups.map((group) => {
            const expanded = Boolean(open[group.id]);
            return (
              <div key={group.id}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left"
                >
                  <span className="text-[13px] font-semibold uppercase tracking-[0.14em] text-purple">{group.heading}</span>
                  <ChevronDown className={cn("h-4 w-4 text-purple transition-transform", expanded ? "rotate-0" : "-rotate-90")} aria-hidden />
                </button>
                <div className={cn("grid transition-[grid-template-rows] duration-200", expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                  <div className="overflow-hidden">
                    <div className="flex flex-col gap-px pb-1 pt-0.5">
                      {group.items.map((item) => (
                        <SideLink
                          key={item.href}
                          href={item.href}
                          label={item.label ?? t[item.key!]}
                          icon={item.icon}
                          active={isRouteActive(pathname, item.href)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      ) : (
        <nav className="flex flex-col gap-0.5 p-3 pb-8 text-sm">
          {adminNav.map((item) => (
            <SideLink key={item.href} href={item.href} label={item.label} icon={item.icon} active={isRouteActive(pathname, item.href)} />
          ))}
        </nav>
      )}
    </aside>
  );
}

function SideLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-xl px-3 py-1.5 text-[15px] transition",
        active
          ? "bg-barbie font-semibold text-white shadow-[0_10px_20px_-8px_rgba(236,25,117,0.7)]"
          : "font-medium text-plum hover:bg-ivory",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-white" : "text-purple")} aria-hidden />
      {label}
    </Link>
  );
}
