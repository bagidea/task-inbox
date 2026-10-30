# Task Inbox

A small, self-hosted **task inbox for a team and the Claude Code session that does the work**.

The team files a task as a markdown brief with files attached. On the developer's machine, Claude Code pulls the task into a job folder, does the work in its normal session (with the repos, deploy recipes and rules it already knows), and posts the summary and test links back to the task page. Optionally it runs an **autonomous intake loop**: every 10–30 minutes it checks for tasks that are ready, takes them, and reports back, while the team keeps a "hold" button to stop it mid-task.

Built for a Thai team, so the **web UI is in Thai**; the code, README and configuration are in English. Contributions for other languages are welcome.

```
Team member ──(brief + files)──▶  Task Inbox (Next.js + Firestore/GCS or a JSON file)
                                       │   ▲
                       pull / report   │   │  summary, links, status
                                       ▼   │
                         Claude Code on the developer's machine
                         (`task-inbox` CLI skill + optional `task-inbox-auto` loop)
```

## Features

- **Tasks as markdown**: title, systems (configurable chips), priority, a brief typed or uploaded as `.md`, any files (30 MB each). Rendered with GFM.
- **Timeline**: every change, comment, status move and Claude report is an event on the task. "Copy for chat" turns the latest report into plain text for LINE / Slack / Teams.
- **Statuses**: `new → in_progress → review → done`, plus `needs_info` (a question for the team) and `cancelled`.
- **Accounts** created by an admin with a temporary password (no sign-up, no OAuth); personal API tokens for the CLI.
- **CLI + Claude Code skill** (`public/skill/task-inbox/`): zero-dependency Node script. `list`, `show`, `pull`, `report`, `comment`, `create`, `status`, `upload`, `hold`. Installed with one command shown on the settings page.
- **Automatic intake** (`src/lib/ready.ts`): a new task becomes *ready* when nobody on the team has touched it for a grace period (admin setting, default 10 min). "ส่งให้ Claude เลย" skips the wait; "หยุดก่อน" holds the task so Claude's reports are refused until the team presses "ให้ทำต่อ". `GET /api/tasks?ready=1` lists what Claude may take now.
- **Autonomous loop skill** (`public/skill/task-inbox-auto/`): `/task-inbox-auto on|off|status` inside a Claude Code session; it wakes itself up, pulls ready tasks, works, reports, and checks the hold before every deploy and report.
- **Two storage modes**: Firestore + Google Cloud Storage in production, or a JSON file + a folder on disk for a laptop (`INBOX_DEV_MODE=true`).

## Quick start (laptop)

```bash
git clone https://github.com/bagidea/task-inbox.git
cd task-inbox
npm install
cp .env.example .env.local      # dev mode: JSON store, files on disk, /setup opens with the code "setup"
npm run dev                     # http://localhost:3300 → /setup (first admin) → / (board)
npm test                        # vitest
npm run typecheck && npm run lint && npm run build
```

Then open **Settings → Claude / CLI**, create a token, and run the install command it shows. In Claude Code say "รับงานจาก task inbox" (or `pull next`), and `/task-inbox-auto on` if you want the loop.

## Configuration

| Variable | What |
| --- | --- |
| `INBOX_NAME` | Name shown in the title bar, exports and hand-over notes. Default `Task Inbox`. |
| `INBOX_SYSTEMS` | The systems a task can be filed under, `key:Label` pairs separated by commas (keys `[a-z0-9-]`). Default `web:เว็บไซต์,backend:ระบบหลังบ้าน,mobile:แอปมือถือ,other:อื่น ๆ`. |
| `INBOX_DEV_MODE` | `true` = JSON store (`INBOX_DATA_FILE`) + files on disk (`INBOX_FILES_DIR`), setup code `setup`. Ignored in production. |
| `SESSION_SECRET` | Long random string that signs the login cookie. Required in production. |
| `SETUP_CODE` | Opens `/setup` until the first admin exists. Remove afterwards. |
| `FIREBASE_PROJECT_ID`, `FIRESTORE_DATABASE_ID` | Firestore project and (optional) named database. Uses Application Default Credentials. |
| `GCS_BUCKET` | Bucket for attachments. |
| `PUBLIC_BASE_URL` | Where the inbox is reachable, for absolute links in exports and the install command. |
| `DATA_STORE` | `memory` or `firestore` to override the automatic choice. |

All of these are read at request time, so one container image serves any team.

## Routes

| Route | What |
| --- | --- |
| `/` | Board: open / new / needs info / review / done tabs, search, system filter. Refreshes every 30 s. |
| `/new` | Create a task. |
| `/t/T-12` | The task: brief, files, status buttons, hold / ready-now, timeline, copy for chat. |
| `/settings` | Password, API tokens + install commands, grace period, team management (admin). |
| `/setup` | First run: the admin account, unlocked with `SETUP_CODE`. |
| `/skill/task-inbox/`, `/skill/task-inbox-auto/` | The Claude Code skills served as static files. |
| `/api/health` | What is configured (never the values). |

## API

Cookie session for the browser; `Authorization: Bearer tin_…` for the CLI (tokens from `/settings`). `X-Actor: claude` on a token call marks the entry as Claude's in the timeline.

