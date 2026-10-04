import { PasswordForm, ProfileForm } from "@/components/settings-forms";
import { ErrorAlert, PageHeader } from "@/components/page";
import { requireRole } from "@/lib/auth/actor";
import { getMyAccount } from "@/services/read";

export default async function Page() {
  const actor = await requireRole("TEACHER");
  const account = await getMyAccount(actor);
  return (
    <section className="space-y-8">
      <PageHeader eyebrow="Teacher Workspace" title="Settings" description="Your name and password." />
      {!account.ok ? (
        <ErrorAlert message={account.error.message} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <ProfileForm name={account.data.name} email={account.data.email} role={account.data.role} />
          <PasswordForm />
        </div>
      )}
    </section>
  );
}
