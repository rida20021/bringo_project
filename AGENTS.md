# OpenCode Agent Instructions

## 🛠️ Tech Stack
- Frontend: React, TypeScript, Vite, Tailwind CSS.
- Backend: Convex (DB, Auth, File Storage).
- Testing: Vitest.

## 🎨 Brand Colors
- Primary: `#4a397e` (Deep Purple - Sidebars, Headers, Text)
- Accent: `#eab818` (Gold - Buttons, Highlights)

## 🚫 CRITICAL RULES
1. **DO NOT RUN SERVERS:** Never run `npm run dev`, `npm run build`, or `npx convex dev`. I run these in my own terminal tabs. If you run them, the laptop will freeze.
2. **NO HALLUCINATIONS:** If you need to use a cron job, use `crons.interval(...)`. Never use `everyMinute`.
3. **ACTION DB ACCESS:** Remember that Convex `actions` cannot use `ctx.db`. You must use `ctx.runQuery` and `ctx.runMutation`.

## 📂 Architecture Guidelines
- All backend code goes in `convex/`.
- All frontend components go in `src/`.
- Always read `PRD.md` and `TASKS.md` before starting a new task.
