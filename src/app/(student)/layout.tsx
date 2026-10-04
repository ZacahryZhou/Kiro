import { requireRole } from "@/lib/auth/actor";
import { WorkspaceShell } from "@/components/workspace-shell";
import { AiLauncher } from "@/features/ai-agent";
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireRole("STUDENT");
  return <WorkspaceShell title="Student Workspace" role="STUDENT">{children}<AiLauncher role="STUDENT" /></WorkspaceShell>;
}
