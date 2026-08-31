// 注册业务规则的纯函数（可测）：字段校验、邀请码校验、首用户管理员判定。
// 数据库交互（查重、建号、seed 科目）留在 route 层。

export interface RegistrationError {
  status: number;
  error: string;
}

export const PRESET_SUBJECTS = ["政治", "英语", "数学", "专业课"] as const;

export function validateRegistration(
  username: unknown,
  password: unknown,
  inviteCode: unknown,
  expectedInviteCode: string,
): RegistrationError | null {
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !username ||
    !password ||
    username.length < 2 ||
    password.length < 6
  ) {
    return { status: 400, error: "用户名≥2位，密码≥6位" };
  }
  if (inviteCode !== expectedInviteCode) return { status: 403, error: "邀请码错误" };
  return null;
}

export function nextUserIsAdmin(existingUserCount: number): boolean {
  return existingUserCount === 0;
}
