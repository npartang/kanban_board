# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Kanban Studio: a project management MVP with a drag-and-drop Kanban board, cookie-based auth, SQLite persistence, and an AI sidebar powered by OpenRouter.

**Stack**: Next.js 16 (static export) frontend + Python FastAPI backend, served together from a single Docker container. SQLite for the database. Sessions are in-memory (lost on restart). Hardcoded credentials: `user` / `password`.

## Commands

### Frontend (`frontend/`)

```bash
npm run dev              # dev server on :3000
npm run build            # static export to out/
npm run lint             # ESLint
npm run test:unit        # Vitest unit tests (run once)
npm run test:unit:watch  # Vitest in watch mode
npm run test:e2e         # Playwright E2E (requires app running)
npm run test:all         # unit + E2E

# single test file or test
npx vitest run src/components/KanbanBoard.test.tsx
```

### Backend (`backend/`)

```bash
uv sync                                                        # install deps (once)
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000  # dev server
uv run pytest                                                  # all tests
uv run pytest tests/test_board_api.py                         # single file
uv run pytest tests/test_board_api.py::test_name              # single test
uv run pytest -v                                               # verbose
```

### Docker (repo root)

```bash
./scripts/start.sh   # build image and run container at :8000
./scripts/stop.sh    # stop and remove container
```

## Architecture

### How the pieces connect

Next.js is built as a static export (`output: "export"` in `next.config.ts`). The Docker image copies the exported files into `backend/app/static/`, which FastAPI serves at `/` via `StaticFiles`. API routes are mounted before the static catch-all.

```
browser → FastAPI (:8000)
            ├── /api/* → Python route handlers
            └── /*     → static Next.js export (out/)
```

### Frontend (`frontend/src/`)

`src/app/page.tsx` wraps `<KanbanBoard>` in `<LoginGate>`.

- **LoginGate** (`components/LoginGate.tsx`): checks `localStorage` for "logged in" flag and calls `POST /api/login` to establish a real session cookie.
- **KanbanBoard** (`components/KanbanBoard.tsx`): owns all board state. Fetches from `GET /api/board` on mount. Optimistically updates local state, then fires matching API calls. Do not lift state into children.
- Drag-and-drop: `@dnd-kit/core` + `@dnd-kit/sortable`. `KanbanColumn` uses `useDroppable`; `KanbanCard` uses `useSortable`.
- Domain types and pure helpers: `src/lib/kanban.ts` — `Card`, `Column`, `BoardData`, `moveCard`, `createId`.
- Colors: CSS variables in `globals.css` (`--accent-yellow`, `--primary-blue`, `--secondary-purple`, `--navy-dark`, `--gray-text`, surface/shadow vars). Reuse these; do not add new colors.
- Fonts: `Space_Grotesk` (`.font-display` headings) and `Manrope` (body), exposed as CSS variables from `layout.tsx`.

### Backend (`backend/app/`)

`main.py` mounts four routers then the static files. New routes belong in a new module in `backend/app/`; keep the structure flat.

| Module | Responsibility |
|---|---|
| `auth.py` | `POST /api/login`, `POST /api/logout`, `get_current_user_id` dependency. Sessions stored in module-level `_sessions: Dict[str, int]`. |
| `board_api.py` | `GET /api/board`, column rename, card CRUD, card move. All routes use `Depends(get_current_user_id)` and verify ownership via JOINs before mutating. |
| `db.py` | `db_connection()` context manager, `ensure_board_for_user`, `seed_default_cards_if_empty`. Plain `sqlite3` — no ORM. |
| `db_schema.py` | `CREATE TABLE IF NOT EXISTS` DDL for `users`, `boards`, `columns`, `cards`. |
| `ai.py` | `GET /api/ai-test` — basic OpenRouter connectivity check. |
| `ai_kanban.py` | `POST /api/ai-kanban` — fetches board, calls OpenRouter (`openai/gpt-oss-120b`) with board JSON + conversation, returns `{reply, operations}`, applies validated operations to the DB. Invalid operations are silently ignored. |

### Database schema

Four normalized tables: `users → boards → columns → cards`. Each table uses a `position` integer for ordering. One board per user (unique index on `boards.user_id`). DB file path is configurable via `PM_DB_PATH` env var; tests use a temp file.

### AI operations

`POST /api/ai-kanban` accepts `{message, history}`. Response: `{reply: string, operations: [...]}`. Each operation has a `type` (`createCard | updateCard | moveCard | deleteCard | renameColumn`) and type-specific fields. Operations with invalid IDs are no-ops.

## Key constraints

- Static export: no SSR; all frontend data fetching is client-side.
- `_sessions` is in-memory — sessions are lost when the backend restarts.
- Do not introduce state management libraries (Redux, Zustand) — plain React state only.
- Do not add an ORM — use `db_connection()` and the existing DB helpers.
- Backend tests must use a temporary SQLite file, not the development DB.
- `.env` must contain `OPENROUTER_API_KEY` for AI features.

## Important references

- `docs/PLAN.md` — 10-part implementation roadmap with checklists and success criteria
- `docs/DATABASE.md` — schema design rationale and frontend mapping
- `frontend/AGENTS.md` — frontend architecture detail and styling guidelines
- `backend/AGENTS.md` — backend module descriptions and patterns
