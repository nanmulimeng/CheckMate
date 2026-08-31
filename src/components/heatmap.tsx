import { cn } from "@/lib/utils";
import { heatLevel, type HeatRecord } from "@/lib/me-stats";

// 近 26 周打卡热力图（GitHub 风格）。records 由服务端按窗口逐日聚合好、
// 周一起始升序传入：长度 = 周数 × 7。组件只做摆格子上色，不做日期运算。

/** 四级色阶（任务规定 verbatim）：无 / 无凭证 / 有凭证 1 条 / 有凭证多条 */
const LEVEL_CLASSES = ["bg-neutral-200", "bg-amber-300", "bg-emerald-400", "bg-emerald-600"];

const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function cellTitle(r: HeatRecord): string {
  return r.count > 0
    ? `${r.date} · ${r.count} 条 · ${r.hasAnyPhoto ? "有凭证" : "无凭证"}`
    : `${r.date} · 无打卡`;
}

export default function Heatmap({ records }: { records: HeatRecord[] }) {
  // 每列一周（周一..周日），列从左到右时间递增
  const weeks: HeatRecord[][] = [];
  for (let i = 0; i < records.length; i += 7) weeks.push(records.slice(i, i + 7));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-[2px] overflow-x-auto">
        <div aria-hidden className="flex shrink-0 flex-col gap-[2px]">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className="flex h-[11px] items-center text-[9px] leading-none text-muted-foreground">
              {label}
            </span>
          ))}
        </div>
        <div role="grid" aria-label="近 26 周打卡热力图" className="flex gap-[2px]">
          {weeks.map((week, i) => (
            <div key={i} role="row" className="flex flex-col gap-[2px]">
              {week.map((r) => (
                <span
                  key={r.date}
                  role="gridcell"
                  aria-label={cellTitle(r)}
                  title={cellTitle(r)}
                  className={cn("size-[11px] shrink-0 rounded-[2px]", LEVEL_CLASSES[heatLevel(r.count, r.hasAnyPhoto)])}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <ul aria-label="色阶说明" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {[
          { cls: LEVEL_CLASSES[0], label: "无打卡" },
          { cls: LEVEL_CLASSES[1], label: "无凭证" },
          { cls: LEVEL_CLASSES[2], label: "有凭证 1 条" },
          { cls: LEVEL_CLASSES[3], label: "有凭证多条" },
        ].map((item) => (
          <li key={item.label} className="flex items-center gap-1">
            <span aria-hidden className={cn("size-[11px] rounded-[2px]", item.cls)} />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
