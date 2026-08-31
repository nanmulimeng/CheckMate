import { getIronSession, type IronSession } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  userId?: number;
  isAdmin?: boolean;
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies(); // Next 15+: cookies() 为异步
  return getIronSession<SessionData>(cookieStore, {
    cookieName: "seti_session",
    password: process.env.SESSION_SECRET!,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      // v1 以 HTTP+IP 直连部署（8080，无域名/TLS）：浏览器会在非 localhost 的
      // HTTP 下拒收 Secure cookie，导致生产登录静默失效。等域名+HTTPS 上线后，
      // 在部署环境设 SESSION_COOKIE_SECURE=1 开启。
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

export async function requireUser(): Promise<{ id: number; isAdmin: boolean }> {
  const s = await getSession();
  if (!s.userId) throw new AuthError(401, "未登录");
  return { id: s.userId, isAdmin: !!s.isAdmin };
}
