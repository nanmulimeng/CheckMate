"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// 昵称 + Server酱 SendKey（含「测试推送」）。两个小表单独立提交，
// 保存成功/失败都给行内反馈；测试推送按契约永远 200，sent:false 也要亮出来。
export default function ProfileSection({
  initialDisplayName,
  initialHasKey,
}: {
  initialDisplayName: string;
  initialHasKey: boolean;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [serverchanKey, setServerchanKey] = useState("");
  const [hasKey, setHasKey] = useState(initialHasKey);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [keyMsg, setKeyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [testing, setTesting] = useState(false);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setNameMsg(null);
    setSavingName(true);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setNameMsg(
        res.ok
          ? { ok: true, text: "已保存" }
          : { ok: false, text: data.error ?? "保存失败" },
      );
    } catch {
      setNameMsg({ ok: false, text: "网络错误，请重试" });
    } finally {
      setSavingName(false);
    }
  }

  async function saveKey(e: FormEvent) {
    e.preventDefault();
    setKeyMsg(null);
    setSavingKey(true);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // 留空提交 = 清除已配置的 key（契约：空串显式表示清除）
        body: JSON.stringify({ serverchanKey: serverchanKey.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setHasKey(serverchanKey.trim() !== "");
        setServerchanKey("");
        setKeyMsg({ ok: true, text: serverchanKey.trim() === "" ? "已清除 SendKey" : "已保存" });
      } else {
        setKeyMsg({ ok: false, text: data.error ?? "保存失败" });
      }
    } catch {
      setKeyMsg({ ok: false, text: "网络错误，请重试" });
    } finally {
      setSavingKey(false);
    }
  }

  async function testPush() {
    setKeyMsg(null);
    setTesting(true);
    try {
      const res = await fetch("/api/me/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { sent?: boolean; reason?: string };
      if (res.ok && data.sent) setKeyMsg({ ok: true, text: "测试推送已发出，去微信看看吧" });
      else setKeyMsg({ ok: false, text: data.reason ?? "推送失败：请检查 SendKey 是否正确" });
    } catch {
      setKeyMsg({ ok: false, text: "网络错误，请重试" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">个人资料</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <form onSubmit={saveName} className="flex flex-col gap-2">
          <Label htmlFor="displayName">昵称（大家看到的名字）</Label>
          <div className="flex gap-2">
            <Input
              id="displayName"
              required
              minLength={1}
              maxLength={20}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" variant="outline" disabled={savingName}>
              {savingName ? "保存中…" : "保存"}
            </Button>
          </div>
          {nameMsg && (
            <p className={`text-xs ${nameMsg.ok ? "text-emerald-600" : "text-destructive"}`}>
              {nameMsg.text}
            </p>
          )}
        </form>

        <form onSubmit={saveKey} className="flex flex-col gap-2">
          <Label htmlFor="serverchanKey">Server酱 SendKey（催学/提醒推送到微信）</Label>
          <CardDescription className="text-xs">
            {hasKey ? "已配置。输入新值覆盖；留空保存 = 清除。" : "未配置。填入 SendKey 后保存。"}
          </CardDescription>
          <div className="flex gap-2">
            <Input
              id="serverchanKey"
              placeholder={hasKey ? "••••••（已配置，留空保存即清除）" : "SCT…"}
              maxLength={128}
              value={serverchanKey}
              onChange={(e) => setServerchanKey(e.target.value)}
              className="flex-1"
              autoComplete="off"
            />
            <Button type="submit" variant="outline" disabled={savingKey}>
              {savingKey ? "保存中…" : "保存"}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={testing || !hasKey}
              onClick={testPush}
            >
              {testing ? "推送中…" : "测试推送"}
            </Button>
            {!hasKey && <span className="text-xs text-muted-foreground">先保存 SendKey 才能测试</span>}
          </div>
          {keyMsg && (
            <p className={`text-xs ${keyMsg.ok ? "text-emerald-600" : "text-destructive"}`}>
              {keyMsg.text}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
