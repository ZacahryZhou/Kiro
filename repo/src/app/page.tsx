import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/actor";
export default async function Home() {
  const actor = await requireActor();
  redirect(actor.role === "TEACHER" ? "/teacher" : "/student");
}
