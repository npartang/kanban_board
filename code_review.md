# Code Review — Kanban Studio MVP

Reviewed: 2026-04-30  
Scope: full codebase (backend, frontend, tests, scripts, Dockerfile)  
All 33 tests passing at time of review.

Findings are grouped by priority: **P1** (must fix before any production use), **P2** (important correctness/reliability), **P3** (quality and tech debt).

---

## P1 — Security / Critical

### 1. Session cookie is not marked `secure`

**File**: `backend/app/auth.py:54`  
```python
response.set_cookie(..., secure=False)
```
The `secure` flag must be `True` in production so the session cookie is only sent over HTTPS. Currently it would be transmitted in plaintext. Replace the hardcoded `False` with an env-driven boolean: `secure=os.getenv("COOKIE_SECURE", "true").lower() == "true"`.

---

### 2. No auth re-challenge on API 401

**File**: `frontend/src/components/KanbanBoard.tsx`, `AISidebar.tsx`  
The `LoginGate` sets `localStorage["pm-auth-logged-in"] = "true"` after login. If the server restarts (clearing `_sessions`) or the cookie expires, all subsequent API calls return 401 — but the frontend never detects this and never re-prompts for login. The user sees a broken board with no explanation.

**Action**: Add a central fetch wrapper that checks `response.status === 401` and calls a shared `onUnauthenticated` callback (which clears `localStorage` and re-renders the login form). Both `KanbanBoard` and `AISidebar` should use it.

---

### 3. Password is never hashed

**File**: `backend/app/db.py:52`  
```python
cursor = connection.execute(
    "INSERT INTO users (username, password_hash) VALUES (?, ?);",
    ("user", "placeholder-hash"),
)
```
And `auth.py` checks credentials with a plain string comparison (`payload.username != "user" or payload.password != "password"`). There is no call to any hashing function. The field is named `password_hash` but stores a literal. Before any real user data is added, the auth flow must use `bcrypt` or `argon2` and the comparison must use `secrets.compare_digest`.

---

### 4. No rate limiting on `/api/login`

**File**: `backend/app/auth.py`  
There is no throttling, lockout, or delay on failed login attempts. An attacker can brute-force the credentials via automated requests. Add a simple per-IP failure counter (or use a middleware like `slowapi`) to reject repeated failures with `429 Too Many Requests`.

---

### 5. `GET /api/ai-test` is unauthenticated and burns API quota

**File**: `backend/app/ai.py:71`  
```python
@router.get("/api/ai-test", response_model=AIResponse)
async def ai_test() -> AIResponse:
```
No `Depends(get_current_user_id)` guard. Any unauthenticated request to this endpoint makes a live call to OpenRouter and consumes paid API quota. Add the auth dependency or remove the endpoint entirely once connectivity is confirmed.

---

## P2 — Correctness / Reliability

### 6. Session state leaks between backend tests

**Files**: `backend/tests/test_ai_kanban_api.py`, `backend/tests/test_board_api.py`, `backend/tests/test_auth_api.py`  
Each test file creates a module-level `client = TestClient(app)`. The `_sessions` dict in `auth.py` is also module-level and is never cleared between tests. `login_demo_user()` accumulates sessions across the test run. While tests currently pass because each login generates a new session ID, any test that calls `/api/logout` clears only its own session, and a subsequent test using the old client cookie gets a 401.

**Action**: Add a fixture in `conftest.py` that clears `app.auth._sessions` before each test:
```python
import app.auth as auth_module

@pytest.fixture(autouse=True)
def _clear_sessions() -> None:
    auth_module._sessions.clear()
```

---

### 7. Column rename fires an API request on every keystroke

**File**: `frontend/src/components/KanbanColumn.tsx:46`, `KanbanBoard.tsx:185-207`  
The `<input>` for column title has `onChange` wired directly to `onRename`, which fires `POST /api/columns/{id}/rename` on every character typed. A user typing "New Name" sends 8 requests. The last response might not be the last request to arrive (race condition).

