"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LanguageSelector } from "@/components/language-selector";
import { VoiceAssist } from "@/components/voice/voice-assist";
import { usePlatform } from "@/lib/data/platform-store";
import { levelFromXp } from "@/lib/utils";
import { NotificationPanel } from "@/components/notifications/panel";
import { Logo } from "@/components/logo";

export function Topbar({ variant }: { variant: "student" | "admin" }) {
  const store = usePlatform();
  const router = useRouter();
  const user = store.users.find((u) => u.id === store.sessionUserId);
  const profile = store.studentProfiles.find((p) => p.userId === store.sessionUserId);
  const lvl = levelFromXp(profile?.xp ?? 0);
  return (
    <header className="portal-header flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-white">
      <div className="flex items-center gap-3">
        <div className="md:hidden">
          <Logo invert />
        </div>
        <div className="flex items-center gap-3 md:hidden">
          <MobileNav variant={variant} />
        </div>
        <p className="text-sm font-medium text-white">
          {user?.name}
          {variant === "student" && profile ? (
            <span className="ml-2 inline-flex items-center rounded-full bg-gold px-2.5 py-0.5 text-xs font-semibold text-plum">
              L{lvl.level} · {profile.xp.toLocaleString()} XP
            </span>
          ) : null}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <VoiceAssist />
        <LanguageSelector />
        <NotificationPanel audience={variant} userId={store.sessionUserId} />
        <Link href={variant === "student" ? "/student/profile" : "/admin/settings"} className="px-3 py-1.5 text-sm">
          Account
        </Link>
        <Button
          variant="ghost"
          onClick={() => {
            store.logout();
            router.push("/");
          }}
        >
          Sign out
        </Button>
      </div>
    </header>
  );
}

function MobileNav({ variant }: { variant: "student" | "admin" }) {
  const href = variant === "student" ? "/student/explore" : "/admin/activities";
  return (
    <Link href={href} className="text-sm font-medium">
      Menu
    </Link>
  );
}
