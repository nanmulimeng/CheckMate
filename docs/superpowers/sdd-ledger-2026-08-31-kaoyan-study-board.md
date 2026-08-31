# SDD ledger — plan: docs/superpowers/plans/2026-08-31-kaoyan-study-board.md

## Preflight scan (2026-08-31)

| 任务对 | 检查内容 | 结论 |
|--------|---------|------|
| T2 ↔ T7 | Photo.checkInId 可空 + createdAt；T7 悬挂照片依赖 | 一致（计划已含） |
| T3 ↔ T4/T6/T9/T11 | dates.ts 签名：beijingDateStr/canCheckInFor/defaultCheckInDate/lastMonday/addDays/dateRange | 一致 |
| T5 ↔ T6-T12 | requireUser() → {id, isAdmin} | 一致 |
| T6 ↔ T7 | T6 POST 支持 photoIds 绑定（API 层），前端照片选择 T7 Step 4 接通 | 渐进式设计，非冲突 |
| T8 ↔ T9 | 催学按钮 T8 占位 disabled，T9 Step 4 接通 | 计划明示 |
| T11 ↔ T2 | weekly_report_<weekStart> 存 Setting key-value | 无 schema 冲突 |
| T12 ↔ spec | 科目有历史禁删 / 管理员重置密码 | 与 spec 一致 |
| T3 内部 | 测试用 UTC 17:00 ≡ 北京次日 01:00（无夏令时恒成立） | 自洽 |
| T4 内部 | 测试期望与 computeWeekly 聚合逻辑 | 自洽 |

Rulings: 无需裁决的冲突。两个 dispatch 级实现提示（非计划缺陷）：
1. T1 脚手架在含 docs/ 的非空目录执行 create-next-app，需绕过交互/清空检查。
2. T6 实现 API 层 photoIds 绑定逻辑；真实上传源由 T7 提供。

