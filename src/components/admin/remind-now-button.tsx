"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// 「立即提醒」：调 POST /api/admin/remind（session 鉴权）手动触发一次催学推送。
// cron_secret 只存在于服务端 —— 一旦作为 prop 传进 "use client" 组件，
// 就会被序列化进 RSC payload / HTML（2026-09-01 修复，此前就是这么漏的）。
export default function RemindNowButton() {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onRemind() {
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/remind", { method: "POST" });
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
