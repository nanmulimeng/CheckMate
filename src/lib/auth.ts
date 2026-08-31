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
      secure: process.env.NODE_ENV === "production",
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
