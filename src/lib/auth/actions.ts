"use server";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";
import { credentialsSchema } from "./credentials";

export async function loginAction(_previous: string | null, formData: FormData) {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"), password: formData.get("password"),
  });
  if (!parsed.success) return "请输入有效邮箱和密码。";
  try {
    await signIn("credentials", { ...parsed.data, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) {
      return error.type === "CredentialsSignin" ? "邮箱或密码不正确。" : "登录失败，请稍后重试。";
    }
    throw error;
  }
  return null;
}
export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
