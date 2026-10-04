import Link from "next/link";
import { GraduationCap } from "lucide-react";

export function Brand({ href = "/", tone = "light", tagline }: { href?: string; tone?: "light" | "dark"; tagline?: string }) {
  const dark = tone === "dark";
  return (
    <Link href={href} className="inline-flex items-center gap-3 transition-opacity hover:opacity-80">
      <span className={`flex size-9 items-center justify-center rounded-xl shadow-sm ${dark ? "bg-white/15 text-white backdrop-blur" : "bg-primary text-primary-foreground"}`}>
        <GraduationCap className="size-5" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className={`block text-lg font-semibold tracking-tight ${dark ? "text-white" : ""}`}>Kiro</span>
        {tagline && <span className={`block text-[11px] ${dark ? "text-white/70" : "text-muted-foreground"}`}>{tagline}</span>}
      </span>
    </Link>
  );
}
