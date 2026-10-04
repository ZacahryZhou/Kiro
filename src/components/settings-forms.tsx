"use client";

import { useActionState } from "react";
import { changePasswordAction, updateProfileAction } from "@/lib/account-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial = { kind: null as "success" | "error" | null, message: "" };

function Feedback({ state }: { state: typeof initial }) {
  if (!state.kind) return null;
  return (
    <p role={state.kind === "error" ? "alert" : "status"} className={`text-sm ${state.kind === "error" ? "text-destructive" : "text-emerald-700"}`}>
      {state.message}
    </p>
  );
}

export function ProfileForm({ name, email, role }: { name: string; email: string; role: string }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, initial);
  return (
    <form action={formAction} className="kora-card space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">Profile</h2>
        <p className="text-sm text-muted-foreground">Your name is shown to your {role === "TEACHER" ? "students" : "teachers"}.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-name">Name</Label>
        <Input key={name} id="settings-name" name="name" defaultValue={name} required maxLength={80} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-email">Email</Label>
        <Input id="settings-email" value={email} readOnly disabled />
        <p className="text-xs text-muted-foreground">Your email is your sign-in and cannot be changed here.</p>
      </div>
      <Feedback state={state} />
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save name"}</Button>
    </form>
  );
}

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initial);
  return (
    <form action={formAction} className="kora-card space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">Password</h2>
        <p className="text-sm text-muted-foreground">Use at least 8 characters.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-current">Current password</Label>
        <Input id="settings-current" name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-new">New password</Label>
        <Input id="settings-new" name="newPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-confirm">Confirm new password</Label>
        <Input id="settings-confirm" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
      </div>
      <Feedback state={state} />
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Change password"}</Button>
    </form>
  );
}
