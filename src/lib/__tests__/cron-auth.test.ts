import { describe, it, expect } from "vitest";
import { cronAuthorized } from "../cron-auth";

describe("cronAuthorized", () => {
  it("密钥匹配 true", () => expect(cronAuthorized("abc", "abc")).toBe(true));
  it("不匹配 false", () => expect(cronAuthorized("abc", "xyz")).toBe(false));
  it("空密钥 false", () => expect(cronAuthorized("", "")).toBe(false));
});
