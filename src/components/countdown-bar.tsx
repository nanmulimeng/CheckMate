import { CalendarDays } from "lucide-react";

// 顶部考试倒计时条。剩余天数在服务端算好（lib/feed.ts）传入；
// 组件只做展示，不做任何日期推算。
export default function CountdownBar({
  examDate,
  daysToExam,
}: {
  examDate: string | null;
  daysToExam: number | null;
}) {
  return (
    <section className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
      <CalendarDays className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      {daysToExam == null ? (
        <p className="text-sm text-muted-foreground">
          还没有设置考试日期：管理员配置 exam_date 后，这里会显示倒计时。
        </p>
      ) : daysToExam > 0 ? (
        <p className="text-sm">
          距考研（{examDate}）还有{" "}
          <span className="text-xl font-semibold tabular-nums">{daysToExam}</span> 天
        </p>
      ) : (
        <p className="text-sm">考研日已到（{examDate}），稳住节奏，正常发挥！</p>
      )}
    </section>
  );
}
