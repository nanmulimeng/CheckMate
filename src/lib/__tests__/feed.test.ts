import { describe, it, expect } from "vitest";
import { buildFeed, daysBetween, dayLabel, FEED_WINDOW_DAYS, type BuildFeedArgs } from "../feed";

const TODAY = "2026-08-31"; // 周一

function args(overrides: Partial<BuildFeedArgs> = {}): BuildFeedArgs {
  return {
    date: TODAY,
    viewerId: 1,
    users: [],
    checkIns: [],
    streakDatesByUser: {},
    nudgedUserIds: [],
    examDate: "",
    // 北京 2026-08-31 20:00（UTC 12:00）：TODAY 未过截止，editable 判定稳定
    now: new Date("2026-08-31T12:00:00Z"),
    ...overrides,
  };
}

function row(overrides: Partial<BuildFeedArgs["checkIns"][number]> = {}): BuildFeedArgs["checkIns"][number] {
  return {
    id: 10,
    userId: 1,
    date: TODAY,
    subjectName: "政治",
    durationMinutes: 45,
    note: "",
    hasPhoto: false,
    photoIds: [],
    comments: [],
    likeUserIds: [],
    ...overrides,
  };
}

describe("daysBetween", () => {
  it("同日为 0，相邻日为 ±1", () => {
    expect(daysBetween(TODAY, TODAY)).toBe(0);
    expect(daysBetween(TODAY, "2026-09-01")).toBe(1);
    expect(daysBetween("2026-09-01", TODAY)).toBe(-1);
  });

  it("跨月/跨年按日历天数", () => {
    expect(daysBetween("2026-08-31", "2026-12-19")).toBe(110);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    // 闰年 2 月
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2027-02-28", "2027-03-01")).toBe(1);
  });
});

describe("dayLabel", () => {
  it("距今 ≤2 天用相对词，恒带日期与星期", () => {
    expect(dayLabel("2026-08-31", TODAY)).toBe("今天 8月31日 · 周一");
    expect(dayLabel("2026-08-30", TODAY)).toBe("昨天 8月30日 · 周日");
    expect(dayLabel("2026-08-29", TODAY)).toBe("前天 8月29日 · 周六");
  });

  it("更早只写日期；锚点是归属日而非自然日（补卡时段昨天仍叫昨天）", () => {
    expect(dayLabel("2026-08-28", TODAY)).toBe("8月28日 · 周五");
    // 凌晨补卡窗口：归属日=8-31，自然日已是 9-01
    expect(dayLabel("2026-08-31", "2026-09-01")).toBe("昨天 8月31日 · 周一");
  });
});

