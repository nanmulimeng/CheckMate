"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import PhotoPicker, { type PhotoPickerHandle } from "@/components/photo-picker";
import { mondayOf } from "@/lib/dates";

export interface CheckInDefaults {
  defaultDate: string;
  today: string;
  yesterday: string;
  allowToday: boolean;
  allowYesterday: boolean;
}

/** 编辑模式的预填值（/checkin/new?id=N，归属/截止已由服务端壳裁决） */
export interface EditTarget {
  id: number;
  subjectId: number;
  durationMinutes: number;
  note: string;
}

const QUICK_DURATIONS = [30, 60, 90, 120];
const NOTE_LIMIT = 500;
const WEEKLY_NOTE_LIMIT = 100;

export default function CheckInForm({
  subjects,
  defaults,
  initialWeeklyNote = "",
  weeklyNoteWeek,
  preselectSubjectId,
  edit = null,
}: {
  subjects: { id: number; name: string }[];
  defaults: CheckInDefaults;
  /** 本周已写的那句话（服务端查好传入，覆盖式编辑） */
  initialWeeklyNote?: string;
  /** 预填那句话所属的周（周一日期串）。创建路径切「记入日期」跨周时
   *  预填内容不再适用（它属于另一周），清空让用户给新周重写，避免
   *  上周的句子被提交进本周（后写覆盖）。编辑模式日期不可改，用不到。 */
  weeklyNoteWeek?: string;
  /** ?subject=N 预选科目（「再来一条」跳转用） */
  preselectSubjectId?: number;
  edit?: EditTarget | null;
}) {
  const router = useRouter();
  const [subjectId, setSubjectId] = useState<string>(
    edit
      ? String(edit.subjectId)
      : preselectSubjectId && subjects.some((s) => s.id === preselectSubjectId)
        ? String(preselectSubjectId)
        : subjects[0]
          ? String(subjects[0].id)
          : "",
  );
  const [duration, setDuration] = useState(edit ? String(edit.durationMinutes) : "60");
  const [note, setNote] = useState(edit?.note ?? "");
  const [weeklyNote, setWeeklyNote] = useState(initialWeeklyNote);
  // 编辑模式不改日期（PATCH 不接受 date 字段），这个 state 仅供创建路径用
  const [date, setDate] = useState(defaults.defaultDate);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pickerRef = useRef<PhotoPickerHandle | null>(null);

  // 可选日期只来自服务端裁决的两个合法值（截止小时前昨天+今天，之后只剩今天；小时数管理员可配）
  const dateOptions = useMemo(() => {
    const opts: string[] = [];
    if (defaults.allowYesterday) opts.push(defaults.yesterday);
    if (defaults.allowToday) opts.push(defaults.today);
    return opts;
  }, [defaults]);

  const dateLabel = (d: string) =>
    d === defaults.today ? `${d}（今天）` : d === defaults.yesterday ? `${d}（昨天）` : d;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const minutes = Number(duration);
    if (!subjectId) {
      setError("请选择科目");
      return;
    }
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 960) {
      setError("时长需为 1-960 分钟");
      return;
    }
    setSubmitting(true);
    try {
      let res: Response;
      if (edit) {
        // 编辑：PATCH 只改科目/时长/备注（+每周一句话），照片维持原样（日期不可改）
        res = await fetch(`/api/checkins/${edit.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subjectId: Number(subjectId),
            durationMinutes: minutes,
            note,
            weeklyNote: weeklyNote.trim(),
          }),
        });
      } else {
        // 有失败且未移除的照片先拦下：不拦的话错误提示会跟着成功跳转
        // 一闪而过，用户带着缺照片的卡离开还以为全都传上去了
        if (await pickerRef.current?.hasFailed()) {
          setError("有照片还没传成功，请点它重试或移除后再打卡");
          return;
        }
        const photoIds = (await pickerRef.current?.getPhotoIds()) ?? [];
        res = await fetch("/api/checkins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subjectId: Number(subjectId),
            date,
            durationMinutes: minutes,
            note,
            photoIds,
            weeklyNote: weeklyNote.trim(),
          }),
        });
      }
      if (res.ok) {
        // 创建成功带上记入日期：首页横幅确认「已记入 N月N日」（&again=科目 id
        // 供「再来一条」预选），凌晨补昨天的卡不再像消失了一样
        const target = edit ? "/" : `/?done=${date}&again=${Number(subjectId)}`;
        router.push(target);
        router.refresh();
        return;
      }
      setError((await res.json().catch(() => ({}))).error ?? "打卡失败，请重试");
    } catch {
      setError("网络错误，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-svh flex-1 items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">{edit ? "编辑打卡" : "记一笔打卡"}</CardTitle>
          <CardDescription>
            {edit
              ? "修改科目/时长/备注；照片与日期保持原样。"
              : `记入日期：${dateLabel(date)}${dateOptions.length > 1 ? "（凌晨时段可在昨天/今天间切换）" : ""}`}
          </CardDescription>
          <CardAction>
            <Button asChild size="icon" variant="ghost" className="size-8">
              <Link href="/" aria-label="返回首页">
                <ArrowLeft className="size-4" aria-hidden />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="subject">科目</Label>
              {subjects.length > 0 ? (
                <Select value={subjectId} onValueChange={setSubjectId}>
                  <SelectTrigger id="subject" className="w-full">
                    <SelectValue placeholder="选择科目" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  还没有科目，先去{" "}
                  <Link href="/settings" className="text-primary underline-offset-4 hover:underline">
                    管理科目
                  </Link>
                  。
                </p>
              )}
              <Link
                href="/settings"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                管理科目 →
              </Link>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="duration">时长（分钟）</Label>
              <div className="flex gap-2">
                <Input
                  id="duration"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={960}
                  required
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-28"
                />
                <div className="flex flex-wrap gap-2">
                  {QUICK_DURATIONS.map((m) => (
                    <Button
                      key={m}
                      type="button"
                      variant={Number(duration) === m ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDuration(String(m))}
                    >
                      {m}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="note">一句话总结</Label>
              <Textarea
                id="note"
                maxLength={NOTE_LIMIT}
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="比如：线代第二章矩阵秩的证明题过了一遍"
              />
              <span className="self-end text-xs text-muted-foreground">
                {note.length}/{NOTE_LIMIT}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="weekly-note">本周一句话（选填）</Label>
              <Textarea
                id="weekly-note"
                maxLength={WEEKLY_NOTE_LIMIT}
                rows={2}
                value={weeklyNote}
                onChange={(e) => setWeeklyNote(e.target.value)}
                placeholder="比如：这周把英语真题 2010-2015 刷完"
              />
              <span className="text-xs text-muted-foreground">
                写句本周的小目标或小结，会出现在周结算里；一周一条，后写覆盖。
              </span>
            </div>

            {!edit && (
              <div className="flex flex-col gap-2">
                <Label>照片（选填）</Label>
                <PhotoPicker handleRef={pickerRef} onError={setError} />
              </div>
            )}

            {!edit && dateOptions.length > 1 && (
              <div className="flex flex-col gap-2">
                <Label>记入日期</Label>
                <div className="grid grid-cols-2 gap-2">
                  {dateOptions.map((d) => (
                    <Button
                      key={d}
                      type="button"
                      variant={date === d ? "default" : "outline"}
                      onClick={() => {
                        setDate(d);
                        // 切到另一周的日期（周一凌晨把「昨天」切「今天」）：
                        // 预填的每周一句话属于原来的周，不能跟着提交进新周
                        if (weeklyNoteWeek && mondayOf(d) !== weeklyNoteWeek && weeklyNote)
                          setWeeklyNote("");
                      }}
                    >
                      {d === defaults.yesterday ? "记入昨天" : "记入今天"}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter className="mt-6">
            <Button
              type="submit"
              className="w-full"
              disabled={submitting || subjects.length === 0}
            >
              {submitting ? "提交中…" : edit ? "保存修改" : "打卡"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
