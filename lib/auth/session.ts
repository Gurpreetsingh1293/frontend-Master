import type { Role } from "@/lib/types";

/** Mock session helpers. Replace with Auth.js/NextAuth without changing UI contracts. */
export const demoAccounts: { name: string; email: string; role: Role }[] = [
  { name: "Ananya Munshi", email: "ananya@catalyst.edu", role: "student" },
  { name: "Isha Verma", email: "isha@catalyst.edu", role: "student" },
  { name: "Priya Sharma", email: "priya.admin@catalyst.edu", role: "admin" },
  { name: "Arjun Desai", email: "arjun.admin@catalyst.edu", role: "admin" },
];

export const AUTH_PROVIDER = "mock" as const;