describe("buildFeed", () => {
  it("未打卡用户排在最后，组内保持 userId 顺序", () => {
    const feed = buildFeed(
      args({
        users: [
          { id: 1, displayName: "甲" },
          { id: 2, displayName: "乙" },
          { id: 3, displayName: "丙" },
        ],
        checkIns: [row({ id: 10, userId: 3, subjectName: "数学", hasPhoto: true, photoIds: [7] })],
      }),
    );
    expect(feed.members.map((m) => m.userId)).toEqual([3, 1, 2]);
    expect(feed.members.map((m) => m.hasCheckedIn)).toEqual([true, false, false]);
  });

  it("hasCheckedIn 只看归属日：只有历史卡的用户状态是未打卡，但卡仍进动态流", () => {
    const feed = buildFeed(
      args({
        users: [{ id: 1, displayName: "甲" }],
        checkIns: [row({ id: 10, userId: 1, date: "2026-08-30" })],
      }),
    );
    expect(feed.members[0].hasCheckedIn).toBe(false);
    expect(feed.days.map((d) => d.date)).toEqual(["2026-08-30"]);
  });

  it("打卡卡带日期/署名/科目/时长，点赞数与 likedByMe 按 viewer 计算", () => {
    const feed = buildFeed(
      args({
        viewerId: 2,
        users: [
          { id: 1, displayName: "甲" },
          { id: 2, displayName: "乙" },
        ],
        checkIns: [
          row({
            userId: 1,
            subjectName: "政治",
            note: "马原选择题",
            comments: [{ id: 99, authorName: "乙", content: "加油" }],
            likeUserIds: [1, 2, 3],
          }),
        ],
      }),
    );
    const card = feed.days[0].checkins[0];
    expect(card.date).toBe(TODAY);
    expect(card.displayName).toBe("甲");
    expect(card.subjectName).toBe("政治");
    expect(card.durationMinutes).toBe(45);
    expect(card.note).toBe("马原选择题");
    expect(card.comments).toEqual([{ id: 99, authorName: "乙", content: "加油" }]);
    expect(card.likeCount).toBe(3);
    expect(card.likedByMe).toBe(true);

    // 换个没点赞的 viewer：同一张卡 likedByMe 变 false，count 不变
    const other = buildFeed(
      args({ viewerId: 4, users: [{ id: 1, displayName: "甲" }], checkIns: [row({ likeUserIds: [1, 2, 3] })] }),
    );
    expect(other.days[0].checkins[0].likedByMe).toBe(false);
    expect(other.days[0].checkins[0].likeCount).toBe(3);
  });

  it("近一周按天倒序分组，组内保持打卡先后，无卡的天不出现", () => {
    const feed = buildFeed(
      args({
        users: [{ id: 1, displayName: "甲" }, { id: 2, displayName: "乙" }],
        checkIns: [
          row({ id: 1, userId: 1, date: "2026-08-25", durationMinutes: 30 }), // 窗口首天
          row({ id: 2, userId: 2, date: "2026-08-26" }),
          row({ id: 3, userId: 1, date: "2026-08-26" }), // 同日第二条（id 更大排后）
          row({ id: 4, userId: 1, date: TODAY, durationMinutes: 60 }),
          // 8-27..8-30 无卡：不出现
        ],
      }),
    );
    expect(FEED_WINDOW_DAYS).toBe(7);
    expect(feed.days.map((d) => d.date)).toEqual([TODAY, "2026-08-26", "2026-08-25"]);
    expect(feed.days[0].label).toBe("今天 8月31日 · 周一");
    expect(feed.days[1].checkins.map((c) => c.id)).toEqual([2, 3]); // 组内 id 升序
  });

  it("早于窗口的记录被裁掉（第 8 天以前的卡不进动态流）", () => {
    const feed = buildFeed(
      args({
        users: [{ id: 1, displayName: "甲" }],
        checkIns: [row({ id: 1, userId: 1, date: "2026-08-24" })], // 窗口起点 8-25 的前一天
      }),
    );
    expect(feed.days).toEqual([]);
  });

  it("streak 归属日没打但仍可补卡 → computeStreak 回退昨天锚点，streak 不断", () => {
    const feed = buildFeed(
      args({
        users: [{ id: 1, displayName: "甲" }],
        streakDatesByUser: {
          1: ["2026-08-29", "2026-08-30"], // 昨天为止连续两天
        },
      }),
    );
    expect(feed.members[0].hasCheckedIn).toBe(false);
    expect(feed.members[0].streak).toBe(2);
  });

  it("无任何打卡记录的用户 streak 为 0", () => {
    const feed = buildFeed(args({ users: [{ id: 5, displayName: "丙" }] }));
    expect(feed.members[0].streak).toBe(0);
  });

  it("nudgeAlreadySentToday 来自我今天的催学记录", () => {
    const feed = buildFeed(
      args({
        users: [
          { id: 1, displayName: "甲" },
          { id: 2, displayName: "乙" },
        ],
        nudgedUserIds: [2],
      }),
    );
    expect(feed.members[0].nudgeAlreadySentToday).toBe(false);
    expect(feed.members[1].nudgeAlreadySentToday).toBe(true);
  });

  it("exam_date 未设置或格式不合法 → null；合法 → 剩余天数", () => {
    expect(buildFeed(args({ examDate: "" })).examDate).toBeNull();
    expect(buildFeed(args({ examDate: "" })).daysToExam).toBeNull();
    // 斜杠格式不认，避免 Date.parse 宽松解析出错误天数
    expect(buildFeed(args({ examDate: "2026/12/19" })).daysToExam).toBeNull();
    expect(buildFeed(args({ examDate: "2026-12-19" })).daysToExam).toBe(110);
    expect(buildFeed(args({ examDate: "2026-08-31" })).daysToExam).toBe(0);
  });

  it("editable：归属日卡本人未过截止可编辑，他人不可，历史卡即使本人也只读", () => {
    const mine = row(); // date 默认 TODAY，viewer=1 本人
    // 北京 8-31 20:00 未过当天截止 → 可编辑
    expect(buildFeed(args({ users: [{ id: 1, displayName: "甲" }], checkIns: [mine] })).days[0].checkins[0].editable).toBe(true);
    // 换 viewer=4（他人）→ 不可编辑
    expect(
      buildFeed(args({ viewerId: 4, users: [{ id: 1, displayName: "甲" }], checkIns: [mine] })).days[0].checkins[0].editable,
    ).toBe(false);
    // 历史卡（3 天前）：canCheckInFor 只认今天/昨天，即使本人也只读
    expect(
      buildFeed(
        args({ users: [{ id: 1, displayName: "甲" }], checkIns: [row({ id: 11, date: "2026-08-28" })] }),
      ).days[0].checkins[0].editable,
    ).toBe(false);
    // 时钟拨到北京 9-01 02:00（UTC 8-31 18:00，8-31 的截止 01:00 已过）→ 本人也不可编辑
    expect(
      buildFeed(
        args({ users: [{ id: 1, displayName: "甲" }], checkIns: [mine], now: new Date("2026-08-31T18:00:00Z") }),
      ).days[0].checkins[0].editable,
    ).toBe(false);
    // 同一时刻但管理员把截止小时配成 5 → 窗口恢复，本人又可编辑
    expect(
      buildFeed(
        args({
          users: [{ id: 1, displayName: "甲" }],
          checkIns: [mine],
          now: new Date("2026-08-31T18:00:00Z"),
          deadlineHour: 5,
        }),
      ).days[0].checkins[0].editable,
    ).toBe(true);
  });
});
