import "dotenv/config";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

// Prisma 7 requires a driver adapter at runtime (no Rust query engine).
// better-sqlite3 resolves relative paths against process.cwd(), while the
// Prisma 7 CLI resolves a relative DATABASE_URL ("file:./dev.db") against the
// project root (where prisma7.config.ts lives). Resolve to an absolute path
// anchored on this file's location (prisma/ -> project root) so migrations
// and the seed always open the same file regardless of cwd.
const url = process.env["DATABASE_URL"] ?? "file:./dev.db";
const dbFile = url.replace(/^file:/, "");
const projectRoot = path.resolve(import.meta.dirname, "..");
const absoluteUrl = `file:${path.isAbsolute(dbFile) ? dbFile : path.resolve(projectRoot, dbFile)}`;

const adapter = new PrismaBetterSqlite3({ url: absoluteUrl });
const prisma = new PrismaClient({ adapter });

const rand = (n: number) =>
  Array.from({ length: n }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");

async function main() {
  const defaults: Record<string, string> = {
    invite_code: rand(8),
    deadline_hour: "1", // 次日 01:00
    remind_hour: "21",
    cron_secret: rand(24),
    exam_date: "",
  };
  for (const [key, value] of Object.entries(defaults)) {
    const setting = await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
    console.log(`[seed] Setting upserted: key=${setting.key} value=${setting.value}`);
  }
  const total = await prisma.setting.count();
  console.log(`[seed] done, Setting rows in DB: ${total}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("[seed] failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
