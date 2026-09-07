// 全组合力里程碑：所有人打卡时长加在一起的「我们一共走了多远」叙事——
// 和个人保底（只和自己比）互补：个人的节奏自己管，全组的远方一起看。

/** 档位（小时）：跨过即全员推送庆祝，weekly 页常驻显示进度 */
export const MILESTONE_HOURS = [100, 300, 600, 1000] as const;

/** 本次打卡前后的全组累计分钟数 → 跨过了哪些档（小时，升序）。
 *  「before 已在档上、after 更高」不算跨（那一档是历史，早庆祝过了）。 */
export function crossedMilestones(beforeMinutes: number, afterMinutes: number): number[] {
  return MILESTONE_HOURS.filter((h) => {
    const m = h * 60;
    return beforeMinutes < m && afterMinutes >= m;
  });
}

export interface NextMilestone {
  /** 下一档（小时）；已超过最后一档为 null */
  hours: number | null;
  /** 上一档到下一档的区间进度 0-1（第一档从 0 起） */
  ratio: number;
  /** 距下一档还差多少小时 */
  remainingHours: number;
}

/** 累计分钟数 → 下一档与进度（weekly 页进度条） */
export function nextMilestone(totalMinutes: number): NextMilestone {
  const total = totalMinutes / 60;
  const next = MILESTONE_HOURS.find((h) => total < h);
  if (next == null) return { hours: null, ratio: 1, remainingHours: 0 };
  const prev = [...MILESTONE_HOURS].reverse().find((h) => h <= total) ?? 0;
  return {
    hours: next,
    ratio: Math.min(1, (total - prev) / (next - prev)),
    remainingHours: next - total,
  };
}

/** 按打卡先后（createdAt 升序）累加，回推每个已解锁档的解锁时刻。
 *  rows 传全组全部打卡；同刻多条以先到先计。用于 weekly 页档位徽章上的日期。 */
export function milestoneHistory(
  rows: { durationMinutes: number; createdAt: Date }[],
): Map<number, Date> {
  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const hist = new Map<number, Date>();
  let sum = 0;
  for (const r of sorted) {
    sum += r.durationMinutes;
    for (const h of MILESTONE_HOURS) {
      if (!hist.has(h) && sum >= h * 60) hist.set(h, r.createdAt);
    }
  }
  return hist;
}
