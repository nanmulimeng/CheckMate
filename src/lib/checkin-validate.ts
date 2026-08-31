// 打卡载荷的服务端字段校验（纯函数，可测）。
// 规则收口：日期/截止规则在 dates.ts 的 canCheckInFor，这里只管字段本身。
// 入参是原始 JSON 值（unknown）：非整数 subjectId / 越界时长 / 非字符串超长 note 一律判非法。

export interface CheckInPayloadInput {
  subjectId?: unknown;
  durationMinutes?: unknown;
  note?: unknown;
}

export function validateCheckInPayload(p: CheckInPayloadInput): { ok: boolean } {
  const { subjectId, durationMinutes, note } = p;
  const noteOk = note == null ? true : typeof note === "string" && note.length <= 500;
  const ok =
    Number.isInteger(subjectId) &&
    (subjectId as number) > 0 &&
    Number.isInteger(durationMinutes) &&
    (durationMinutes as number) >= 1 &&
    (durationMinutes as number) <= 960 &&
    noteOk;
  return { ok };
}
