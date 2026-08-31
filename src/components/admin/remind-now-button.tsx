"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// 「立即提醒」：调 /api/cron/remind?secret=…&force=1 手动触发一次催学推送。
// secret 由服务端读 Setting 后注入 prop，不出现在任何客户端可预取的位置
//（本页只有管理员可达，2-5 个可信朋友之间够用）。
export default function RemindNowButton({ secret }: { secret: string }) {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onRemind() {
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/cron/remind?secret=${encodeURIComponent(secret)}&force=1`,
      );
      const data = (await res.json().catch(() => ({}))) as { sent?: number; error?: string };
      if (res.ok) setResult(`已推送 ${data.sent ?? 0} 条提醒`);
      else setResult(data.error ?? "触发失败");
    } catch {
      setResult("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button size="sm" variant="outline" disabled={loading} onClick={onRemind}>
        {loading ? "推送中…" : "立即提醒"}
      </Button>
      {result && <p className="text-xs text-muted-foreground">{result}</p>}
    </div>
  );
}
