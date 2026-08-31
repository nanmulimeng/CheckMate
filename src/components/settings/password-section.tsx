"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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

// 修改密码：旧密码 + 新密码（≥8 位）+ 确认。旧密码错误 → 403 行内提示。
export default function PasswordSection() {
  const router = useRouter();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (newPassword !== confirm) {
      setMsg({ ok: false, text: "两次输入的新密码不一致" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword, oldPassword }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; relogin?: boolean };
      if (res.ok) {
        setOldPassword("");
        setNewPassword("");
        setConfirm("");
        // 改密即吊销 session：服务端已清 cookie，这里引导重新登录
        if (data.relogin) {
          setMsg({ ok: true, text: "密码已修改，即将转到登录页…" });
          setTimeout(() => router.push("/login"), 1200);
        } else {
          setMsg({ ok: true, text: "密码已修改" });
        }
      } else {
        setMsg({ ok: false, text: data.error ?? "修改失败" });
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
        <CardTitle className="text-sm font-medium">修改密码</CardTitle>
        <CardDescription className="text-xs">
          管理员重置过密码的话，登录后请第一时间在这里改成自己的密码。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="oldPassword">旧密码</Label>
            <Input
              id="oldPassword"
              type="password"
              autoComplete="current-password"
              required
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="newPassword">新密码（至少 8 位）</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmPassword">确认新密码</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {msg && (
            <p className={`text-xs ${msg.ok ? "text-emerald-600" : "text-destructive"}`}>{msg.text}</p>
          )}
          <Button type="submit" variant="outline" disabled={saving} className="self-start">
            {saving ? "提交中…" : "修改密码"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
