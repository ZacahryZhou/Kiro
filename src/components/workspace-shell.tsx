import type { ReactNode } from "react";
import { logoutAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

export function WorkspaceShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5">
          <div><p className="text-lg font-semibold">Kora</p><p className="text-sm text-muted-foreground">{title}</p></div>
          <form action={logoutAction}><Button type="submit" variant="outline">Sign out</Button></form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-10">{children}</main>
    </div>
  );
}
