import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { AuthError, requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { canCheckInFor, defaultCheckInDate } from "@/lib/dates";
import { validateCheckInPayload, validatePhotoIds } from "@/lib/checkin-validate";

// POST /api/checkins — 创建打卡
// body: { subjectId, date?, durationMinutes, note?, photoIds? } → { id }
// date 缺省由服务端用 defaultCheckInDate 决定（凌晨 01:00 前默认记昨天）；
// canCheckInFor 收口全部日期规则：只允许今天/昨天且未过次日 01:00 截止。
export async function POST(req: NextRequest) {
  try {
    const { id: userId } = await requireUser();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown> | null;
    const subjectId = body?.["subjectId"];
    const durationMinutes = body?.["durationMinutes"];
    const note = body?.["note"];
    const rawDate = body?.["date"];
    const rawPhotoIds = body?.["photoIds"];

    if (!validateCheckInPayload({ subjectId, durationMinutes, note }).ok)
      return NextResponse.json({ error: "科目或时长不合法（时长需为 1-960 分钟，备注 ≤500 字）" }, { status: 400 });

    if (rawDate != null && (typeof rawDate !== "string" || !rawDate))
      return NextResponse.json({ error: "日期格式不合法" }, { status: 400 });
    const date = typeof rawDate === "string" && rawDate ? rawDate : defaultCheckInDate(new Date());
    if (!canCheckInFor(date, new Date()))
      return NextResponse.json({ error: "已过截止时间，不可补卡" }, { status: 403 });

    // photoIds 可选：正整数数组、最多 3 张（规则收口在 checkin-validate 纯函数）
    const photoError = validatePhotoIds(rawPhotoIds);
    if (photoError) return NextResponse.json({ error: photoError }, { status: 400 });
    const photoIds = rawPhotoIds == null ? [] : [...new Set(rawPhotoIds as number[])];

    const db = getPrisma();
    const subject = await db.subject.findFirst({ where: { id: subjectId as number, userId } });
    if (!subject)
      return NextResponse.json({ error: "科目不存在或不属于你" }, { status: 403 });

    const checkIn = await db.checkIn.create({
      data: {
        userId,
        subjectId: subjectId as number,
        date,
        durationMinutes: durationMinutes as number,
        note: typeof note === "string" ? note : "",
      },
    });

    // 绑定照片（上传在 Task 7 接通）：只认当前未绑定的照片，
    // 已挂在别的打卡上的照片不会被抢走；hasPhoto 只反映真实绑定结果。
    if (photoIds.length > 0) {
      const attached = await db.photo.updateMany({
        where: { id: { in: photoIds }, checkInId: null },
        data: { checkInId: checkIn.id },
      });
      if (attached.count > 0)
        await db.checkIn.update({ where: { id: checkIn.id }, data: { hasPhoto: true } });
    }

    revalidatePath("/");
    return NextResponse.json({ id: checkIn.id });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/checkins POST]", e);
    return NextResponse.json({ error: "创建打卡失败，请稍后再试" }, { status: 500 });
  }
}
