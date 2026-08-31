import { describe, it, expect } from "vitest";
import { validateCheckInPayload } from "../checkin-validate";

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
