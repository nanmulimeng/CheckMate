import type { SubjectBar } from "@/lib/me-stats";

// 按科目总时长的横条列表。bars 已按总分钟降序、宽度百分比相对最大科目
// 由服务端算好；组件只渲染名字 + 条 + 小时数（单一度量用同一颜色，
// 科目身份由文字标签承载）。
export default function SubjectStats({ bars }: { bars: SubjectBar[] }) {
  if (bars.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        还没有可统计的学习时长，打卡之后这里会按科目汇总。
      </p>
    );
  }

  return (
    <ul aria-label="按科目总时长" className="flex flex-col gap-2.5">
      {bars.map((b) => (
        <li key={b.subjectId} className="flex items-center gap-2">
          <span className="w-14 shrink-0 truncate text-sm" title={b.name}>
            {b.name}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span
              className="block h-full rounded-full bg-emerald-500"
              style={{ width: `${b.widthPct}%` }}
            />
          </span>
          <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {b.hours} 小时
          </span>
        </li>
      ))}
    </ul>
  );
}
