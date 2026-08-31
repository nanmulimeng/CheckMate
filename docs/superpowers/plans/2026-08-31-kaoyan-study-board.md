# 考研督促学习板（SETI）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 2-5 位考研朋友构建互相督促的打卡网站（互见动态流 + 催学推送 + 热力图 + 周结算），部署到用户的阿里云服务器。

**Architecture:** Next.js 15 全栈单体（App Router），Prisma + SQLite，iron-session Cookie 认证，Server酱微信推送，PM2 + Caddy 部署（本地构建上传产物）。

**Tech Stack:** Next.js 15 / React 19 / TypeScript / Tailwind CSS 4 / shadcn/ui / Prisma / SQLite / iron-session / bcryptjs / Server酱 / Vitest

**Spec:** `docs/superpowers/specs/2026-08-31-kaoyan-study-board-design.md`（本计划从该 spec 出发，执行者须同时阅读 spec）

## Global Constraints

- 时区：一切日期计算走 `src/lib/dates.ts`，北京无夏令时，UTC 17:00 = 北京次日 01:00；禁止在别处手写跨天逻辑
- 截止：次日 01:00（北京时间）锁定，实时计算，不依赖 cron
- 凌晨归属：00:00–01:00 打开打卡页默认日期=昨天，可切今天
- 不可补卡：过期日期的打卡请求一律 403
- Nudge：每人每天对同一人限 1 次（数据库唯一约束兜底）
- 照片：1-3 张/次，前端压缩至 ≤300KB，仅登录成员可访问
- 有历史打卡的科目禁止删除
- 第一个注册用户 is_admin=true；管理员可重置成员密码
- 密码 bcrypt 哈希；会话 iron-session 加密 Cookie
- Server酱失败只记日志，不阻塞任何主流程
- 纪律：TDD（纯函数先行）、每任务结束 commit、禁止超出 spec 的功能（YAGNI）
- Node ≥ 20；包管理器用 pnpm

---

### Task 1: 项目脚手架与工具链

**Files:**
- Create: 整个 Next.js 项目骨架（`package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx` 等，由脚手架生成后裁剪）
- Create: `prisma/schema.prisma`（空模型占位，Task 2 填充）
- Create: `vitest.config.ts`, `src/lib/__tests__/smoke.test.ts`
- Create: `.env`（`DATABASE_URL="file:./dev.db"`, `SESSION_SECRET=dev-secret-change-in-prod`）

**Interfaces:**
- Produces: 可运行的空项目；`pnpm dev` 出首页；`pnpm test` 跑通；`pnpm db:migrate` 可执行（package.json script）

- [ ] **Step 1: 脚手架生成项目**

```bash
cd d:/software/item/SETI
pnpm create next-app@latest . --ts --tailwind --app --eslint --src-dir --use-pnpm --no-import-alias
```

（交互项全选默认；若目录非空含 docs/，允许继续。）

- [ ] **Step 2: 安装依赖**

```bash
pnpm add @prisma/client iron-session bcryptjs
pnpm add -D prisma vitest
pnpm dlx prisma init --datasource-provider sqlite
```

- [ ] **Step 3: 配置 Vitest**

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

`package.json` scripts 追加：

```json
"test": "vitest run",
"db:migrate": "prisma migrate dev"
```

- [ ] **Step 4: 冒烟测试**

`src/lib/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs typescript tests", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: 验证并提交**

Run: `pnpm test` → PASS；`pnpm build` → 成功

```bash
git add -A && git commit -m "chore: Next.js 15 + Prisma + Vitest 脚手架"
```

---

### Task 2: 数据模型（7 张表）

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/seed.ts`

**Interfaces:**
- Produces: Prisma 模型 `User, Subject, CheckIn, Photo, Comment, Like, Nudge, Setting`；seed 写入默认 Setting（invite_code 随机 8 位、deadline_hour="1"、remind_hour="21"、cron_secret 随机、exam_date 空）

- [ ] **Step 1: 编写 schema**

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "sqlite", url = env("DATABASE_URL") }

model User {
  id            Int       @id @default(autoincrement())
  username      String    @unique
  passwordHash  String
  displayName   String
  serverchanKey String?
  isAdmin       Boolean   @default(false)
  createdAt     DateTime  @default(now())
  subjects      Subject[]
  checkins      CheckIn[]
  comments      Comment[]
  likes         Like[]
  nudgesSent    Nudge[]   @relation("from")
  nudgesGot     Nudge[]   @relation("to")
}

model Subject {
  id        Int      @id @default(autoincrement())
  userId    Int
  name      String
  sortOrder Int      @default(0)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  checkins  CheckIn[]
}

model CheckIn {
  id              Int        @id @default(autoincrement())
  userId          Int
  subjectId       Int
  date            String     // 北京时间 YYYY-MM-DD
  durationMinutes Int
  note            String     @default("")
  hasPhoto        Boolean    @default(false)
  createdAt       DateTime   @default(now())
  user            User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  subject         Subject    @relation(fields: [subjectId], references: [id])
  photos          Photo[]
  comments        Comment[]
  likes           Like[]

  @@index([date])
  @@index([userId, date])
}

model Photo {
  id        Int      @id @default(autoincrement())
  checkInId Int?     // 可空：上传先暂存、创建打卡时再绑定（悬挂照片由 cleanup cron 清理）
  filePath  String
  createdAt DateTime @default(now())
  checkIn   CheckIn? @relation(fields: [checkInId], references: [id], onDelete: Cascade)
}