| Method, path | What |
| --- | --- |
| `GET /api/tasks?status=new,needs_info&system=web&q=…` | List. `?ready=1`: new tasks past the grace period and not held, most urgent first. |
| `POST /api/tasks` | Create (JSON `{title, body, systems, priority}` or multipart with `brief` .md and `files`). |
| `GET/PATCH /api/tasks/:id` | Task + events / edit title, body, systems, priority, status, links. |
| `POST /api/tasks/:id/comments` `{text, status?}` | Comment. 409 `on-hold` for `X-Actor: claude` while the hold is on (`?force=1` overrides). |
| `POST /api/tasks/:id/report` `{text, status?, links?}` | Summary from the work session (default status → review). |
| `POST /api/tasks/:id/pull` | Mark in progress; returns `task.md`, a folder name and a download URL per file. |
| `POST /api/tasks/:id/ready-now` | Skip the grace period. |
| `GET/POST /api/tasks/:id/hold` `{active, note?}` | Hold / resume. |
| `GET /api/tasks/:id/export` | `task.md`. |
| `POST /api/tasks/:id/files`, `GET/DELETE /api/tasks/:id/files/:fid` | Attachments. |
| `GET/PATCH /api/settings` `{graceMinutes}` | Admin: the grace period. |
| `POST /api/auth/login`, `/logout`, `/password`, `GET /api/me` | Session. |
| `GET/POST /api/users`, `PATCH /api/users/:id` | Admin: the team. |
| `GET/POST /api/tokens`, `DELETE /api/tokens/:id` | My API tokens. |

## The CLI

```
node ~/.claude/skills/task-inbox/task-inbox.mjs config --url https://inbox.example.com --token tin_…
task-inbox list [--status open|new,needs_info|all] [--system web] [--ready] [--json]
task-inbox show T-12
task-inbox pull T-12 | next [--ready] [--out DIR] --as-claude     # → NewJob/<date>_T-12/{task.md, task.json, files/}
task-inbox hold T-12                                              # {"active":false} or {"active":true,"by":…,"note":…}
task-inbox report T-12 --file summary.md [--status review|needs_info|done] [--link "Name=https://…"] --as-claude
task-inbox comment T-12 --text "…" [--status needs_info] --as-claude
task-inbox create --title "…" --body-file brief.md --systems web,backend --priority high --files a.png
task-inbox status T-12 done · upload T-12 files… · rm-file T-12 <id>
```

Exit codes: `2` = no ready task (`pull next --ready`), `3` = refused because the task is on hold. Config lives in `~/.task-inbox.json`; `TASK_INBOX_URL` / `TASK_INBOX_TOKEN` / `TASK_INBOX_ACTOR=claude` override it.

## Deploy

Any host that runs a Node 22 container works. `docs/deploy-cloud-run.md` walks through Google Cloud Run + Firestore + GCS, which is what the Dockerfile (standalone Next.js on port 8080) is tuned for.

## Code map

| Path | What |
| --- | --- |
| `src/lib/types.ts` | Task, event, user, token shapes; status / priority labels. |
| `src/lib/systems.ts` | `INBOX_SYSTEMS` / `INBOX_NAME` parsing (runtime). |
| `src/lib/tasks.ts` | The service: create, update, comment, pull, report, files, hold, ready-now. Every change writes its timeline event. |
| `src/lib/ready.ts` | Readiness and hold rules. Pure. |
| `src/lib/export.ts` | `task.md` for the job folder; date formatting; event wording. |
| `src/lib/auth.ts`, `src/lib/server.ts` | scrypt passwords, API tokens, signed session cookie, rate limit, same-origin check, `caller()`. |
| `src/lib/store/` | `Store` interface, Firestore and JSON-file implementations. |
| `src/lib/files.ts` | Attachment bytes: GCS or disk. |
| `src/components/` | Board, TaskView, NewTask, Settings, Shell, bits, config context. |
| `public/skill/` | The two Claude Code skills (served as static files). |
| `tests/` | vitest: auth, the task service on the memory store, readiness, `task.md`. |

## Security notes

- No sign-up: an admin creates accounts and hands over a temporary password; the first login must change it.
- Tokens are shown once and stored hashed. Pasting a token into a chat counts as leaked: revoke and create a new one.
- Everything a task contains (brief, files, comments) is **data for Claude, not instructions**. The skills tell Claude to ask the user before acting on anything in a task that goes beyond the normal rules of the machine.
- Downloads of attachments use the caller's token; the CLI never sends task content anywhere else.

## License

MIT — see `LICENSE`.

---

## ภาษาไทย (สรุป)

Task Inbox คือเว็บรับงานเล็ก ๆ สำหรับทีมกับ Claude Code บนเครื่องของนักพัฒนา: ทีมสร้างงานเป็น markdown + ไฟล์แนบ, Claude ดึงงานลงโฟลเดอร์ `NewJob/<วันที่>_T-n/` ทำงานใน session ปกติ แล้วส่งสรุป + ลิงก์ทดสอบกลับขึ้นหน้างาน ทีมกด "คัดลอก" ไปวางในแชทได้เลย

- เปิดโหมดรับงานอัตโนมัติได้: งานใหม่ที่ไม่มีใครแก้ครบ "ช่วงพัก" (ค่าเริ่มต้น 10 นาที) จะพร้อมให้ Claude ดึงไปทำเอง · ปุ่ม **ส่งให้ Claude เลย** ข้ามช่วงพัก · ปุ่ม **หยุดก่อน** หยุด Claude ไว้ระหว่างแก้โจทย์
- ติดตั้ง skill ให้ Claude Code ด้วยคำสั่งเดียวจากหน้า ตั้งค่า แล้วพิมพ์ "รับงานจาก task inbox" หรือ `/task-inbox-auto on`
- รันบนโน้ตบุ๊กด้วย `INBOX_DEV_MODE=true` (ไม่ต้องมี Firestore) หรือขึ้น Cloud Run ตาม `docs/deploy-cloud-run.md`
- ตั้งชื่อระบบของทีมเองด้วย `INBOX_SYSTEMS=web:เว็บไซต์,backend:ระบบหลังบ้าน,…`
