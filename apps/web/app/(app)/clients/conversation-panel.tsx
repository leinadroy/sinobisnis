"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText, Send } from "lucide-react";
import { toast } from "sonner";
import type { ClientDetail } from "@sml/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { fmtDateTime } from "@/lib/format";
import { addConversation } from "./actions";

export function ConversationPanel({ clientId, conversations, history }: Pick<ClientDetail, "conversations" | "history"> & { clientId: number }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const send = () =>
    start(async () => {
      const res = await addConversation(clientId, msg);
      if (!res.ok) return void toast.error(res.error);
      setMsg("");
      router.refresh();
    });

  return (
    <>
      <Card id="conversation">
        <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquareText className="size-4" /> Conversation</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {conversations.length === 0 && <p className="text-sm text-muted-foreground">Belum ada catatan.</p>}
            {conversations.map((c) => (
              <div key={c.id} className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
                <div className="mb-0.5 text-xs"><b className="text-primary">{c.userName}</b> <span className="text-muted-foreground">{fmtDateTime(c.createdAt)}</span></div>
                <p className="whitespace-pre-wrap">{c.message}</p>
              </div>
            ))}
          </div>
          <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} placeholder="Tulis catatan / percakapan…" aria-label="Pesan" />
          <Button size="sm" onClick={send} disabled={pending || !msg.trim()}><Send /> {pending ? "Mengirim…" : "Kirim"}</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Riwayat Perubahan</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex justify-between gap-2">
                <span><span className="font-medium">{h.action}</span> <span className="text-muted-foreground">oleh {h.userName}</span></span>
                <span className="shrink-0 text-xs text-muted-foreground">{fmtDateTime(h.historyDate)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
