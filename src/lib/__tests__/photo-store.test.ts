import { describe, it, expect } from "vitest";
import { photoPathIsSafe } from "../photo-store";

describe("photoPathIsSafe（防路径穿越）", () => {
  it("正常相对路径", () => expect(photoPathIsSafe("photos/2026-08/a.png")).toBe(true));
  it("拒绝绝对路径", () => expect(photoPathIsSafe("/etc/passwd")).toBe(false));
  it("拒绝 .. 穿越", () => expect(photoPathIsSafe("photos/../../etc/passwd")).toBe(false));
});
