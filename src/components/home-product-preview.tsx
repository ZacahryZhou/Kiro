import { CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";

/** Static illustration of the propose-then-confirm flow. The names are made-up sample data. */
export function HomeProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md text-foreground" aria-label="Example of an AI attendance proposal">
      <div className="kora-card overflow-hidden shadow-xl">
        <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-3">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Sparkles className="size-3.5" aria-hidden />
          </span>
          <p className="text-sm font-semibold">Kora AI</p>
          <span className="ml-auto text-[11px] text-muted-foreground">Example</span>
        </div>
        <div className="space-y-3 p-4">
          <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
            Alex came to math today and Sam is on leave.
          </p>
          <p className="w-fit max-w-[90%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2 text-sm">
            I&apos;ve prepared today&apos;s attendance. Nothing changes until you confirm.
          </p>
          <div className="rounded-xl border bg-card p-3.5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Review before anything changes</p>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">Pending</span>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-600" aria-hidden />Alex: Present (1 session deducted)</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-sky-600" aria-hidden />Sam: Leave (0 sessions deducted)</li>
            </ul>
            <div className="mt-4 flex gap-2">
              <span className="inline-flex h-8 items-center rounded-lg bg-primary px-3.5 text-xs font-medium text-primary-foreground">Confirm</span>
              <span className="inline-flex h-8 items-center rounded-lg border px-3.5 text-xs font-medium">Cancel</span>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-4 -left-3 hidden items-center gap-2 rounded-xl border bg-card px-3 py-2 text-xs shadow-lg sm:flex">
        <ShieldCheck className="size-4 text-emerald-600" aria-hidden />
        Confirmed once, applied once
      </div>
    </div>
  );
}
