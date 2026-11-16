import type { Metadata } from "next";
import { Suspense } from "react";
import { canView, isReminderDate, REMINDER_TYPES, todayStr, type ReminderItem, type ReminderLogList, type ReminderOverview, type ReminderType } from "@sml/shared";
import { Printer } from "lucide-react";
import { Forbidden, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { listQuery } from "@/lib/list-params";
import { getAccess } from "@/lib/session";
import { fmtDate } from "@/lib/format";
import { ReminderDateFilter } from "./reminder-date-filter";
import { ReminderItemsTable, ReminderLogTable, ReminderStatus, ReminderTabs } from "./reminder-view";

export const metadata: Metadata = { title: "Email Reminder" };

export default async function RemindersPage({ searchParams }: PageProps<"/reminders">) {
  const { me, view, edit } = await getAccess("reminders");
  if (!view) return <><PageHeader title="Email Reminder" /><Forbidden /></>;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" && (sp.tab === "log" || REMINDER_TYPES.includes(sp.tab as ReminderType)) ? sp.tab : REMINDER_TYPES[0];
  const today = todayStr();
  const date = isReminderDate(sp.date) ? sp.date : today;
  const dateQuery = date === today ? "" : `&date=${date}`;

  const overview = await apiFetch<ReminderOverview>(`/reminders?date=${date}`);
  let items: ReminderItem[] = [];
  let logs: ReminderLogList | null = null;
  if (tab === "log") {
    const q = new URLSearchParams(listQuery(sp, { pageSize: 50 }).qs);
    if (typeof sp.status === "string" && sp.status) q.set("status", sp.status);
    if (sp.empty === "1") q.set("withEmpty", "1");
    logs = await apiFetch<ReminderLogList>(`/reminders/logs?${q}`);
  } else {
    items = await apiFetch<ReminderItem[]>(`/reminders/items?type=${tab}&date=${date}`);
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Email Reminder" description={`Client yang tepat jatuh pada hari reminder Keperluan-nya untuk ${fmtDate(date)} (nilai 0 di Keperluan = nonaktif). Satu email per kategori per Keperluan ke Email Recipient, memakai Email Template.`} />
      <Suspense><ReminderDateFilter date={date} /></Suspense>
      <ReminderStatus overview={overview} canRun={edit && date === today} canConfigure={canView(me.access, "system-config")} />
      <ReminderTabs overview={overview} tab={tab} date={date === today ? null : date} />
      {tab === "log" ? (
        <Suspense><ReminderLogTable list={logs!} /></Suspense>
      ) : (
        <>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/print/reminders?type=${tab}${dateQuery}`} target="_blank" rel="noopener" />}>
              <Printer /> Print / PDF kategori ini
            </Button>
            <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/print/reminders${date === today ? "" : `?date=${date}`}`} target="_blank" rel="noopener" />}>
              <Printer /> Print / PDF semua kategori
            </Button>
          </div>
          <ReminderItemsTable type={tab as ReminderType} items={items} />
        </>
      )}
    </div>
  );
}
