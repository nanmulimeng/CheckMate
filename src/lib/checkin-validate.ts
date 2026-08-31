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

/** photoIds 校验（纯函数，可测）：可选（null/undefined 通过）；
 * 必须是正整数数组且最多 3 张（规格 §2.2 照片 1-3，与前端 PHOTO_LIMIT 一致）。
 * 通过返回 null，否则返回给前端的 400 错误文案。 */
export function validatePhotoIds(raw: unknown): string | null {
  if (raw == null) return null;
  if (!Array.isArray(raw) || !raw.every((v) => Number.isInteger(v) && (v as number) > 0))
    return "照片参数不合法";
  if (raw.length > 3) return "照片最多 3 张";
  return null;
}
