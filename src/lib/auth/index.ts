import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { credentialsSchema } from "./credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [Credentials({
    credentials: {
      email: { label: "邮箱", type: "email" },
      password: { label: "密码", type: "password" },
    },
    async authorize(credentials) {
      const parsed = credentialsSchema.safeParse(credentials);
      if (!parsed.success) return null;
      const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
      if (!user || !(await compare(parsed.data.password, user.passwordHash))) return null;
      return { id: user.id, name: user.name, email: user.email, role: user.role };
    },
  })],
  callbacks: {
    jwt({ token, user }) {
      if (user) { token.sub = user.id; token.role = user.role; }
      return token;
    },
    session({ session, token }) {
      if (!token.sub || (token.role !== "TEACHER" && token.role !== "STUDENT")) {
        throw new Error("登录会话无效。");
      }
      session.user.id = token.sub;
      session.user.role = token.role;
      return session;
    },
  },
});
