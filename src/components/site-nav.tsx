import Link from "next/link";
import { Button } from "@/components/ui/button";

// 全站共享顶部导航（Server Component）：五个页面（/ /me /weekly /settings /admin）
// 统一使用，放在各自 header 之上。/admin 链接仅管理员可见（isAdmin 来自 session）。
// 「打卡」是全站主操作，固定在最右侧保持醒目。
const LINKS = [
  { href: "/", label: "首页" },
  { href: "/me", label: "我的" },
  { href: "/weekly", label: "周结算" },
  { href: "/settings", label: "设置" },
] as const;

export default function SiteNav({ isAdmin }: { isAdmin?: boolean }) {
  return (
    <nav
      aria-label="全站导航"
      className="flex items-center justify-between gap-2 border-b pb-3"
    >
      <ul className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {l.label}
            </Link>
          </li>
        ))}
        {isAdmin && (
          <li>
            <Link
              href="/admin"
              className="rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              管理
            </Link>
          </li>
        )}
      </ul>
      <Button asChild size="sm" className="shrink-0">
        <Link href="/checkin/new">打卡</Link>
      </Button>
    </nav>
  );
}
