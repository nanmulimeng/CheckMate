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

// 全局设置编辑器：考试日期 / 提醒小时 / 邀请码。整体一表单一次 PATCH，
// 成功后用响应回显的最新值刷新本地状态（邀请码始终可见——本页只有管理员能进）。
export default function AdminSettingsForm({
  initial,
}: {
  initial: { exam_date: string; remind_hour: string; invite_code: string };
}) {
  const [examDate, setExamDate] = useState(initial.exam_date);
  const [remindHour, setRemindHour] = useState(initial.remind_hour);
  const [inviteCode, setInviteCode] = useState(initial.invite_code);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exam_date: examDate.trim(),
          remind_hour: Number(remindHour),
          invite_code: inviteCode.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        exam_date?: string;
        remind_hour?: string;
        invite_code?: string;
      };
      if (res.ok) {
        setExamDate(data.exam_date ?? examDate);
        setRemindHour(data.remind_hour ?? remindHour);
        setInviteCode(data.invite_code ?? inviteCode);
        setMsg({ ok: true, text: "已保存" });
      } else {
        setMsg({ ok: false, text: data.error ?? "保存失败" });
      }
    } catch {
      setMsg({ ok: false, text: "网络错误，请重试" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">全局设置</CardTitle>
        <CardDescription className="text-xs">
          考试日期用于首页倒计时；提醒小时即时生效（每小时整点检查，到设定小时才推送）；邀请码给新成员注册用。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="examDate">考试日期（YYYY-MM-DD，留空隐藏倒计时）</Label>
            <Input
              id="examDate"
              placeholder="如 2026-12-19"
              maxLength={10}
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="remindHour">提醒小时（0-23，当前 {remindHour} 点）</Label>
            <Input
              id="remindHour"
              type="number"
              min={0}
              max={23}
              required
              value={remindHour}
              onChange={(e) => setRemindHour(e.target.value)}
              className="w-24"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="inviteCode">邀请码（改完请同步告知待注册的成员）</Label>
            <Input
              id="inviteCode"
              required
              maxLength={32}
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="max-w-48 font-mono"
            />
          </div>
          {msg && (
            <p className={`text-xs ${msg.ok ? "text-emerald-600" : "text-destructive"}`}>{msg.text}</p>
          )}
          <Button type="submit" disabled={saving} className="self-start">
            {saving ? "保存中…" : "保存设置"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
