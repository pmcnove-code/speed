import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db, t } from "@/db";
import { providerFlags } from "@/lib/llm/provider";
import { totalSpendUsd } from "@/lib/cost";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const providers = await providerFlags();
  const usageRows = await db
    .select({ provider: t.batches.provider, model: t.batches.model, usage: t.batches.usage })
    .from(t.batches);
  const totalSpend = totalSpendUsd(usageRows);

  return (
    <div className="flex min-h-screen">
      <Sidebar role={session.role} totalSpend={totalSpend} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar session={session} providers={providers} />
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