**Action**: Debounce the API call (e.g., 400 ms delay using `useRef` + `setTimeout`). Update local state immediately; only commit to the API after the user pauses.

---

### 8. `initialData` and `createId` are dead code

**File**: `frontend/src/lib/kanban.ts:18`, `164`  
`initialData` was used before backend integration. `createId` was used before the DB assigned IDs. Both are now exported but not imported anywhere. Dead exports add noise and could mislead future contributors into thinking the app still uses in-memory data.

**Action**: Delete both exports (and verify no test imports them).

---

### 9. pytest and httpx are in production dependencies

**File**: `backend/pyproject.toml`  
```toml
dependencies = [
  "fastapi>=0.115.0",
  "uvicorn[standard]>=0.30.0",
  "pytest>=8.0.0",
  "httpx>=0.27.0",
]
```
The Docker build runs `uv sync --no-dev`, which installs everything in `[project.dependencies]` — including pytest. pytest has no use at runtime and increases image size (~20 MB) and attack surface.

**Action**: Move test dependencies to a dev group:
```toml
[dependency-groups]
dev = ["pytest>=8.0.0", "httpx>=0.27.0", "anyio>=4"]
```
Update the Dockerfile to `uv sync` (no flag) for test runs and `uv sync --no-dev` for the production image.

---

### 10. SQLite database lives inside the Docker container

**File**: `Dockerfile`, `backend/app/db.py`  
The database file (`pm.db`) is written into the container filesystem. All data is permanently lost when the container is stopped and removed, which `scripts/stop.sh` does unconditionally.

**Action**: Add a volume mount to `scripts/start.sh`:
```bash
docker run -d --name "${CONTAINER_NAME}" -p 8000:8000 \
  -v pm-data:/app/backend/app \
  "${ENV_ARGS[@]}" "${IMAGE_NAME}"
```
And set `PM_DB_PATH` to point at the volume path. Alternatively, use a host-mounted bind directory.

---

### 11. Duplicate board-loading logic between `board_api` and `ai_kanban`

**Files**: `backend/app/board_api.py:51-97`, `backend/app/ai_kanban.py:50-102`  
`_load_board_for_user` in `ai_kanban.py` is a near-copy of `get_board` in `board_api.py`, including the call to `seed_default_cards_if_empty`. Any bug fix to the board query must be applied in two places.

**Action**: Extract a shared `fetch_board_data(user_id: int) -> dict` function (or call `get_board` directly) and use it from `ai_kanban.py`.

---

### 12. `moveCard` AI operation always appends to end

**File**: `backend/app/ai_kanban.py:192-199`  
```python
move_card(
    op.cardId,
    MoveCardRequest(target_column_id=op.targetColumnId, position=10**9),
    user_id=user_id,
)
```
The AI structured output schema includes a position concept ("list order"), but the backend always inserts at the end (`position=10**9`). The AI cannot place a card at a specific position within the target column.

**Action**: Either expose `position` as a field in `KanbanOperation` and thread it through, or document the current limitation clearly in the AI prompt so the model doesn't try to specify ordering.

---

## P3 — Quality / Tech Debt

### 13. Mutation failures are completely silent to the user

**Files**: `frontend/src/components/KanbanBoard.tsx:180`, `205`, `254`, `286`  
All four mutation handlers (`move`, `rename`, `add card`, `delete card`) swallow errors:
```ts
}).catch(() => {
  // Silent failure for the MVP.
});
```
If the backend is unreachable or returns an error, the optimistic local state update has already happened, leaving the UI out of sync with the database.

**Action**: At minimum, log to `console.error` so failures are visible during development. For a production-ready path, maintain a brief toast/banner notification and consider reverting the optimistic update on failure.

---

### 14. `apply_schema` executes on every database connection

