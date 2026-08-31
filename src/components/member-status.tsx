import { cn } from "@/lib/utils";

export interface MemberStatusItem {
  userId: number;
  displayName: string;
  hasCheckedIn: boolean;
}

// 全员头像带：已打卡绿点、未打卡灰点（打卡态由服务端算好传入，纯展示）
export default function MemberStatus({ members }: { members: MemberStatusItem[] }) {
  return (
    <section aria-label="今日打卡状态" className="rounded-lg border bg-card px-4 py-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-3">
        {members.map((m) => (
          <li key={m.userId} className="flex w-14 flex-col items-center gap-1">
            <div
              className={cn(
                "relative flex size-11 items-center justify-center rounded-full border text-sm font-medium",
                m.hasCheckedIn
                  ? "border-emerald-600/50 bg-emerald-500/10"
                  : "border-border bg-muted text-muted-foreground",
              )}
            >
              {m.displayName.slice(0, 1)}
              <span
                role="img"
                aria-label={m.hasCheckedIn ? "已打卡" : "未打卡"}
                className={cn(
                  "absolute top-0 right-0 size-3 rounded-full border-2 border-card",
                  m.hasCheckedIn ? "bg-emerald-500" : "bg-muted-foreground/40",
                )}
              />
            </div>
            <span className="w-full truncate text-center text-xs text-muted-foreground">
              {m.displayName}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
