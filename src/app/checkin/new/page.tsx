import { redirect } from "next/navigation";
import CheckInForm from "@/components/checkin-form";
import { getSession } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { addDays, beijingDateStr, canCheckInFor, defaultCheckInDate } from "@/lib/dates";

// 登录守卫：读取 session 必须走动态渲染
export const dynamic = "force-dynamic";

// 服务端壳：科目与日期选项都在这里算好再传给客户端表单。
// dates.ts 是唯一时区来源 —— 客户端不做任何本地时区推算，
// 只在服务端返回的两个合法日期值（今天/昨天）之间挑选。
export default async function NewCheckInPage() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const subjects = await getPrisma().subject.findMany({
    where: { userId: session.userId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  const now = new Date();
  const today = beijingDateStr(now);
  const defaults = {
    defaultDate: defaultCheckInDate(now),
    today,
    yesterday: addDays(today, -1),
    allowToday: canCheckInFor(today, now),
    allowYesterday: canCheckInFor(addDays(today, -1), now),
  };

  return <CheckInForm subjects={subjects} defaults={defaults} />;
}
