// 全站页脚：目前只承载 ICP 备案号（管局要求挂在网站底部、可点击跳工信部）。
// 备案号下来前留空整块隐藏——渲染一个空页脚没有意义还占版面。
const ICP_NUMBER = "鲁ICP备2026053150号"; // 2026-09-11 备案通过

export function SiteFooter() {
  if (!ICP_NUMBER) return null;
  return (
    <footer className="pb-6 pt-2 text-center text-xs text-neutral-400">
      <a
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-neutral-500"
      >
        {ICP_NUMBER}
      </a>
    </footer>
  );
}
