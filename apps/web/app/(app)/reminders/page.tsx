import type { Metadata } from "next";
import { Suspense } from "react";
import { canView, REMINDER_TYPES, type ReminderItem, type ReminderLogList, type ReminderOverview, type ReminderType } from "@sml/shared";
import { Forbidden, PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { listQuery } from "@/lib/list-params";
import { getAccess } from "@/lib/session";
import { ReminderItemsTable, ReminderLogTable, ReminderStatus, ReminderTabs } from "./reminder-view";

export const metadata: Metadata = { title: "Email Reminder" };

export default async function RemindersPage({ searchParams }: PageProps<"/reminders">) {
  const { me, view, edit } = await getAccess("reminders");
  if (!view) return <><PageHeader title="Email Reminder" /><Forbidden /></>;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" && (sp.tab === "log" || REMINDER_TYPES.includes(sp.tab as ReminderType)) ? sp.tab : REMINDER_TYPES[0];

  const overview = await apiFetch<ReminderOverview>("/reminders");
  let items: ReminderItem[] = [];
  let logs: ReminderLogList | null = null;
  if (tab === "log") {
    const q = new URLSearchParams(listQuery(sp, { pageSize: 50 }).qs);
    if (typeof sp.status === "string" && sp.status) q.set("status", sp.status);
    if (sp.empty === "1") q.set("withEmpty", "1");
    logs = await apiFetch<ReminderLogList>(`/reminders/logs?${q}`);
  } else {
    items = await apiFetch<ReminderItem[]>(`/reminders/items?type=${tab}`);
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Email Reminder" description="Client yang hari ini tepat jatuh pada hari reminder Keperluan-nya (nilai 0 di Keperluan = nonaktif). Satu email per kategori per Keperluan ke Email Recipient, memakai Email Template." />
      <ReminderStatus overview={overview} canRun={edit} canConfigure={canView(me.access, "system-config")} />
      <ReminderTabs overview={overview} tab={tab} />
      {tab === "log" ? (
        <Suspense><ReminderLogTable list={logs!} /></Suspense>
      ) : (
        <ReminderItemsTable type={tab as ReminderType} items={items} />
      )}
    </div>
  );
}
