export function Logo({ className = "h-8", invert = false }: { className?: string; invert?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill={invert ? "#ffffff" : "var(--pink)"} />
        <path d="M8 22V10h4l4 6 4-6h4v12h-3.2v-7.2L16.6 22h-1.2l-4.2-7.2V22H8z" fill={invert ? "var(--pink)" : "#ffffff"} />
        <path d="M8 24h16" stroke="var(--gold)" strokeWidth="1.8" />
      </svg>
      <span className={`font-serif text-lg tracking-tight ${invert ? "text-white" : "text-plum"}`}>Katalyst</span>
    </span>
  );
}
