import { requireRole } from "@/lib/auth/actor";
import { WorkspaceShell } from "@/components/workspace-shell";
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireRole("TEACHER");
  return <WorkspaceShell title="Teacher Workspace">{children}</WorkspaceShell>;
}