model Comment {
  id        Int      @id @default(autoincrement())
  checkInId Int
  userId    Int
  content   String
  createdAt DateTime @default(now())
  checkIn   CheckIn  @relation(fields: [checkInId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Like {
  checkInId Int
  userId    Int
  checkIn   CheckIn @relation(fields: [checkInId], references: [id], onDelete: Cascade)
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([checkInId, userId])
}

model Nudge {
  id         Int    @id @default(autoincrement())
  fromUserId Int
  toUserId   Int
  date       String
  from       User   @relation("from", fields: [fromUserId], references: [id], onDelete: Cascade)
  to         User   @relation("to", fields: [toUserId], references: [id], onDelete: Cascade)

  @@unique([fromUserId, toUserId, date])
}

model Setting {
  key   String @id
  value String
}
```

注意：`CheckIn.subject` 刻意**不加** Cascade —— 有历史打卡的科目靠应用层禁删（spec 规则），数据库层保留引用完整性。

- [ ] **Step 2: 迁移并验证**

```bash
pnpm db:migrate -- --name init
```

Expected: 生成 migration，`prisma/dev.db` 出现。

- [ ] **Step 3: seed 脚本**

`prisma/seed.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const rand = (n: number) =>
  Array.from({ length: n }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");

async function main() {
  const defaults: Record<string, string> = {
    invite_code: rand(8),
    deadline_hour: "1",   // 次日 01:00
    remind_hour: "21",
    cron_secret: rand(24),
    exam_date: "",
  };
  for (const [key, value] of Object.entries(defaults)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
}
main().finally(() => prisma.$disconnect());
```

`package.json` 加 `"db:seed": "tsx prisma/seed.ts"`，并 `pnpm add -D tsx`。

- [ ] **Step 4: 跑 seed 并提交**

```bash
pnpm db:seed
git add -A && git commit -m "feat: 数据模型与默认配置 seed"
```

---

### Task 3: 日期核心库 dates.ts（TDD，全项目最关键）

**Files:**
- Create: `src/lib/dates.ts`
- Test: `src/lib/__tests__/dates.test.ts`

**Interfaces:**
- Produces（后续所有任务依赖这些精确签名）:
  - `beijingDateStr(d: Date): string` — 北京日期 'YYYY-MM-DD'
  - `beijingHour(d: Date): number` — 北京小时数 0-23
  - `deadlineOf(dateStr: string): Date` — dateStr 次日北京 01:00 的绝对时刻
  - `canCheckInFor(dateStr: string, now: Date): boolean`
  - `defaultCheckInDate(now: Date): string` — 凌晨归属规则
  - `addDays(dateStr: string, n: number): string`
  - `lastMonday(now: Date): string` — 上周一日期
  - `dateRange(start: string, end: string): string[]` — 闭区间

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import {
  beijingDateStr, beijingHour, deadlineOf, canCheckInFor,
  defaultCheckInDate, addDays, lastMonday, dateRange,
} from "../dates";

// 北京 = UTC+8 恒定（无夏令时）。UTC 时刻 X 的北京时刻 = X+8h。
describe("beijingDateStr", () => {
  it("UTC 16:59 是北京当天 23:59 → 当天日期", () => {
    expect(beijingDateStr(new Date("2026-12-01T16:59:00Z"))).toBe("2026-12-01");
  });
  it("UTC 17:00 是北京次日 01:00 → 次日日期", () => {
    expect(beijingDateStr(new Date("2026-12-01T17:00:00Z"))).toBe("2026-12-02");
  });
});

describe("deadlineOf", () => {
  it("12-01 的截止 = 12-02 北京 01:00 = UTC 12-01 17:00", () => {
    expect(deadlineOf("2026-12-01").getTime()).toBe(Date.UTC(2026, 11, 1, 17, 0, 0));
  });
});

describe("canCheckInFor", () => {
  it("截止前可以", () => {
    expect(canCheckInFor("2026-12-01", new Date("2026-12-01T10:00:00Z"))).toBe(true);
  });
  it("截止时刻之后不可以", () => {
    expect(canCheckInFor("2026-12-01", new Date("2026-12-01T17:00:01Z"))).toBe(false);
  });
  it("未来日期不可以（防穿越）", () => {
    expect(canCheckInFor("2026-12-05", new Date("2026-12-01T10:00:00Z"))).toBe(false);
  });
});

describe("defaultCheckInDate（凌晨归属）", () => {
  it("北京 00:30 → 默认昨天", () => {
    expect(defaultCheckInDate(new Date("2026-12-01T16:30:00Z"))).toBe("2026-11-30");
  });
  it("北京 01:30 → 今天", () => {
    expect(defaultCheckInDate(new Date("2026-12-01T17:30:00Z"))).toBe("2026-12-01");
  });
  it("北京 14:00 → 今天", () => {
    expect(defaultCheckInDate(new Date("2026-12-01T06:00:00Z"))).toBe("2026-12-01");
  });
});

describe("周与区间", () => {
  it("2026-08-31(周一)的 lastMonday = 2026-08-24", () => {
    expect(lastMonday(new Date("2026-08-31T04:00:00Z"))).toBe("2026-08-24");
  });
  it("dateRange 闭区间", () => {
    expect(dateRange("2026-08-24", "2026-08-26")).toEqual(["2026-08-24", "2026-08-25", "2026-08-26"]);
  });
  it("addDays 跨月", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/lib/__tests__/dates.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// 北京时区无夏令时：UTC 17:00 恒等于北京次日 01:00。
const BJ = "Asia/Shanghai";

export function beijingDateStr(d: Date): string {
  // en-CA locale 输出 YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: BJ }).format(d);
}

export function beijingHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: BJ, hour: "2-digit", hour12: false }).format(d));
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// dateStr 次日北京 01:00 = dateStr 当天 UTC 17:00
export function deadlineOf(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 17, 0, 0));
}

export function canCheckInFor(dateStr: string, now: Date): boolean {
  const today = beijingDateStr(now);
  if (dateStr !== today && dateStr !== addDays(today, -1)) return false; // 只允许今天/昨天
  return now.getTime() < deadlineOf(dateStr).getTime();
}

export function defaultCheckInDate(now: Date): string {
  const today = beijingDateStr(now);
  return beijingHour(now) < 1 ? addDays(today, -1) : today;
}

export function lastMonday(now: Date): string {
  const today = beijingDateStr(now);
  const [y, m, d] = today.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=周日
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(today, -back - 7);
}

export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let cur = start; cur <= end; cur = addDays(cur, 1)) out.push(cur);
  return out;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/lib/__tests__/dates.test.ts` → 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: 北京时区日期核心库（TDD）"
```

---

### Task 4: streak 与周结算纯函数（TDD）

**Files:**
- Create: `src/lib/streak.ts`, `src/lib/weekly.ts`
- Test: `src/lib/__tests__/streak.test.ts`, `src/lib/__tests__/weekly.test.ts`

**Interfaces:**
- Consumes: `dateRange`, `beijingDateStr`, `lastMonday`（Task 3）
- Produces:
  - `computeStreak(dates: string[], today: string): number` — 连续有效打卡天数；今天未到截止时今天缺席不断
  - `interface WeeklyStat { userId: number; displayName: string; days: number; totalMinutes: number; noProofDays: number; missedDays: number }`
  - `computeWeekly(rows: { userId: number; displayName: string; date: string; durationMinutes: number; hasPhoto: boolean }[], weekStart: string): WeeklyStat[]`

- [ ] **Step 1: streak 失败测试**

```ts
import { describe, it, expect } from "vitest";
import { computeStreak } from "../streak";

describe("computeStreak", () => {
  it("连续三天", () => {
    expect(computeStreak(["2026-12-01", "2026-11-30", "2026-11-29"], "2026-12-01")).toBe(3);
  });
  it("中间断一天只算最近的", () => {
    expect(computeStreak(["2026-12-01", "2026-11-28"], "2026-12-01")).toBe(1);
  });
  it("今天缺但昨天有 → 昨天 streak（今天未截止，不断）", () => {
    expect(computeStreak(["2026-11-30", "2026-11-29"], "2026-12-01")).toBe(2);
  });
  it("完全没打过 → 0", () => {
    expect(computeStreak([], "2026-12-01")).toBe(0);
  });
  it("同一日期多条记录不重复计数", () => {
    expect(computeStreak(["2026-12-01", "2026-12-01"], "2026-12-01")).toBe(1);
  });
});
```

- [ ] **Step 2: streak 实现**

```ts
import { addDays } from "./dates";

export function computeStreak(dates: string[], today: string): number {
  const set = new Set(dates);
  // 从今天（或昨天，今天缺席且未截止视为进行中）往回数连续天数
  let cur = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(cur)) { n++; cur = addDays(cur, -1); }
  return n;
}
```

Run: `pnpm test src/lib/__tests__/streak.test.ts` → PASS

- [ ] **Step 3: weekly 失败测试**

```ts
import { describe, it, expect } from "vitest";
import { computeWeekly } from "../weekly";

const rows = [
  { userId: 1, displayName: "甲", date: "2026-08-24", durationMinutes: 120, hasPhoto: true },
  { userId: 1, displayName: "甲", date: "2026-08-25", durationMinutes: 60, hasPhoto: false },
  { userId: 2, displayName: "乙", date: "2026-08-24", durationMinutes: 200, hasPhoto: true },
];

describe("computeWeekly（weekStart=周一 2026-08-24）", () => {
  const stats = computeWeekly(rows, "2026-08-24");
  it("甲：2天 180分钟 无凭证1天", () => {
    const a = stats.find((s) => s.userId === 1)!;
    expect(a.days).toBe(2);
    expect(a.totalMinutes).toBe(180);
    expect(a.noProofDays).toBe(1);
  });
  it("乙：缺卡6天", () => {
    const b = stats.find((s) => s.userId === 2)!;
    expect(b.missedDays).toBe(6);
  });
  it("区间外数据不计入", () => {
    expect(computeWeekly([...rows, { userId: 1, displayName: "甲", date: "2026-08-31", durationMinutes: 99, hasPhoto: true }], "2026-08-24").find((s) => s.userId === 1)!.days).toBe(2);
  });
});
```

- [ ] **Step 4: weekly 实现**

```ts
import { dateRange, addDays } from "./dates";

export interface WeeklyStat {
  userId: number; displayName: string;
  days: number; totalMinutes: number; noProofDays: number; missedDays: number;
}

export function computeWeekly(
  rows: { userId: number; displayName: string; date: string; durationMinutes: number; hasPhoto: boolean }[],
  weekStart: string
): WeeklyStat[] {
  const days = new Set(dateRange(weekStart, addDays(weekStart, 6)));
  const byUser = new Map<number, WeeklyStat>();
  const daySet = new Map<number, Set<string>>();   // 每人打过的日期
  const noProofSet = new Map<number, Set<string>>(); // 每人无凭证的日期

  for (const r of rows) {
    if (!days.has(r.date)) continue;
    if (!byUser.has(r.userId)) {
      byUser.set(r.userId, { userId: r.userId, displayName: r.displayName, days: 0, totalMinutes: 0, noProofDays: 0, missedDays: 0 });
      daySet.set(r.userId, new Set());
      noProofSet.set(r.userId, new Set());
    }
    byUser.get(r.userId)!.totalMinutes += r.durationMinutes;
    daySet.get(r.userId)!.add(r.date);
    if (!r.hasPhoto) noProofSet.get(r.userId)!.add(r.date);
  }
  for (const s of byUser.values()) {
    s.days = daySet.get(s.userId)!.size;
    s.noProofDays = noProofSet.get(s.userId)!.size;
    s.missedDays = 7 - s.days;
  }
  return [...byUser.values()];
}
```

Run: `pnpm test src/lib/__tests__/weekly.test.ts` → PASS

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: streak 与周结算聚合纯函数（TDD）"
```

---

### Task 5: 认证体系（注册/登录/登出）

**Files:**
- Create: `src/lib/db.ts`, `src/lib/password.ts`, `src/lib/auth.ts`, `src/lib/settings.ts`
- Create: `src/app/api/auth/register/route.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`
- Create: `src/app/login/page.tsx`, `src/app/register/page.tsx`
- Test: `src/lib/__tests__/auth-flow.test.ts`（password + 首用户管理员判定逻辑）

**Interfaces:**
- Consumes: Prisma models（Task 2）
- Produces:
  - `getPrisma(): PrismaClient`（单例）
  - `hashPassword(pw: string): Promise<string>`, `verifyPassword(pw: string, hash: string): Promise<boolean>`
  - `getSession(): Promise<SessionData>`（`{ userId?: number; isAdmin?: boolean }`），`requireUser(): Promise<{id: number; isAdmin: boolean}>`（未登录抛 401 响应）
  - `getSetting(key: string): Promise<string>`, `setSetting(key: string, value: string): Promise<void>`
  - 注册规则：邀请码 = Setting.invite_code；用户数 0 时新用户 isAdmin=true；同时为其 seed 四门预置科目（政治/英语/数学/专业课）

- [ ] **Step 1: 失败测试（密码与注册规则）**

```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../password";

describe("password", () => {
  it("哈希后可验证且不可逆", async () => {
    const h = await hashPassword("secret123");
    expect(h).not.toBe("secret123");
    expect(await verifyPassword("secret123", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});
```

- [ ] **Step 2: 基础库实现**

`src/lib/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";
const g = globalThis as unknown as { prisma?: PrismaClient };
export const getPrisma = () => g.prisma ?? (g.prisma = new PrismaClient());
```

`src/lib/password.ts`:

```ts
import bcrypt from "bcryptjs";
export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);
```

`src/lib/settings.ts`:

```ts
import { getPrisma } from "./db";
export async function getSetting(key: string): Promise<string> {
  const row = await getPrisma().setting.findUnique({ where: { key } });
  return row?.value ?? "";
}
export async function setSetting(key: string, value: string) {
  await getPrisma().setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}
```

`src/lib/auth.ts`:

```ts
import { getIronSession, IronSessionData } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData extends IronSessionData { userId?: number; isAdmin?: boolean }

export async function getSession() {
  const cookieStore = await cookies(); // Next 15: cookies() 为异步
  return getIronSession<SessionData>(cookieStore, {
    cookieName: "seti_session",
    password: process.env.SESSION_SECRET!,
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" },
  });
}

export class AuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function requireUser() {
  const s = await getSession();
  if (!s.userId) throw new AuthError(401, "未登录");
  return { id: s.userId, isAdmin: !!s.isAdmin };
}
```

- [ ] **Step 3: 注册/登录/登出 API**

`src/app/api/auth/register/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { getSetting } from "@/lib/settings";

export async function POST(req: NextRequest) {
  const { username, password, inviteCode } = await req.json();
  if (!username || !password || username.length < 2 || password.length < 6)
    return NextResponse.json({ error: "用户名≥2位，密码≥6位" }, { status: 400 });
  if (inviteCode !== (await getSetting("invite_code")))
    return NextResponse.json({ error: "邀请码错误" }, { status: 403 });
  const db = getPrisma();
  if (await db.user.findUnique({ where: { username } }))
    return NextResponse.json({ error: "用户名已存在" }, { status: 409 });
  const isFirst = (await db.user.count()) === 0;
  const user = await db.user.create({
    data: {
      username, passwordHash: await hashPassword(password),
      displayName: username, isAdmin: isFirst,
      subjects: { create: ["政治", "英语", "数学", "专业课"].map((name, i) => ({ name, sortOrder: i })) },
    },
  });
  return NextResponse.json({ id: user.id, isAdmin: user.isAdmin });
}
```

`login/route.ts`：校验 username+password → 写 session（`userId`、`isAdmin`）→ 返回 ok；失败 401「用户名或密码错误」。
`logout/route.ts`：`session.destroy()` → ok。

- [ ] **Step 4: 登录/注册页面**

两个简单表单页（shadcn `Card` + `Input` + `Button`），注册页含邀请码输入框，成功后 `router.push("/")`。登录态跳转：`/` 未登录重定向 `/login`。

- [ ] **Step 5: 测试与提交**

Run: `pnpm test` → PASS；`pnpm build` → 成功

```bash
git add -A && git commit -m "feat: iron-session 认证与邀请码注册"
```

---

### Task 6: 打卡 API 与打卡页

**Files:**
- Create: `src/app/api/checkins/route.ts`（POST 创建）
- Create: `src/app/api/checkins/[id]/route.ts`（PATCH 编辑 + DELETE，仅本人）
- Create: `src/app/checkin/new/page.tsx`
- Test: `src/lib/__tests__/checkin-rules.test.ts`

**Interfaces:**
- Consumes: `canCheckInFor`, `defaultCheckInDate`（Task 3）；`requireUser`（Task 5）
- Produces: `POST /api/checkins { subjectId, date?, durationMinutes, note, photoIds? } → { id }`；date 缺省时服务端用 `defaultCheckInDate(new Date())`；`PATCH /api/checkins/[id] { subjectId?, durationMinutes?, note? }`（仅本人 + 该打卡日期未过截止）；`DELETE` 仅本人

- [ ] **Step 1: 失败测试（规则收口到 dates 已测，此处测服务端校验函数）**

```ts
import { describe, it, expect } from "vitest";
import { validateCheckInPayload } from "../checkin-validate";

describe("validateCheckInPayload", () => {
  it("合法", () => {
    expect(validateCheckInPayload({ subjectId: 1, durationMinutes: 60, note: "线代第二章" }).ok).toBe(true);
  });
  it("时长必须 1-960 分钟", () => {
    expect(validateCheckInPayload({ subjectId: 1, durationMinutes: 0, note: "" }).ok).toBe(false);
    expect(validateCheckInPayload({ subjectId: 1, durationMinutes: 1000, note: "" }).ok).toBe(false);
  });
  it("note 上限 500 字", () => {
    expect(validateCheckInPayload({ subjectId: 1, durationMinutes: 60, note: "x".repeat(501) }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: 校验模块**

`src/lib/checkin-validate.ts`:

```ts
export function validateCheckInPayload(p: { subjectId?: number; durationMinutes?: number; note?: string }) {
  const ok = Number.isInteger(p.subjectId) && (p.subjectId as number) > 0
    && Number.isInteger(p.durationMinutes) && (p.durationMinutes as number) >= 1 && (p.durationMinutes as number) <= 960
    && (p.note ?? "").length <= 500;
  return { ok };
}
```

Run: 确认 PASS。

- [ ] **Step 3: API 路由**

`src/app/api/checkins/route.ts` 核心：`requireUser` → `validateCheckInPayload` → `date = body.date ?? defaultCheckInDate(new Date())` → `canCheckInFor(date, new Date())` 为 false 时 403「已过截止时间，不可补卡」→ 校验 subjectId 属于当前用户 → `db.checkIn.create` → 绑定 `photoIds` 并置 `hasPhoto=true`（Task 7 提供）。

`[id]/route.ts`：**PATCH**（编辑 note/durationMinutes/subjectId）—— 仅本人 + 该打卡的 `date` 仍满足 `canCheckInFor` 才允许，否则 403「已锁定」；**DELETE** 仅本人，级联删除由 Prisma 处理。两者成功后 `revalidatePath("/")`。

- [ ] **Step 4: 打卡页面**

`/checkin/new`：科目选择（自己的 subjects，含"管理科目"入口指向设置页）→ 时长（分钟数字输入 + 快捷 30/60/90/120 按钮）→ 一句话总结 → 照片选择（`<input type="file" accept="image/*" multiple capture="environment">`，最多 3 张，canvas 压缩到长边 1600px、质量 0.8，单张 >300KB 继续降质量）→ 日期显示（凌晨时段显示「记入昨天」+ 可切换「记入今天」按钮，选项仅在这两个合法值内）→ 提交成功回 `/`。

- [ ] **Step 5: 测试与提交**

```bash
pnpm test && pnpm build
git add -A && git commit -m "feat: 打卡创建/删除 API 与打卡页"
```

---

### Task 7: 照片上传与鉴权访问

**Files:**
- Create: `src/lib/photo-store.ts`
- Create: `src/app/api/photos/route.ts`（POST 上传，multipart）
- Create: `src/app/api/photos/[id]/route.ts`（GET 流式返回，鉴权）
- Test: `src/lib/__tests__/photo-store.test.ts`

**Interfaces:**
- Consumes: `requireUser`（Task 5）
- Produces:
  - `savePhoto(bytes: Buffer, ext: string): Promise<string>` — 存 `${DATA_DIR}/photos/${yyyy-mm}/${uuid}.${ext}`，返回相对路径
  - `readPhoto(relPath: string): Promise<Buffer>`
  - `DATA_DIR = process.env.SETI_DATA_DIR ?? path.join(process.cwd(), "data")`
  - 上传流程：先 POST /api/photos（暂存，返回 photoToken）→ 创建 CheckIn 时携带 tokens 绑定；未绑定的暂存照片由每日 cron 清理（Task 11 记录）

- [ ] **Step 1: 失败测试**

```ts
import { describe, it, expect } from "vitest";
import { photoPathIsSafe } from "../photo-store";

describe("photoPathIsSafe（防路径穿越）", () => {
  it("正常相对路径", () => expect(photoPathIsSafe("photos/2026-08/a.png")).toBe(true));
  it("拒绝绝对路径", () => expect(photoPathIsSafe("/etc/passwd")).toBe(false));
  it("拒绝 .. 穿越", () => expect(photoPathIsSafe("photos/../../etc/passwd")).toBe(false));
});
```

- [ ] **Step 2: 实现 photo-store**

```ts
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

export const DATA_DIR = process.env.SETI_DATA_DIR ?? path.join(process.cwd(), "data");

export function photoPathIsSafe(rel: string): boolean {
  const norm = path.normalize(rel);
  return !path.isAbsolute(norm) && !norm.split(path.sep).includes("..") && norm.startsWith("photos");
}

export async function savePhoto(bytes: Buffer, ext: string): Promise<string> {
  const month = new Date().toISOString().slice(0, 7);
  const rel = path.posix.join("photos", month, `${crypto.randomUUID()}.${ext}`);
  const abs = path.join(DATA_DIR, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, bytes);
  return rel.split(path.sep).join("/");
}

export async function readPhoto(rel: string): Promise<Buffer> {
  if (!photoPathIsSafe(rel)) throw new Error("unsafe path");
  return fs.readFile(path.join(DATA_DIR, rel));
}
```

Run: 确认 PASS。

- [ ] **Step 3: 上传/读取 API**

`POST /api/photos`：`requireUser` → `formData()` 取 files（≤3、各 ≤5MB、MIME image/jpeg|png|webp）→ `savePhoto` → 在 Photo 表创建 `checkInId` 悬挂记录（`filePath` 存好）→ 返回 `{ photoIds: number[] }`。`POST /api/checkins`（Task 6）增加 `photoIds` 参数：绑定后置 `hasPhoto=true`。
`GET /api/photos/[id]`：`requireUser` → 查 Photo + 判断文件存在 → `new NextResponse(buffer)`（Content-Type 按扩展名）。图片展示组件用 `<img>`（Next Image 优化管线对私有路由不适用，用 `unoptimized`）。

- [ ] **Step 4: 打卡页接入照片**

Task 6 Step 4 的文件选择逻辑接通此 API：选图即上传拿 photoIds，提交打卡时携带。

- [ ] **Step 5: 测试与提交**

```bash
pnpm test && pnpm build
git add -A && git commit -m "feat: 照片上传/鉴权访问/防路径穿越"
```

---

### Task 8: 今日动态流（核心页）

**Files:**
- Rewrite: `src/app/page.tsx`
- Create: `src/components/checkin-card.tsx`, `src/components/member-status.tsx`, `src/components/countdown-bar.tsx`
- Create: `src/app/api/checkins/[id]/comments/route.ts`（POST）, `src/app/api/checkins/[id]/likes/route.ts`（POST 切换）
- Create: `src/lib/feed.ts`（页面数据聚合）

**Interfaces:**
- Consumes: `computeStreak`（Task 4）、photos API（Task 7）
- Produces: `/` 页面完整功能；`getFeed(date: string): Promise<FeedData>` 供页面的 Server Component 调用

- [ ] **Step 1: feed 聚合**

`src/lib/feed.ts`：一次查询取全部用户 + 指定日期的 CheckIn（含 subject、photos 数、comments、likes）→ 按用户分组 → 每用户产出 `{ user, checkins[], hasCheckedIn }`；未打卡用户排在最后，附带其 streak 与「催一下」可用态（今天是否已被我催过）。

- [ ] **Step 2: 页面骨架**

`page.tsx`（Server Component）：
- `CountdownBar`：读 Setting.exam_date，计算剩余天数；未设置时显示管理员设置提示
- `MemberStatus`：全员头像列表，已打卡绿色角标、未打卡灰色
- 卡片流：`CheckinCard`（头像、科目、时长、note、无凭证标记（无 hasPhoto 时黄色「无凭证」chip）、照片缩略图（点击放大）、点赞（红心切换）、评论列表与输入框）
- 置底灰卡：未打卡成员 + 「催一下」按钮（客户端组件调 `/api/nudge`，Task 9 提供；本任务先做按钮 + disabled 态，接 Task 9）

- [ ] **Step 3: 评论/点赞 API**

`comments`：POST `{ content }`（1-200 字）→ 创建并 `revalidatePath("/")`。
`likes`：POST 切换（存在则删，不存在则建）→ 返回 `{ liked, count }`。

- [ ] **Step 4: 手动验证清单**

`pnpm dev` 后用两个浏览器Profile 分别注册两人，互看动态、点赞、评论。

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: 今日动态流核心页"
```

---

### Task 9: 催学 Nudge + Server酱推送

**Files:**
- Create: `src/lib/serverchan.ts`
- Create: `src/app/api/nudge/route.ts`
- Test: `src/lib/__tests__/serverchan.test.ts`

**Interfaces:**
- Consumes: `requireUser`、`beijingDateStr`（前面任务）
- Produces:
  - `sendServerChan(key: string, title: string, desp?: string): Promise<boolean>` — 失败 console.error 并返回 false，**永不抛出**
  - `POST /api/nudge { toUserId }` → 403 不能催自己；409 今日已催；200 已发送（含对方未配置 SendKey 时仍创建 Nudge 记录但返回提示）

- [ ] **Step 1: 失败测试（不真发请求，mock fetch）**

```ts
import { describe, it, expect, vi } from "vitest";
import { sendServerChan } from "../serverchan";

describe("sendServerChan", () => {
  it("失败不抛异常返回 false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await sendServerChan("SCTxxx", "t")).toBe(false);
    vi.unstubAllGlobals();
  });
  it("成功返回 true", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 0 }) }));
    expect(await sendServerChan("SCTxxx", "t")).toBe(true);
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: serverchan 实现**

```ts
export async function sendServerChan(key: string, title: string, desp = ""): Promise<boolean> {
  try {
    const res = await fetch(`https://sctapi.ftqq.com/${encodeURIComponent(key)}.send`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ title, desp }),
    });
    const json = await res.json().catch(() => ({}));
    return res.ok && (json as { code?: number }).code === 0;
  } catch (e) {
    console.error("[serverchan] push failed:", e);
    return false;
  }
}
```

- [ ] **Step 3: nudge API**

`requireUser` → `toUserId !== me` → `db.nudge.create({ data: { fromUserId: me.id, toUserId, date: beijingDateStr(new Date()) } })`，捕获唯一约束冲突（P2002）返回 409「今天已经催过啦」→ 成功后若对方有 `serverchanKey` 则 `sendServerChan(key, `${me.displayName} 催你学习`, "别摆了，打卡走起👉")`（结果不影响响应）。

- [ ] **Step 4: 动态流接入**

Task 8 的「催一下」按钮接通本 API：成功后按钮变「已催 ✓」。

- [ ] **Step 5: 测试与提交**

```bash
pnpm test && pnpm build
git add -A && git commit -m "feat: 催学 Nudge 幂等与 Server酱推送"
```

---

### Task 10: 个人页（热力图 + 统计）

**Files:**
- Create: `src/app/me/page.tsx`, `src/components/heatmap.tsx`, `src/components/subject-stats.tsx`
- Create: `src/app/api/me/route.ts`（数据）或直接 Server Component 内聚合

**Interfaces:**
- Consumes: `computeStreak`（Task 4）、photos API（Task 7）
- Produces: `/me` 页面：近 26 周热力图（四级色阶：无/无凭证/有凭证1条/有凭证多条——色阶用 tailwind 类映射，遵循 dataviz 无障碍对比度）、当前 streak、累计打卡天数、累计时长、按科目总时长横条

- [ ] **Step 1: 热力图组件**

`heatmap.tsx`：props `{ records: { date: string; count: number; hasAnyPhoto: boolean }[] }`；渲染 7 行 × N 周列的 grid；tooltip 显示「日期 · n 条 · 有/无凭证」；色阶 class 数组 `["bg-neutral-200", "bg-amber-300", "bg-emerald-400", "bg-emerald-600"]`（无→无凭证→少→多）。

- [ ] **Step 2: 个人页聚合**

Server Component：当前用户全部 CheckIn 按 date 聚合 → 热力图数据 + streak + 总天数 + 总分钟 + 按科目 SUM（Prisma `groupBy`）。

- [ ] **Step 3: 科目统计条**

横条列表：科目名 + 总小时 + 相对最长科目的宽度百分比。

- [ ] **Step 4: 手动验证 + 提交**

```bash
git add -A && git commit -m "feat: 个人页热力图与统计"
```

---

### Task 11: 周结算 + cron API

**Files:**
- Create: `src/app/weekly/page.tsx`
- Create: `src/app/api/cron/remind/route.ts`, `src/app/api/cron/weekly/route.ts`, `src/app/api/cron/cleanup/route.ts`
- Test: `src/lib/__tests__/cron-auth.test.ts`

**Interfaces:**
- Consumes: `computeWeekly`, `lastMonday`（Task 4/3）、`sendServerChan`（Task 9）、`getSetting`
- Produces:
  - 三个 cron 端点都要求 `?secret=` 等于 Setting.cron_secret，否则 401
  - `remind`：给今日（北京时间）未打卡且有 serverchanKey 的用户发提醒；也接受 `?force=1` 供管理员手动触发
  - `weekly`：算上周结算并推送周报（标题「上周学习结算」+ 每人一行摘要）
  - `cleanup`：删除悬挂照片（`checkInId` 为 null 且 `createdAt` 超 24h —— schema 已在 Task 2 一次到位，无需二次迁移）

- [ ] **Step 1: 失败测试（鉴权）**

```ts
import { describe, it, expect } from "vitest";
import { cronAuthorized } from "../cron-auth";

describe("cronAuthorized", () => {
  it("密钥匹配 true", () => expect(cronAuthorized("abc", "abc")).toBe(true));
  it("不匹配 false", () => expect(cronAuthorized("abc", "xyz")).toBe(false));
  it("空密钥 false", () => expect(cronAuthorized("", "")).toBe(false));
});
```

`src/lib/cron-auth.ts`:

```ts
export function cronAuthorized(provided: string, expected: string): boolean {
  return expected.length > 0 && provided === expected;
}
```

- [ ] **Step 2: 三个端点实现**

- `remind`：`date = beijingDateStr(new Date())`；已打卡 userId 集合 = `checkIn.findMany({ where: { date } })`；对不在集合且有 key 的用户 `sendServerChan(key, "今天还没打卡", "距离截止还有 2 小时")`；返回 `{ sent: n }`
- `weekly`：`weekStart = lastMonday(new Date())`；查询区间 CheckIn → `computeWeekly` → 每人推送摘要 + 存 `Setting.weekly_report_<weekStart>`（JSON，供页面回看）
- `cleanup`：`photo.deleteMany({ where: { checkIn: null, createdAt: { lt: 24h前 } } })`（Photo.checkIn 需为可空外键 —— schema 调整：`checkInId Int?`，migrate 一次）

- [ ] **Step 3: 周结算页面**

`/weekly`：默认显示最近一个完整周（lastMonday），表格列：成员/打卡天数/总时长/无凭证天数/缺卡天数；缺卡最多者行高亮（amber 背景 + 👑「奶茶候选人」标签）；顶部周选择（往前翻周）。

- [ ] **Step 4: crontab 样例（写入 deploy/，服务器上装）**

```cron
0 21 * * * curl -s "http://localhost:3000/api/cron/remind?secret=REPLACE" >/dev/null
10 0 * * 1 curl -s "http://localhost:3000/api/cron/weekly?secret=REPLACE" >/dev/null
30 3 * * * curl -s "http://localhost:3000/api/cron/cleanup?secret=REPLACE" >/dev/null
```

- [ ] **Step 5: 测试与提交**

```bash
pnpm test && pnpm build
git add -A && git commit -m "feat: 周结算页与提醒/结算/清理 cron 端点"
```

---

### Task 12: 设置页、管理员页与部署交付

**Files:**
- Create: `src/app/settings/page.tsx`, `src/app/admin/page.tsx`
- Create: `src/app/api/subjects/route.ts`（GET/POST/DELETE）, `src/app/api/me/profile/route.ts`（displayName/serverchanKey）, `src/app/api/admin/settings/route.ts`, `src/app/api/admin/reset-password/route.ts`
- Create: `deploy/setup.sh`, `deploy/deploy.sh`, `deploy/rollback.sh`, `deploy/Caddyfile`, `deploy/ecosystem.config.cjs`, `deploy/验收清单.md`

**Interfaces:**
- Consumes: 前面全部任务的库
- Produces: 全部管理功能 + 可复制执行的服务器部署件

- [ ] **Step 1: 个人设置 API + 页面**

`/api/me/profile` PATCH `{ displayName?, serverchanKey? }`（key 留空 = 清除；提供「测试推送」按钮 POST `{ test: true }` 调 sendServerChan 给自己发一条）。
`/api/subjects`：GET 自己的列表；POST `{ name }` 新增；DELETE `/api/subjects/[id]` —— **先查 `checkIn.count({ where: { subjectId } })`，>0 返回 409「该科目有历史打卡，不能删除（可改名）」**；PATCH 改名/排序。
`/settings` 页：昵称、SendKey、测试推送、科目管理（增删改排序，有历史的科目删除按钮禁用并提示）。

- [ ] **Step 2: 管理员 API + 页面**

`/api/admin/settings` PATCH：非 admin 403；可改 exam_date（YYYY-MM-DD 校验）、remind_hour（0-23）、invite_code（重置，展示当前码）。
`/api/admin/reset-password` POST `{ userId }`：生成 8 位随机码返回一次（不在列表存明文），管理员口头转告，成员登录后可自行改密（profile PATCH 加 password 字段，需验证旧密码或为重置态——简化：重置后首次登录强制改密由前端提示实现）。
`/admin` 页：上述功能 + 「立即提醒」按钮（调 `/api/cron/remind?secret=…&force=1`，secret 由服务端注入不暴露）+ 成员列表（用户名/注册时间/是否配置推送）。

- [ ] **Step 3: 部署脚本**

`deploy/setup.sh`（服务器 root 执行一次）：

```bash
#!/usr/bin/env bash
set -euo pipefail
# 1. Node 20（Alibaba Cloud Linux 3，RHEL系）
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs
npm i -g pm2
# 2. 2G swap 兜底（已存在则跳过）
if ! swapon --show | grep -q seti-swap; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile
  swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
# 3. Caddy（官方仓库）
dnf install -y 'dnf-command(copr)' && dnf copr enable -y @caddy/caddy
dnf install -y caddy
# 4. 数据目录
mkdir -p /var/lib/seti/{photos,backups} && chown -R root:root /var/lib/seti
# 5. crontab（备份 + 三个业务 cron；secret 占位由 deploy.sh 首次部署时替换）
crontab -l 2>/dev/null | grep -v seti || true
cat >> /etc/crontab <<'EOF'
0 21 * * * root curl -s "http://127.0.0.1:3000/api/cron/remind?secret=__SECRET__" >/dev/null
10 0 * * 1 root curl -s "http://127.0.0.1:3000/api/cron/weekly?secret=__SECRET__" >/dev/null
30 3 * * * root curl -s "http://127.0.0.1:3000/api/cron/cleanup?secret=__SECRET__" >/dev/null
0 4 * * * root tar czf /var/lib/seti/backups/seti-$(date +\%F).tar.gz /var/lib/seti/photos /var/lib/seti/prisma.db 2>/dev/null && ls -t /var/lib/seti/backups/*.tar.gz | tail -n +8 | xargs -r rm --
EOF
```

`deploy/ecosystem.config.cjs`：

```js
module.exports = { apps: [{
  name: "seti", cwd: "/opt/seti", script: "node_modules/next/dist/bin/next", args: "start -p 3000",
  env: { TZ: "Asia/Shanghai", NODE_ENV: "production",
         DATABASE_URL: "file:/var/lib/seti/prisma.db",
         SETI_DATA_DIR: "/var/lib/seti", SESSION_SECRET: "__SESSION_SECRET__" },
}]};
```

`deploy/Caddyfile`：

```
:8080 {
  reverse_proxy 127.0.0.1:3000
  # 域名备案后切换为：
  # exam.yourdomain.com { reverse_proxy 127.0.0.1:3000 }
}
```

`deploy/deploy.sh`（开发机执行）：本地 `pnpm build` → `rsync/scp` `.next standalone 产物 + package.json + prisma` 到 `/opt/seti` → 服务器 `pnpm i --prod --ignore-scripts`（或 npm）→ 替换 `__SECRET__`/`__SESSION_SECRET__`（读 `.env.production`）→ `pm2 reload`。`rollback.sh`：保留最近 3 个版本目录软链切换。

- [ ] **Step 4: 验收清单文档**

`deploy/验收清单.md`：注册（邀请码）→ 首用户成为管理员 → 打卡（带/不带照片）→ 01:00 模拟（改系统时间或临时把 deadline_hour 测试为当前小时+1 验证锁定）→ 点赞评论 → 催学（第二次 409）→ 热力图 → 周结算 → 测试推送 → 管理员改日期/重置密码 → 手机访问布局。

- [ ] **Step 5: 全量测试与提交**

```bash
pnpm test && pnpm build
git add -A && git commit -m "feat: 设置/管理员功能与部署交付件"
```

---

## 执行后手动验收（最终关卡）

按 `deploy/验收清单.md` 在本地 `pnpm dev` 完整走一遍双用户流程，全部通过后才进入真实服务器部署（届时向用户索要临时 SSH 密码）。
