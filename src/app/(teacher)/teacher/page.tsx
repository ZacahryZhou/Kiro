import { PageHeader } from "@/components/page";
import { HomeDashboard } from "@/components/dashboard/home-dashboard";
import { CLASSIC_LAYOUT } from "@/contracts";
import { requireRole } from "@/lib/auth/actor";
import { loadDashboardData } from "@/lib/dashboard-data";
import { getActiveLayout, listMyLayouts } from "@/services/dashboard";
import { getMyAccount } from "@/services/read";

function greeting(hour: number) {
  return hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function Page() {
  const actor = await requireRole("TEACHER");
  const timeZone = process.env.APP_TZ || "America/Vancouver";
  const [account, active, all] = await Promise.all([getMyAccount(actor), getActiveLayout(actor), listMyLayouts(actor)]);
  const saved = active.ok ? active.data.layout : null;
  const layout = saved ?? { id: null, ...CLASSIC_LAYOUT };
  const data = await loadDashboardData(actor, layout.items, timeZone);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).format(new Date())) % 24;
  const firstName = account.ok ? account.data.name.trim().split(/\s+/)[0] : "";

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Teacher workspace"
        title={`${greeting(hour)}${firstName ? `, ${firstName}` : ""}`}
        description="Your home page. Arrange it yourself, or ask the assistant to design it: “Show today's lessons and my open requests in ocean colours.”"
      />
      <HomeDashboard
        layout={{ id: layout.id, name: layout.name, theme: layout.theme, motion: layout.motion, items: layout.items }}
        layouts={all.ok ? all.data.layouts : []}
        data={data}
      />
    </section>
  );
}
