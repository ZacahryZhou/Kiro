import { requireRole } from "@/lib/auth/actor";
import { WorkspaceShell } from "@/components/workspace-shell";
import { AiLauncher } from "@/features/ai-agent";
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireRole("TEACHER");
  return <WorkspaceShell title="Teacher Workspace" role="TEACHER">{children}<AiLauncher role="TEACHER" /></WorkspaceShell>;
}