## Task log
Task 1: dispatched (BASE ce1accc)
Task 1: DONE_WITH_CONCERNS (commit 5cc0950). Rulings:
  R1: Accept Next.js 16.3.3 (create-next-app@latest; spec said 15) - current stable, same App Router/React 19 model. Cost if wrong: minor API diffs per-task.
  R2: Accept Prisma 7.10.0 - datasource URL in prisma7.config.ts, new prisma-client generator outputs to src/generated/prisma. Task 2 schema uses Prisma 7 conventions; Task 5 db.ts imports from src/generated/prisma NOT @prisma/client.
  R3: prisma pinned 7.10.0 (npm 8.0.0-rc uninstallable). Use pnpm exec prisma.
  R4: prisma-init vendored ~200 agent-skill files (.claude/.agents/.windsurf/skills + skills-lock.json) pollute repo AND live session skill list. Ruling: strip in Task 2 dispatch. Regenerable, cost none.
  R5: Accept 2 minor deviations (type:module + import.meta.dirname in vitest.config.ts; default @/* alias).
Task 1: WARNINGS resolved: commits on seti-impl confirmed; Node v22.14 >= 20 confirmed
Task 1: minor (deferred): default scaffold page/README not trimmed (later tasks replace); commit subject says Next 15 but actual 16 (body documents truth); vitest import.meta.dirname deviation documented
Task 1: complete (commits ce1accc..3a6e8cf, review clean)
Task 2: dispatched (BASE 3a6e8cf)
Task 2: DONE_WITH_CONCERNS (commit 1c4829d). Rulings:
  R6: Prisma 7 requires driver adapter at PrismaClient instantiation. Standard pattern = @prisma/adapter-better-sqlite3 (see prisma/seed.ts). Task 5 db.ts MUST reuse this pattern (keep planned filename src/lib/db.ts). Cost if wrong: runtime client construction errors.
  R7: Prisma 7 CLI anchors file:./dev.db at PROJECT ROOT -> db lives at <root>/dev.db not prisma/dev.db. Task 12 backup script and DATABASE_URL must target <root>/dev.db. Cost if wrong: backup misses the db.
  R8: migrate dev does NOT auto-run generate in this setup - explicit pnpm exec prisma generate after schema changes.
Task 2: WARNINGS resolved: driver-adapter pattern ratified as canonical (R6); db-at-root ratified (R7)
Task 2: minor (deferred): seed logs cron_secret/invite_code plaintext (mask before server deploy, Task 12); Math.random weak PRNG for secrets (plan-mandated verbatim, consider crypto.randomInt); report prose on CLI anchoring self-inconsistent - downstream re-check before relying; better-sqlite3 dual-version via allowBuilds
Task 2: complete (commits 3a6e8cf..1c4829d, review clean)
Task 3: dispatched (BASE 1c4829d)
Task 3: DONE_WITH_CONCERNS (commit 8a96aa0).
  R9: PLAN DEFECT - brief's test fixtures had 3 UTC->Beijing rollover errors (e.g. 16:59Z is Beijing NEXT-DAY 00:59, not same-day 23:59). Implementer corrected the 3 input timestamps so each test exercises its stated scenario; expectations and implementation untouched, adaptation disclosed. Ruling: valid fix. Reviewer must verify corrected fixtures' timezone math independently. Cost if wrong: dates.ts passes tests that do not test the claimed scenarios.
Task 3: WARNINGS resolved: fixture corrections verified by reviewer hand-recomputation; full-suite claims trusted per implementer evidence (13/13)
Task 3: minor (deferred, brief-inherited): hour12:false h24 portability note (fine on Node 22); beijingHour not directly asserted (lint warning); canCheckInFor older-than-yesterday branch untested; dateRange start>end untested - hardening pass later
Task 3: complete (commits 1c4829d..8a96aa0, review clean)
Task 4: dispatched (BASE 8a96aa0)
Task 4: DONE (commit fc46a7c, zero deviations, 21/21). Informational for downstream: streak deadline-awareness is caller-side (Task 8 feed); computeWeekly omits users with no in-window rows - Task 11 weekly page must roster-complete members with missedDays=7
Task 4: WARNINGS resolved: dates.ts exports verified in Task 3 review; RED/GREEN evidence coherent (21/21)
Task 4: minor (deferred, brief-inherited): streak yesterday-fallback is unconditional (post-deadline display nuance - page layer decides); any-row-no-photo day semantics; totalMinutes sums all rows while days dedupe (intended); window boundary tests one-sided; module-level RED only
Task 4: complete (commits 8a96aa0..fc46a7c, review clean)
Task 5: dispatched (BASE fc46a7c)
Task 5: DONE_WITH_CONCERNS (commits fea671b, d908891; 30/30; smoke: 403/400/409/401/200+cookie+307 guard, isAdmin, presets). Rulings:
  R10: SESSION_SECRET must be >=32 chars (iron-session requirement; Task 1 default was 25 -> 500s). Fixed locally in gitignored .env. Task 12 deploy MUST generate >=32-char production secret. Cost if wrong: every auth call 500s in production.
  R11: Accept deviations: src/lib/registration.ts added (pure testable registration rules); register auto-logs-in (else / guard bounces push); iron-session v8 type IronSession<SessionData> replaces IronSessionData (same exported names). shadcn init OK (baseColor neutral).
Task 5: WARNINGS resolved: test/build claims trusted (30/30 evidence in report); generated client shape is Task 2 artifact; iron-session surface covered by R11
Task 5: minor (deferred): empty invite_code passes on unseeded DB (first requester becomes admin) - pairs with db.ts silent file:./dev.db default; hand BOTH to Task 12 deploy hardening. Login timing oracle (register 409 enumerates anyway). getSetting before format validation. shadcn CLI in runtime deps. layout lang=en
Task 5: complete (commits fc46a7c..d908891, review clean)
Task 6: dispatched (BASE d908891)
Task 6: DONE (commit 416b647; 33/33; smoke 200/400/401/403 incl locked-date 403 via SQL-stale-row, photo no-steal). Rulings:
  R12: Photo has no userId (schema per plan) - orphan photo ownership unverifiable at attach; accepted risk R12: photos are circle-visible anyway (spec: any member can view any photo), so mis-attachment leaks nothing; 2-5 trusted friends. Final review may revisit.
  R13: Accept deviations: defaults via server-page props (not separate defaults route); hasPhoto derived from actual attached count (more truthful than plan's literal).
  Watch for Task 7: getPhotoIds() returns [] until POST /api/photos lands (by design this task)
Task 6: WARNINGS resolved: evidence internally consistent; ui/ files are vendored shadcn boilerplate
Task 6: minor (deferred): create->attach->hasPhoto not transactional (Task 7 rewires flow anyway); date format not regex-validated (fails closed with misleading 403); revokeObjectURL inside state updater; /api/subjects route dead until settings page (page queries directly); note never trimmed; compression floor 0.3 means >300KB possible on pathological images
Task 6: complete (commits d908891..416b647, review clean)
Task 7: dispatched (BASE 416b647)
Task 7: DONE (commit 60323e4; 36/36; 13 smoke checks incl auth-gate/no-steal/gitignore). Minor notes: client-declared MIME trusted (whitelist-bounded); photoPathIsSafe startsWith is string-prefix not segment (brief-verbatim, not exploitable - savePhoto is sole path generator); Turbopack dev panics in sandbox so smoke ran build+start
Task 7: complete (commits 416b647..60323e4, review clean - Approved, spec compliant)
Task 7: minor (from review, deferred): multipart body buffered in memory before size check (inherent to formData); photoPathIsSafe string-prefix vs segment match (deferred hardening); savePhoto-succeeds-but-create-fails leaves orphan FILE not row - Task 11 cleanup cron is DB-driven, cannot reap - carry pointer to Task 11; getPhotoIds returns completion-order not pick-order (report inaccuracy, harmless); cancelledRef unbounded growth + double-click retry duplicate upload edge
Task 8: dispatched (BASE 60323e4, agent a0c69b9bebbf5d311)
Task 8: DONE (commit d2289f1; 44/44; smoke: feed/like toggle/comment 200-400-401-404/nudge 404-graceful+已催过/countdown 110 days). Deviations: getFeed(date, viewerId) for likedByMe+nudge state; nudge-button.tsx client comp added; countdown math in feed.ts; header 记一笔 link
Task 8: complete (commits 60323e4..d2289f1, review clean - Approved)
Task 8: minor (from review, deferred): exam_date "2026-99-99" shape-valid but Date.parse NaN -> renders 考研日已到 (normalize NaN to null in buildFeed; admin page date-input mitigates); likes find-then-delete non-transactional (concurrent tab edge, in-flight disable covers); content.length UTF-16 units (100 astral chars - safe direction); parseId duplicated + Number() accepts 1e2/0x10; lightbox no Esc/scroll-lock
Task 9: dispatched (BASE d2289f1, agent a1a94830a1d864049)
Task 9: DONE (commit f1411a6; 46/46; smoke: 200->409->403->404->400->401, push-failure still 200, Nudge date=beijingDateStr verified in DB, dev.db restored). Minor: toUserId<=0 returns 400 (tightening beyond brief, follows parseId convention)
Task 9: complete (commits d2289f1..f1411a6, review clean - Approved)
Task 9: minor (from review, deferred): unstubAllGlobals inline not afterEach (brief-verbatim, 2 tests only); Int32-overflow ids 500 not 400 (same idiom as checkins); report line-count cosmetic mismatch
Task 10: dispatched (BASE f1411a6, agent a21ee1f6c2287ab45)
Task 10: DONE (commit 4ebdac8; 58/58; smoke: cell classes/tooltips/tiles/bars/trimming/empty-state/auth-redirect verified in HTML+screenshot). Concerns: no / -> /me nav link yet (cross-page nav gap - handle at Task 12 when all pages exist); touched dates.ts extracting mondayOf (lastMonday re-expressed, behavior-identical claim - reviewer must verify); light-only classes brief-verbatim
Task 10: complete (commits f1411a6..4ebdac8, review clean - Approved; mondayOf refactor algebraically verified behavior-identical)
Task 10: minor (from review, deferred): future records in window would fill a level (unreachable via canCheckInFor); widthPct unrounded float in style; hardcoded 近 26 周 aria-label duplicates HEATMAP_WEEKS const; report test-count arithmetic inconsistent (52+12 vs 58 total - new-12 correct, baseline wrong)
Task 11: dispatched (BASE 4ebdac8, agent a416ef28a5c7f746d). Rulings carried: R14 remind copy 4 hours not 2 (brief typo); R15 no migration needed (checkInId nullable since Task 2); R16 weekly page computes live from rows, stored Setting is push history only; R17 cleanup leaves code comment re DB-invisible orphan files (Task 12 owns)
Task 11: DONE (commit 591a250; 61/61; smoke: 401x3 wrong-secret, 200x3 right-secret, weekly_report_2026-08-24 Setting row written, roster-completed 0/0/0/7 users, amber-crown on tied rows, invalid ?week 307-fallback; dev.db restored). Concerns: no nav to /weekly yet (Task 12 owns nav); sent counts successful pushes only; harness .playwright-mcp/ untracked dir present
Task 11: complete (commits 4ebdac8..591a250, review clean - Approved)
Task 11: minor (from review, deferred to Task 12 where applicable): cleanup deletes rows but never unlinks filePath (tracked-dangling -> permanent disk orphan; fix alongside Task 12 orphan hardening); O(n^2) find in weekly push loop; remind key filter in JS not where-clause; weekly pushes before setSetting (crash mid-loop = re-push on retry)
Task 12: dispatched (BASE 591a250, agent a1f5cd825e3d4f710). Rulings carried: R18 site-nav all pages + admin-conditional link (replaces ad-hoc 记一笔, keeps prominent 打卡 CTA); R19 cleanup unlinks files pre-deleteMany via photo-store deletePhoto helper; R20 seed crypto secrets + masked log; R21 db.ts prod DATABASE_URL fail-loud; R22 registration empty-invite-code 503 fail-closed; R23 layout zh-CN; R24 profile PATCH incl password w/ oldPassword verify + test push; R25 subjects CRUD + 409 has-history; R26 admin settings GET/PATCH w/ exam_date regex; R27 reset-password one-time temp code; R28 admin page + server-injected cron secret for 立即提醒; R29 settings page; R30 output standalone; R31 setup.sh + build toolchain + pnpm via corepack + swap-grep fix + firewalld 8080; R32 ecosystem verbatim; R33 Caddyfile verbatim; R34 deploy.sh full chain (tarball, pnpm install --prod no ignore-scripts, migrate deploy + seed, current symlink, secret substitution, openssl SESSION_SECRET); R35 rollback 3-keep; R36 验收清单 expanded
Task 12: re-dispatched (BASE 591a250, original agent a1f5cd825e3d4f710 killed by API 429 rate limit before any code was written; tree verified clean at 591a250)
Task 12: DONE (commit 08813ad; 32 files +1730/-48; 62/62; build 27 routes; bash -n deploy scripts; prod-mode smoke: admin settings 200/400/403 + 2026-02-30 rejected, reset-password temp code logs in, subjects 201/409/404/history-409, profile wrong-old 403, cleanup deleted:1/unlinked:1, nav on 5 pages, non-admin 307). Concerns: deploy.sh deviates w/ documented reasons (full-install+prune, static bundled, migrate every deploy, ecosystem cwd sed); scripts not run on real Linux (finishing-stage); test-push used fake key (in-contract sent:false)
Task 12: review verdict NEEDS FIXES (2 Important, both deploy.sh-only): (1) first-deploy seed dies module-not-found - src/generated/prisma/client neither in tarball nor generated server-side, no postinstall, migrate deploy does not generate -> add pnpm exec prisma generate before seed; (2) .release-stage/ and .release-$TS.tar.gz cleaned only on success line, no trap EXIT, not gitignored -> failed deploy + git add -A commits tarball. 6 Minor (unlinked-name, stale hasHistory, missing length caps, SESSION_SECRET sed asymmetry, unpinned corepack pnpm, stale comment + normalizeSubjectName dup + ssh_cmd bypass)
Task 12: fix round 1 dispatched (resume implementer)
Task 12: fix round 1 verified (commit 3140823; both Important FIXED - prisma generate placed install->generate->migrate->seed, trap EXIT + gitignore root-anchored; side items present; no regression; re-review APPROVED)
Task 12: complete (commits 591a250..3140823 after fix loop)
ALL 12 TASKS COMPLETE - proceeding to final whole-branch review
Final review: dispatched (opus, whole branch ce1accc..3140823, 639KB diff, 3-pass plan, 13 deferred-minors triage list included)
Final review: WITH FIXES. C1 secure-cookie x HTTP deployment breaks login (auth.ts NODE_ENV gate; fix=SESSION_COOKIE_SECURE env gate + acceptance-checklist IP login row). I2 remind_hour dead setting (wire hourly cron + route-side beijingHour check). I3 deploy.sh ships local data/ photos in tarball (rm -rf STAGE/data). I4 PM2 next-start vs standalone unsupported (script server.js + PORT/HOSTNAME). I5 no route-level tests vs spec 5 promise (adjudicated: POST-MERGE, disclosed to user; manual checklist compensates pre-launch). M6 photoIds unbounded at bind (1-line 400). Deferred triage: 13 items adjudicated ACCEPT/POST-LAUNCH per review table
Final fix dispatch: C1+I2+I3+I4+M6+checklist row, resumed Task-12 implementer
Final fix verified (commit 4ec3b6e; all six FIXED, re-review APPROVED; force=1 hour-gate bypass documented discretion; [1,1,1,1] raw-count-before-dedupe deliberate)
FINAL REVIEW CLEAN - plan complete, workspace archived then removed
