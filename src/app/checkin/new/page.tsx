import { redirect } from "next/navigation";
import CheckInForm, { type EditTarget } from "@/components/checkin-form";
import { getSession } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { addDays, beijingDateStr, canCheckInFor, defaultCheckInDate, mondayOf } from "@/lib/dates";
import { getDeadlineHour } from "@/lib/settings";

// 登录守卫：读取 session 必须走动态渲染
export const dynamic = "force-dynamic";

// 服务端壳：科目与日期选项都在这里算好再传给客户端表单。
// dates.ts 是唯一时区来源 —— 客户端不做任何本地时区推算，
// 只在服务端返回的两个合法日期值（今天/昨天）之间挑选。
//
// ?id=N 进入编辑模式：预填本人那条打卡（科目/时长/备注），
// 提交改走 PATCH。归属与截止锁都在这里裁决 —— 非本人/不存在/已锁定
// 一律 302 回首页（动态流的编辑入口只对合法目标出现，这里是防直连）。
export default async function NewCheckInPage(props: PageProps<"/checkin/new">) {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const db = getPrisma();
  const [subjects, sp] = await Promise.all([
    db.subject.findMany({
      where: { userId: session.userId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    props.searchParams,
  ]);

  const now = new Date();
  const today = beijingDateStr(now);
  const deadlineHour = await getDeadlineHour();
  const defaults = {
    defaultDate: defaultCheckInDate(now, deadlineHour),
    today,
    yesterday: addDays(today, -1),
    allowToday: canCheckInFor(today, now, deadlineHour),
    allowYesterday: canCheckInFor(addDays(today, -1), now, deadlineHour),
  };

  // ?subject=N 预选科目（首页「再来一条」跳转；合法性在表单里再验一次）
  const rawSubject = typeof sp.subject === "string" ? Number(sp.subject) : NaN;
  const preselectSubjectId =
    Number.isInteger(rawSubject) && rawSubject > 0 ? rawSubject : undefined;

  let edit: EditTarget | null = null;
  // 编辑模式的预填周锚：卡归属日所在周（与 PATCH 提交的 upsert 同锚），
  // 而不是页面默认归属日——周一凌晨编辑「今天」的卡时两者差一周
  let editNoteWeek: string | null = null;
  const rawId = typeof sp.id === "string" ? sp.id : "";
  if (rawId !== "") {
    const id = Number(rawId);
    if (Number.isInteger(id) && id > 0) {
      const target = await db.checkIn.findUnique({
        where: { id },
        select: { userId: true, subjectId: true, durationMinutes: true, note: true, date: true },
      });
      // 非本人/不存在/已锁定 → 回首页（不打错误页，别把人拦在流程里）
      if (target && target.userId === session.userId && canCheckInFor(target.date, now, deadlineHour)) {
        edit = {
          id,
          subjectId: target.subjectId,
          durationMinutes: target.durationMinutes,
          note: target.note,
        };
        editNoteWeek = mondayOf(target.date);
      } else {
        redirect("/");
      }
    } else {
      redirect("/");
    }
  }

  // 本周一句话预填（编辑=卡归属周；创建=默认归属日所在周。「后写覆盖」的编辑入口）
  const existingNote = await db.weeklyNote.findUnique({
    where: {
      userId_weekStart: {
        userId: session.userId,
        weekStart: editNoteWeek ?? mondayOf(defaults.defaultDate),
      },
    },
    select: { content: true },
  });

  return (
    <CheckInForm
      subjects={subjects}
      defaults={defaults}
      initialWeeklyNote={existingNote?.content ?? ""}
      weeklyNoteWeek={mondayOf(defaults.defaultDate)}
      preselectSubjectId={preselectSubjectId}
      edit={edit}
    />
  );
}
