import { describe, it, expect } from "vitest";
import { buildFeed, daysBetween, type BuildFeedArgs } from "../feed";

const TODAY = "2026-08-31";

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

describe("buildFeed", () => {
  it("未打卡用户排在最后，组内保持 userId 顺序", () => {
    const feed = buildFeed(
      args({
        users: [
          { id: 1, displayName: "甲" },
          { id: 2, displayName: "乙" },
          { id: 3, displayName: "丙" },
        ],
        checkIns: [
          {
            id: 10,
            userId: 3,
            subjectName: "数学",
            durationMinutes: 60,
            note: "",
            hasPhoto: true,
            photoIds: [7],
            comments: [],
            likeUserIds: [],
          },
        ],
      }),
    );
    expect(feed.members.map((m) => m.userId)).toEqual([3, 1, 2]);
    expect(feed.members.map((m) => m.hasCheckedIn)).toEqual([true, false, false]);
  });

  it("打卡卡带科目/时长/照片/评论，点赞数与 likedByMe 按 viewer 计算", () => {
    const feed = buildFeed(
      args({
        viewerId: 2,
        users: [
          { id: 1, displayName: "甲" },
          { id: 2, displayName: "乙" },
        ],
        checkIns: [
          {
            id: 10,
            userId: 1,
            subjectName: "政治",
            durationMinutes: 45,
            note: "马原选择题",
            hasPhoto: false,
            photoIds: [],
            comments: [{ id: 99, authorName: "乙", content: "加油" }],
            likeUserIds: [1, 2, 3],
          },
        ],
      }),
    );
    const card = feed.members[0].checkins[0];
    expect(card.subjectName).toBe("政治");
    expect(card.durationMinutes).toBe(45);
    expect(card.note).toBe("马原选择题");
    expect(card.comments).toEqual([{ id: 99, authorName: "乙", content: "加油" }]);
    expect(card.likeCount).toBe(3);
    expect(card.likedByMe).toBe(true);

    // 换个没点赞的 viewer：同一张卡 likedByMe 变 false，count 不变
    const row = {
      id: 10,
      userId: 1,
      subjectName: "政治",
      durationMinutes: 45,
      note: "",
      hasPhoto: false,
      photoIds: [],
      comments: [],
      likeUserIds: [1, 2, 3],
    } satisfies BuildFeedArgs["checkIns"][number];
    const other = buildFeed(
      args({ viewerId: 4, users: [{ id: 1, displayName: "甲" }], checkIns: [row] }),
    );
    expect(other.members[0].checkins[0].likedByMe).toBe(false);
    expect(other.members[0].checkins[0].likeCount).toBe(3);
  });

  it("streak 今天没打但仍可补卡 → computeStreak 回退昨天锚点，streak 不断", () => {
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

  it("editable：本人且未过截止才可编辑，他人打卡不可", () => {
    const row = {
      id: 10,
      userId: 1,
      subjectName: "政治",
      durationMinutes: 45,
      note: "",
      hasPhoto: false,
      photoIds: [],
      comments: [],
      likeUserIds: [],
    } satisfies BuildFeedArgs["checkIns"][number];
    // viewerId=1（本人），北京 8-31 20:00 未过当天截止 → 可编辑
    expect(buildFeed(args({ users: [{ id: 1, displayName: "甲" }], checkIns: [row] })).members[0].checkins[0].editable).toBe(true);
    // 换 viewer=4（他人）→ 不可编辑
    expect(buildFeed(args({ viewerId: 4, users: [{ id: 1, displayName: "甲" }], checkIns: [row] })).members[0].checkins[0].editable).toBe(false);
    // 时钟拨到北京 9-01 02:00（UTC 8-31 18:00，8-31 的截止 01:00 已过）→ 本人也不可编辑
    expect(
      buildFeed(args({ users: [{ id: 1, displayName: "甲" }], checkIns: [row], now: new Date("2026-08-31T18:00:00Z") })).members[0].checkins[0].editable,
    ).toBe(false);
  });
});
