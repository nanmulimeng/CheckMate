import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../password";
import { validateRegistration, nextUserIsAdmin } from "../registration";

describe("password", () => {
  it("哈希后可验证且不可逆", async () => {
    const h = await hashPassword("secret123");
    expect(h).not.toBe("secret123");
    expect(await verifyPassword("secret123", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });

  it("同一密码两次哈希结果不同（加盐）", async () => {
    expect(await hashPassword("secret123")).not.toBe(await hashPassword("secret123"));
  });
});

describe("注册校验规则", () => {
  const invite = "ABCD2345";

  it("用户名不足 2 位 → 400", () => {
    expect(validateRegistration("a", "secret123", invite, invite)).toEqual({
      status: 400,
      error: "用户名≥2位，密码≥6位",
    });
  });

  it("密码不足 6 位 → 400", () => {
    expect(validateRegistration("alice", "12345", invite, invite)).toEqual({
      status: 400,
      error: "用户名≥2位，密码≥6位",
    });
  });

  it("缺用户名/密码或非字符串 → 400", () => {
    expect(validateRegistration(undefined, "secret123", invite, invite)?.status).toBe(400);
    expect(validateRegistration("alice", undefined, invite, invite)?.status).toBe(400);
    expect(validateRegistration(12345, "secret123", invite, invite)?.status).toBe(400);
  });

  it("邀请码错误 → 403（格式合法时优先级低于格式校验）", () => {
    expect(validateRegistration("alice", "secret123", "WRONG000", invite)).toEqual({
      status: 403,
      error: "邀请码错误",
    });
    // 格式不合法 + 邀请码也错 → 先报 400
    expect(validateRegistration("a", "secret123", "WRONG000", invite)?.status).toBe(400);
  });

  it("全部合法 → null（放行）", () => {
    expect(validateRegistration("alice", "secret123", invite, invite)).toBeNull();
  });
});

describe("首用户管理员判定", () => {
  it("当前 0 个用户 → 新用户是管理员", () => {
    expect(nextUserIsAdmin(0)).toBe(true);
  });
  it("已有用户 → 新用户不是管理员", () => {
    expect(nextUserIsAdmin(1)).toBe(false);
    expect(nextUserIsAdmin(42)).toBe(false);
  });
});
