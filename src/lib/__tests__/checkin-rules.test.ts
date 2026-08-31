import { describe, it, expect } from "vitest";
import { validateCheckInPayload, validatePhotoIds } from "../checkin-validate";

describe("validateCheckInPayload", () => {
  it("合法", () => {
    expect(validateCheckInPayload({ subjectId: 1, durationMinutes: 60, note: "线代第二章" }).ok).toBe(true);
  });
  it("时长必须 1-960 分钟", () => {
    expect(validateCheckInPayload({ subjectId: 1, durationMinutes: 0, note: "" }).ok).toBe(false);
    expect(validateCheckInPayload({ subjectId: 1, durationMinutes: 1000, note: "" }).ok).toBe(false);
  });
  it("note 上限 500 字", () => {
    expect(validateCheckInPayload({ subjectId: 1, durationMinutes: 60, note: "x".repeat(501) }).ok).toBe(false);
  });
});

describe("validatePhotoIds", () => {
  it("照片最多 3 张：第 4 张起拒绝，恰好 3 张放行", () => {
    expect(validatePhotoIds([101, 102, 103, 104])).toBe("照片最多 3 张");
    expect(validatePhotoIds([1, 1, 1, 1])).toBe("照片最多 3 张"); // 按原始数量卡，不看待去重后
    expect(validatePhotoIds([101, 102, 103])).toBeNull();
    expect(validatePhotoIds(undefined)).toBeNull(); // 可选字段
  });
  it("形状非法：非数组 / 非正整数", () => {
    expect(validatePhotoIds("nope")).toBe("照片参数不合法");
    expect(validatePhotoIds([1, 0, 3])).toBe("照片参数不合法");
    expect(validatePhotoIds([1, 2.5])).toBe("照片参数不合法");
  });
});
