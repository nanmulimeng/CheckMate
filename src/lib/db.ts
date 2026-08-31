import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 requires a driver adapter at runtime (no Rust query engine).
// We must resolve the DATABASE_URL the same way the CLI does: a relative
// "file:./dev.db" is anchored at the project root (where prisma7.config.ts
// lives), NOT at process.cwd() as better-sqlite3 would by default. We cannot
// use import.meta.dirname here (like prisma/seed.ts does) because bundlers
// relocate server code into .next/, so we anchor on process.cwd() instead —
// `next dev` / `next start` / PM2 all run with cwd = project root. An
// absolute DATABASE_URL always wins.
const resolveUrl = () => {
  const url = process.env["DATABASE_URL"] ?? "file:./dev.db";
  const dbFile = url.replace(/^file:/, "");
  return `file:${path.isAbsolute(dbFile) ? dbFile : path.resolve(process.cwd(), dbFile)}`;
};

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const getPrisma = (): PrismaClient =>
  globalForPrisma.prisma ??
  (globalForPrisma.prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: resolveUrl() }),
  }));

export type { PrismaClient } from "@/generated/prisma/client";
