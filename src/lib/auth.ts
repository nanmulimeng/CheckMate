import { getIronSession, type IronSession } from "iron-session";
import { cookies } from "next/headers";
import { getPrisma } from "./db";

export interface SessionData {
  userId?: number;
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies(); // Next 15+: cookies() 为异步
  return getIronSession<SessionData>(cookieStore, {
    cookieName: "seti_session",
    password: process.env.SESSION_SECRET!,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      // 2026-09-11 起 https://nanmu.xyz（Caddy 反代）：生产 ecosystem 设
      // SESSION_COOKIE_SECURE=1；本地 dev 不设该变量，HTTP 下照常可用。
      secure: process.env.SESSION_COOKIE_SECURE === "1",
    },
  });
}

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// session 只承载身份（userId），isAdmin 每次查库取新鲜值：登录时快照进
// session 的权限位在库变更后不会自愈（直接改库升降权后旧 session 仍持旧值，
// 走查实证过）。2-5 人小站多一次主键查询无感，换「权限即时生效」。
export async function requireUser(): Promise<{ id: number; isAdmin: boolean }> {
  const s = await getSession();
  if (!s.userId) throw new AuthError(401, "未登录");
  const user = await getPrisma().user.findUnique({
    where: { id: s.userId },
    select: { isAdmin: true },
  });
  // 用户已被删除：session 残留身份，视同未登录
  if (!user) throw new AuthError(401, "未登录");
  return { id: s.userId, isAdmin: user.isAdmin };
}
