import { describe, it, expect } from "vitest";
import { photoPathIsSafe } from "../photo-store";

describe("photoPathIsSafe（防路径穿越）", () => {
  it("正常相对路径", () => expect(photoPathIsSafe("photos/2026-08/a.png")).toBe(true));
  it("拒绝绝对路径", () => expect(photoPathIsSafe("/etc/passwd")).toBe(false));
  it("拒绝 .. 穿越", () => expect(photoPathIsSafe("photos/../../etc/passwd")).toBe(false));
  it("拒绝同前缀目录（startsWith 绕过）", () => {
    expect(photoPathIsSafe("photos-evil/x.png")).toBe(false);
    expect(photoPathIsSafe("photosx/y.png")).toBe(false);
    expect(photoPathIsSafe("photographs/z.png")).toBe(false);
  });
  it("裸目录名 photos 之外的首段一律拒绝", () => {
    expect(photoPathIsSafe("data/photos/a.png")).toBe(false);
    expect(photoPathIsSafe("a.png")).toBe(false);
  });
});
