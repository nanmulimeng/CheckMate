"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// 单行成员的「重置密码」：POST /api/admin/reset-password，临时码只在本次
// 响应里出现一次（库里只落哈希），展示出来供管理员口头转告。
export default function ResetPasswordButton({ userId }: { userId: number }) {
  const [temp, setTemp] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onReset() {
    setTemp(null);
    setHint(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        tempPassword?: string;
        hint?: string;
        error?: string;
      };
      if (res.ok && data.tempPassword) {
        setTemp(data.tempPassword);
        setHint(data.hint ?? "");
      } else {
        setTemp(null);
        setHint(data.error ?? "重置失败");
      }
    } catch {
      setHint("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="xs"
        variant="destructive"
        disabled={loading}
        onClick={onReset}
      >
        {loading ? "重置中…" : "重置密码"}
      </Button>
      {temp && <p className="font-mono text-xs font-semibold text-destructive">{temp}</p>}
      {hint && <p className="max-w-48 text-right text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
