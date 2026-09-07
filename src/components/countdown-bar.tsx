import { CalendarDays } from "lucide-react";

// 顶部考试倒计时：大字卡片，数字是视觉锚点。
// 剩余天数在服务端算好（lib/feed.ts）传入；组件只做展示，不做任何日期推算。
export default function CountdownBar({
  examDate,
  daysToExam,
}: {
  examDate: string | null;
  daysToExam: number | null;
}) {
  return (
    <section className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <CalendarDays className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        {daysToExam == null ? (
          <p className="text-sm text-muted-foreground">
            还没有设置考试日期：管理员配置 exam_date 后，这里会显示倒计时。
          </p>
        ) : daysToExam > 0 ? (
          <p className="text-sm text-muted-foreground">距考研（{examDate}）</p>
        ) : (
          <p className="text-sm">考研日已到（{examDate}），稳住节奏，正常发挥！</p>
        )}
      </div>
      {daysToExam != null && daysToExam > 0 && (
        <p className="shrink-0 tabular-nums">
          <span className="text-3xl font-semibold leading-none">{daysToExam}</span>
          <span className="ml-1 text-sm text-muted-foreground">天</span>
        </p>
      )}
    </section>
  );
}