**File**: `backend/app/db.py:27`  
```python
def _connect() -> sqlite3.Connection:
    connection = sqlite3.connect(get_db_path())
    connection.row_factory = sqlite3.Row
    apply_schema(connection)
    return connection
```
`apply_schema` runs all `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` statements on every new connection — which is every request. SQLite makes these cheap, but running them at app startup once (via a `@app.on_event("startup")` lifespan hook) is cleaner and faster.

---

### 15. No `.gitignore` for generated artifacts

**Repository root**  
`backend/app/static/` (generated by `npm run build`) and `backend/app/pm.db` (runtime database) should be in `.gitignore`. The static directory was pre-populated before the review, suggesting it was committed or retained from a prior run. Including generated files in version control causes stale-asset bugs and inflates repo size.

---

### 16. Missing test coverage

The following paths have no tests:

| Gap | Suggested test |
|---|---|
| `AISidebar` fetch error path | Render sidebar, mock `fetch` to reject, verify error message appears |
| `LoginGate` localStorage persistence | Set `localStorage["pm-auth-logged-in"]` before render, verify board is shown without login form |
| AI operation types `updateCard`, `moveCard`, `deleteCard` | Add backend tests that mock `call_openrouter` and verify each operation type mutates the DB correctly |
| Same-column card reorder via `moveCard` backend route | Call `POST /api/cards/{id}/move` with `target_column_id` equal to the current column, verify `position` updates |
| `KanbanBoard` board-load error state | Mock `fetch` to return `ok: false`, verify the error message renders |

---

### 17. No Dockerfile `HEALTHCHECK`

**File**: `Dockerfile`  
Docker has no built-in way to know when the container is unhealthy without a `HEALTHCHECK` directive. Add:
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1
```

---

### 18. `start.sh` silently skips env file without warning

**File**: `scripts/start.sh:19-22`  
If `.env` is absent, the script starts the container without `OPENROUTER_API_KEY`, and AI features fail at runtime with a `500` error. The script prints `"Using environment from .env"` when the file exists but says nothing when it doesn't. Add a warning:
```bash
else
  echo "Warning: .env not found; AI features will not work without OPENROUTER_API_KEY."
fi
```

---

### 19. Unsafe TypeScript `as` casts on API responses

**Files**: `frontend/src/components/KanbanBoard.tsx:103`, `AISidebar.tsx:57`  
```ts
const data = (await response.json()) as ApiBoard;
```
`response.json()` returns `unknown`. Casting directly with `as` provides no runtime protection if the API changes shape. For the MVP this is acceptable, but once the API stabilises, add a thin validation step (e.g., Zod `safeParse`) so shape mismatches surface as clear errors rather than silent `undefined` property access.

---

## Summary table

| # | Area | Priority | Effort |
|---|---|---|---|
| 1 | Cookie `secure` flag | P1 | Low |
| 2 | No 401 re-challenge | P1 | Medium |
| 3 | Password not hashed | P1 | Medium |
| 4 | No login rate limiting | P1 | Low |
| 5 | Unauthenticated AI test endpoint | P1 | Low |
| 6 | Test session leakage | P2 | Low |
| 7 | Column rename debounce | P2 | Low |
| 8 | Dead code (`initialData`, `createId`) | P2 | Low |
| 9 | pytest in prod deps | P2 | Low |
| 10 | DB lost on container restart | P2 | Medium |
| 11 | Duplicate board-load logic | P2 | Low |
| 12 | AI move always appends | P2 | Low |
| 13 | Silent mutation failures | P3 | Low |
| 14 | Schema applied per connection | P3 | Low |
| 15 | Missing `.gitignore` entries | P3 | Low |
| 16 | Missing test coverage | P3 | Medium |
| 17 | No Dockerfile HEALTHCHECK | P3 | Low |
| 18 | Missing env warning in start.sh | P3 | Low |
| 19 | Unsafe TypeScript `as` casts | P3 | Low |
