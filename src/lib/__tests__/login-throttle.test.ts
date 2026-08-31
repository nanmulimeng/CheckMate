import { describe, it, expect, beforeEach } from "vitest";
import {
  loginLocked,
  recordLoginFail,
  clearLoginFails,
  resetLoginThrottle,
} from "../login-throttle";

beforeEach(() => resetLoginThrottle());

describe("登录失败限速", () => {
  it("阈值前不锁定", () => {
    for (let i = 0; i < 4; i++) recordLoginFail("alice");
    expect(loginLocked("alice")).toBe(false);
  });

  it("连续 5 次失败后锁定", () => {
    for (let i = 0; i < 5; i++) recordLoginFail("alice");
    expect(loginLocked("alice")).toBe(true);
  });

  it("用户名大小写与首尾空格视为同一账户", () => {
    for (let i = 0; i < 5; i++) recordLoginFail("Alice");
    expect(loginLocked("  alice  ")).toBe(true);
  });

  it("锁定不波及其他用户名", () => {
    for (let i = 0; i < 5; i++) recordLoginFail("alice");
    expect(loginLocked("bob")).toBe(false);
  });

  it("成功登录清零计数，重新攒满才锁", () => {
    for (let i = 0; i < 4; i++) recordLoginFail("alice");
    clearLoginFails("alice");
    for (let i = 0; i < 4; i++) recordLoginFail("alice");
    expect(loginLocked("alice")).toBe(false);
  });

  it("锁定期内继续失败仍保持锁定", () => {
    for (let i = 0; i < 5; i++) recordLoginFail("alice");
    recordLoginFail("alice");
    expect(loginLocked("alice")).toBe(true);
  });
});
