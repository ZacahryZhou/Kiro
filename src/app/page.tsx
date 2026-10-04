import { redirect } from "next/navigation";
import { Landing } from "@/components/landing";
import { getActor } from "@/lib/auth/actor";

// Signed-in users go to their workspace; everyone else sees the landing page.
export default async function Home() {
  const actor = await getActor();
  if (actor) redirect(actor.role === "TEACHER" ? "/teacher" : "/student");
  return <Landing />;
}
