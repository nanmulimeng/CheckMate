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

// 科目管理：新增 / 改名 / 上移下移排序 / 删除。
// 有历史打卡的科目删除按钮禁用，title 原生 tooltip 说明原因（API 同样 409 兜底）。

interface Subject {
  id: number;
  name: string;
  hasHistory: boolean;
}

export default function SubjectManager({ initialSubjects }: { initialSubjects: Subject[] }) {
  const [subjects, setSubjects] = useState(initialSubjects);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function request(url: string, method: string, body?: unknown): Promise<boolean> {
    setError("");
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "操作失败，请重试");
      return false;
    }
    return true;
  }

  async function reload() {
    const res = await fetch("/api/subjects");
    if (!res.ok) return;
    const data = (await res.json()) as { subjects: { id: number; name: string }[] };
    // hasHistory 由服务端页面传进来，这里保留本地已有值（删除保护只影响删除按钮）
    setSubjects((prev) =>
      data.subjects.map((s) => ({ ...s, hasHistory: prev.find((p) => p.id === s.id)?.hasHistory ?? false })),
    );
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      if (await request("/api/subjects", "POST", { name: newName })) {
        setNewName("");
        await reload();
      }
    } finally {
      setAdding(false);
    }
  }

  async function onRename(id: number) {
    setBusyId(id);
    try {
      if (await request(`/api/subjects/${id}`, "PATCH", { name: editName })) {
        setEditingId(null);
        await reload();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(s: Subject) {
    setBusyId(s.id);
    try {
      if (await request(`/api/subjects/${s.id}`, "DELETE")) await reload();
    } finally {
      setBusyId(null);
    }
  }

  // 上移/下移：交换相邻两项，各自 PATCH 成数组下标，顺序持久化到 sortOrder
  async function onMove(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= subjects.length) return;
    const next = [...subjects];
    [next[index], next[target]] = [next[target], next[index]];
    setSubjects(next); // 乐观更新，失败时 reload 回滚
    setBusyId(next[target].id);
    try {
      const a = next[target];
      const b = next[index];
      const okA = await request(`/api/subjects/${a.id}`, "PATCH", { sortOrder: target });
      const okB = await request(`/api/subjects/${b.id}`, "PATCH", { sortOrder: index });
      if (!okA || !okB) await reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">科目管理</CardTitle>
        <CardDescription className="text-xs">
          打卡时按这里的顺序展示；有历史打卡的科目只能改名，不能删除。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <form onSubmit={onAdd} className="flex flex-col gap-2">
          <Label htmlFor="newSubject">新增科目</Label>
          <div className="flex gap-2">
            <Input
              id="newSubject"
              required
              minLength={1}
              maxLength={20}
              placeholder="如：408 数据结构"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={adding}>
              {adding ? "新增中…" : "新增"}
            </Button>
          </div>
        </form>

        <ul className="flex flex-col divide-y">
          {subjects.map((s, i) => (
            <li key={s.id} className="flex items-center gap-1 py-2">
              {editingId === s.id ? (
                <>
                  <Input
                    aria-label={`重命名 ${s.name}`}
                    required
                    minLength={1}
                    maxLength={20}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-7 flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void onRename(s.id);
                      }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <Button size="xs" disabled={busyId === s.id} onClick={() => void onRename(s.id)}>
                    确定
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setEditingId(null)}>
                    取消
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {s.name}
                    {s.hasHistory && (
                      <span className="ml-1 text-xs text-muted-foreground">（有打卡记录）</span>
                    )}
                  </span>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`上移 ${s.name}`}
                    disabled={i === 0 || busyId !== null}
                    onClick={() => void onMove(i, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`下移 ${s.name}`}
                    disabled={i === subjects.length - 1 || busyId !== null}
                    onClick={() => void onMove(i, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={busyId !== null}
                    onClick={() => {
                      setEditingId(s.id);
                      setEditName(s.name);
                    }}
                  >
                    改名
                  </Button>
                  <Button
                    size="xs"
                    variant="destructive"
                    disabled={s.hasHistory || busyId !== null}
                    title={s.hasHistory ? "该科目有历史打卡，不能删除（可改名）" : `删除 ${s.name}`}
                    onClick={() => void onDelete(s)}
                  >
                    删除
                  </Button>
                </>
              )}
            </li>
          ))}
          {subjects.length === 0 && (
            <li className="py-2 text-sm text-muted-foreground">还没有科目，先新增一个。</li>
          )}
        </ul>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
