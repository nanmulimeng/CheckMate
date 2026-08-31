"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// 「催一下」按钮。API（POST /api/nudge）由 Task 9 提供：
// 本任务先做按钮 + 已催禁用态，请求失败只显示错误文案，不崩溃。
// 契约：{ toUserId } → 200 已发送 / 403 不能催自己 / 409 今日已催。
export default function NudgeButton({
  userId,
  alreadySent,
}: {
  userId: number;
  alreadySent: boolean;
}) {
  const [sent, setSent] = useState(alreadySent);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function nudge() {
    if (sent || sending) return;
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId: userId }),
      });
      if (res.ok || res.status === 409) {
        setSent(true); // 409 = 今天已催过，同样落到「已催过」态
        return;
      }
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "发送失败，请稍后再试");
    } catch {
      setError("网络错误，请稍后再试");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-0.5">
      <Button type="button" variant="outline" size="sm" disabled={sent || sending} onClick={nudge}>
        {sent ? "已催过" : sending ? "发送中…" : "催一下"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
