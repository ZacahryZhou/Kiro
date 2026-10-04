"use server";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";
import { credentialsSchema } from "./credentials";

export async function loginAction(_previous: string | null, formData: FormData) {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"), password: formData.get("password"),
  });
  if (!parsed.success) return "Enter a valid email address and password.";
  try {
    await signIn("credentials", { ...parsed.data, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) {
      return error.type === "CredentialsSignin" ? "The email or password is incorrect." : "Sign-in failed. Please try again.";
    }
    throw error;
  }
  return null;
}
export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
