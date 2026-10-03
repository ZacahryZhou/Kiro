import { requireRole } from "@/lib/auth/actor";
import { WorkspaceShell } from "@/components/workspace-shell";
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireRole("STUDENT");
  return <WorkspaceShell title="学生空间">{children}</WorkspaceShell>;
}
