"use client";
import { useActionState } from "react";
import { loginAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [error, formAction, pending] = useActionState(loginAction, null);
  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">邮箱</Label>
        <Input id="email" name="email" type="email" autoComplete="username" placeholder="请输入账号邮箱"
          required maxLength={254} className="h-11" aria-describedby={error ? "login-error" : undefined} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">密码</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" placeholder="请输入密码"
          required maxLength={128} className="h-11" aria-describedby={error ? "login-error" : undefined} />
      </div>
      {error && <p id="login-error" role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending} className="h-11 w-full">{pending ? "正在登录…" : "登录"}</Button>
    </form>
  );
}
