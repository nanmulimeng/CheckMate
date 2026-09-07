import { cn } from "@/lib/utils";
import type { WeekProgress } from "@/lib/weekly";

// 首页「本周保底」进度条：7 格对应周一~周日，打卡的天点亮，
// 今天描边，未来留虚线空格。全部状态在服务端算好（lib/weekly.weekProgress），
// 组件只做展示。todayMinutes 是归属日当天已学分钟数（0 时省略）；
// dayLabel 是归属日的叫法（「今天」/凌晨补卡时段的「昨天」），随文案切换。
export default function WeekProgressCard({
  progress,
  todayMinutes,
  dayLabel = "今天",
}: {
  progress: WeekProgress;
  todayMinutes: number;
  dayLabel?: string;
}) {
  const done = progress.remaining === 0;
  return (
    <section className="rounded-lg border bg-card px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">本周保底</h2>
        <p className="text-sm tabular-nums">
          <span className={cn("text-xl font-semibold", done && "text-emerald-600 dark:text-emerald-400")}>
            {progress.days}
          </span>
          <span className="text-muted-foreground"> / {progress.goalDays} 天</span>
        </p>
      </div>
      <div
        className="mt-2.5 flex items-end gap-1.5"
        role="img"
        aria-label={`本周保底进度 ${progress.days}/${progress.goalDays} 天：${progress.text}`}
      >
        {progress.cells.map((c) => (
          <div key={c.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div
              className={cn(
                "h-2 w-full rounded-full",
                c.checked
                  ? "bg-emerald-500"
                  : c.state === "future"
                    ? "border border-dashed border-border"
                    : "bg-muted-foreground/25",
                c.state === "today" && "outline outline-2 outline-offset-2 outline-primary",
              )}
            />
            <span
              className={cn(
                "text-[10px] leading-none",
                c.state === "today" ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {c.label}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-xs text-muted-foreground">
        {progress.text}
        {todayMinutes > 0 && <> · {dayLabel}已学 {(todayMinutes / 60).toFixed(1)} 小时</>}
      </p>
    </section>
  );
}
