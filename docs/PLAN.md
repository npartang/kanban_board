# High level steps for project

This document expands the high-level 10-part plan for the Project Management MVP
into concrete checklists, tests, and success criteria. It is the source of truth
for how the app will be implemented and validated.

Each part below shares a consistent structure:
- **Implementation checklist**: Tasks the agent will complete.
- **Tests**: How we will verify behavior (prefer automated over manual).
- **Success criteria**: Conditions that must be true before moving to the next part.

Key cross-cutting decisions this plan assumes:
- **Backend**: Python FastAPI running in a **single Docker container**.
- **Frontend**: Existing Next.js app (app router) in `frontend/`, built statically and
  served from FastAPI at `/`.
- **Database**: **Normalized SQLite** schema (not JSON blobs), with a separate JSON
  document in `docs/` describing the schema.
- **Auth**: Target is a **cookie-based session** with HTTP-only cookies and a simple
  server-side session store once persistence is introduced (Parts 6–7). Earlier parts
  may use a lighter-weight, purely frontend “fake sign-in” to shape the UX first.
- **AI**: OpenRouter using `openai/gpt-oss-120b`, with **structured JSON outputs**
  that can describe Kanban operations (create/edit/move cards, rename columns).

Testing approach:
- The long-term goal is **around 80% useful test coverage** across backend and
  frontend. The emphasis is on **high-value tests** that exercise realistic flows
  (auth, persistence, drag-and-drop, AI operations), not on writing trivial tests
  just to raise coverage numbers.

---

## Part 1: Plan

Goal: Have an agreed, detailed implementation plan and agent guidance before writing
or restructuring any application code.

### Implementation checklist

- [ ] Enrich this `docs/PLAN.md` document with detailed checklists, tests, and
      success criteria for Parts 1–10 (this change).
- [ ] Capture the agreed global decisions (normalized SQLite schema, cookie-based
      sessions, single Docker container, OpenRouter with structured outputs) so
      later work does not re-litigate fundamentals.
- [ ] Create `frontend/AGENTS.md` that:
  - [ ] Describes the current Next.js Kanban demo (architecture, main components,
        data model in `src/lib/kanban.ts`).
  - [ ] Documents existing unit and E2E tests (Vitest + Testing Library, Playwright).
  - [ ] Explains how the color system and layout are wired (CSS variables +
        Tailwind 4).
  - [ ] Gives concrete guidance for future agents about where to plug in login,
        persistence, and AI sidebar features without over-engineering.
- [ ] Review this plan with the user and adjust wording or scope as needed
      before starting Part 2.

### Tests

This part is mostly documentation, but we still validate it:

- [ ] Manual review that every original high-level item from the initial `PLAN.md`
      is still present and has:
  - [ ] At least one implementation checklist.
  - [ ] At least one test bullet.
  - [ ] At least one success-criteria bullet.
- [ ] Manual review that cross-cutting decisions in this plan match `AGENTS.md`
      at the repo root and any other project docs.

### Success criteria

- [ ] `docs/PLAN.md` reflects a clear, linear 10-part plan with no obvious gaps.
- [ ] `frontend/AGENTS.md` exists and accurately describes the current frontend.
- [ ] The user has explicitly confirmed they are happy with this plan before
      work proceeds to Part 2.

---

## Part 2: Scaffolding

Goal: Have a working FastAPI backend in a single Docker container that can:
1) serve a trivial static HTML response at `/`, and 2) answer a simple JSON API
request, with start/stop scripts for local development.

### Implementation checklist

- [ ] Initialize the `backend/` FastAPI application with:
  - [ ] A minimal `main.py` (or equivalent) exposing:
    - [ ] `GET /health` returning a small JSON health payload.
    - [ ] `GET /api/hello` returning a JSON `{ "message": "hello world" }`.
  - [ ] A basic `uv`-managed Python dependency setup (e.g. `pyproject.toml`).
- [ ] Add a simple HTML "Hello from Project Management MVP" page served at
      `/` directly from FastAPI (no frontend integration yet).
- [ ] Create a `Dockerfile` that:
  - [ ] Uses a Python base image.
  - [ ] Installs `uv` and project dependencies.
  - [ ] Starts the FastAPI app via Uvicorn or equivalent.
- [ ] Add start and stop scripts in `scripts/` for Mac, Windows, and Linux,
      wrapping `docker build` and `docker run`:
  - [ ] `scripts/start.*` builds the image and runs the container, exposing
        HTTP on a clear port (e.g. 8000).
  - [ ] `scripts/stop.*` stops and removes the container.
- [ ] Document in `docs/` (or `README`) the minimal commands for:
  - [ ] Running the backend directly (no Docker) using `uv`.
  - [ ] Building and running the container via the scripts.

### Tests

- [ ] Add FastAPI unit/integration tests (with `pytest` + `httpx` or similar) for:
  - [ ] `GET /health` returns 200 and expected shape.
  - [ ] `GET /api/hello` returns 200 with the `"hello world"` payload.
  - [ ] `GET /` returns the expected HTML string or at least a non-empty HTML response.
- [ ] Manual or scripted test that:
  - [ ] `scripts/start.*` builds and starts the container successfully.
  - [ ] Hitting the container’s `/health`, `/api/hello`, and `/` endpoints works.
  - [ ] `scripts/stop.*` shuts down the container cleanly.

### Success criteria

- [ ] One `docker build` + `docker run` path exists (wrapped by scripts) and
      results in a running FastAPI app.
- [ ] The app responds correctly at `/`, `/health`, and `/api/hello` from
      inside the container.
- [ ] Tests for these endpoints are green.

### How to run the backend after Part 2

- **Run locally without Docker**:
  - From the `backend/` directory:
    - `uv sync` (once, to install dependencies including dev tools).
    - `uv run uvicorn app.main:app --host 0.0.0.0 --port 8000`
- **Run tests for the backend**:
  - From the `backend/` directory:
    - `uv run pytest`
- **Run via Docker (uses the root `Dockerfile`)**:
  - From the repo root:
    - `./scripts/start.sh` (macOS/Linux) or `powershell -File .\scripts\start.ps1` (Windows).
    - Visit `:http//localhost:8000` in a browser to see the HTML page.
  - To stop:
    - `./scripts/stop.sh` (macOS/Linux) or `powershell -File .\scripts\stop.ps1` (Windows).

---

## Part 3: Add in Frontend

Goal: Serve the existing Next.js Kanban board via the FastAPI-backed container,
so that visiting `/` in the container shows the Kanban UI with comprehensive
frontend tests passing.

### Implementation checklist

- [ ] Configure the Next.js frontend for static serving:
  - [ ] Update `next.config` as needed to support a static export or similar
        build that can be served by FastAPI (e.g. `output: "export"` if used).
  - [ ] Ensure all existing routes/components (`src/app/page.tsx`,
        `src/components/*`) work under this build mode.
- [ ] Wire the Docker image so that:
  - [ ] Frontend dependencies in `frontend/` are installed.
  - [ ] `npm run build` (or an equivalent static export command) is run at
        image build-time.
  - [ ] The exported static assets (HTML / JS / CSS) are copied into a directory
        served by FastAPI (e.g. `backend/static/frontend`).
- [ ] Update FastAPI to:
  - [ ] Serve the built Next.js static assets at `/` (and any needed assets)
        using `StaticFiles` with `html=True`.
- [ ] Keep the original FastAPI JSON endpoint(s) working alongside the static UI.

### Tests

- [ ] Ensure existing frontend unit tests (Vitest + Testing Library) run and pass:
  - [ ] `KanbanBoard` behavior (rendering, renaming, adding/removing cards).
  - [ ] `moveCard` behavior and other pure helpers.
- [ ] Ensure existing Playwright E2E tests run and pass:
  - [ ] Kanban page loads and renders 5 columns.
  - [ ] A new card can be added via the UI.
  - [ ] A card can be dragged from one column to another.
- [ ] Add at least one new E2E test (or adapt existing) that:
  - [ ] Navigates to `/` on the container host and verifies the app loads
        correctly via FastAPI, not just `next dev`.

### Success criteria

- [ ] Visiting `/` on the running Docker container shows the Kanban board UI.
- [ ] All existing frontend tests (unit and E2E) pass in CI or a test script.
- [ ] FastAPI continues to expose a JSON endpoint that still works.

---

## Part 4: Add a fake user sign-in experience

Goal: Require a simple login (`user` / `password`) before a user can see the
Kanban board. This part focuses on the **UX layer** with a frontend-only
“fake sign-in”; the real cookie-based sessions will be implemented once the
database-backed backend is in place (Parts 6–7).

### Implementation checklist

- [ ] Frontend-only auth gate:
  - [ ] Introduce a `LoginGate` component that:
    - [ ] Shows a login form when the user is not “signed in”.
    - [ ] Accepts the hardcoded credentials (`user` / `password`).
    - [ ] Stores a simple “logged in” flag in `localStorage` so the state
          survives page reloads in the browser.
    - [ ] Shows the Kanban board (children) only when logged in.
  - [ ] Wrap the main Kanban page (`/`) in `LoginGate` so that visiting `/`
        presents the login form first.
  - [ ] Add a small signed-in indicator and a Logout button in a lightweight
        header above the board; logging out clears the local “logged in” state
        and returns the user to the login screen.
- [ ] Keep the implementation intentionally simple, without backend calls:
  - [ ] Clearly document in the code (and optionally `AGENTS.md`) that this is
        a temporary, frontend-only sign-in for UX and testing, and that real
        cookie-based auth lives in later parts.

### Tests

- [ ] Frontend unit/integration tests (Vitest + Testing Library) to cover:
  - [ ] Initial render shows the login form and hides the board when not “signed in”.
  - [ ] Successful login with `user` / `password` reveals the protected content.
  - [ ] Invalid credentials show an error and keep the user on the login form.
  - [ ] Logout returns the user to the login form and hides the board again.
- [ ] Optional E2E tests (Playwright) when it is straightforward to run both
      the frontend and backend together:
  - [ ] Visiting `/` when logged out shows the login screen.
  - [ ] Logging in with `user` / `password` shows the Kanban board.
  - [ ] Refreshing the page after login keeps the user “signed in” via
        `localStorage`.

### Success criteria

- [ ] The Kanban board is only reachable through the sign-in UI in the browser.
- [ ] The fake sign-in experience feels polished and uses the project’s
      existing design language.
- [ ] Tests cover both happy and unhappy login paths at the component level,
      contributing meaningfully toward the ~80% coverage goal without adding
      low-value tests.

---

## Part 5: Database modeling

Goal: Design a normalized SQLite schema for Kanban data that supports multiple
users and one board per user (for the MVP), and capture it as documentation
for future evolution.

### Implementation checklist

- [ ] Propose a normalized schema for:
  - [ ] `users` (at minimum: `id`, `username`, `password_hash` or placeholder).
  - [ ] `boards` (e.g. `id`, `user_id`, `name`).
  - [ ] `columns` (e.g. `id`, `board_id`, `title`, `position`).
  - [ ] `cards` (e.g. `id`, `column_id`, `title`, `details`, `position`).
- [ ] Encode the schema as a JSON document (e.g. `docs/database-schema.json`)
      that describes tables, columns, indexes, and relationships.
- [ ] Write a short companion doc in `docs/` explaining:
  - [ ] The rationale for normalization (vs. JSON blobs).
  - [ ] How the single-board-per-user assumption is modeled.
  - [ ] How this could evolve later for multiple boards per user.
- [ ] Define migration/initialization behavior:
  - [ ] On startup, create the SQLite DB file if it does not exist.
  - [ ] Apply the schema in a simple, deterministic way (e.g. `CREATE TABLE IF NOT EXISTS`).

### Tests

- [ ] Add unit tests (or integration tests) that:
  - [ ] Exercise a small in-memory SQLite DB using the proposed schema.
  - [ ] Verify constraints like foreign keys (where reasonable).
- [ ] Manual review that:
  - [ ] The JSON schema doc matches the actual SQL schema that will be created.
  - [ ] The schema supports all required operations:
        listing columns/cards, renaming columns, moving cards, and editing cards.

### Success criteria

- [ ] A clear, normalized schema exists and is documented in both JSON and prose.
- [ ] The user has signed off on the schema design before implementation in Part 6.
- [ ] The schema supports multiple users (even if the UI only uses one user now).

---

## Part 6: Backend

Goal: Implement FastAPI routes that persist and mutate the Kanban board in the
SQLite database for a given authenticated user, creating the DB if needed and
backing it with a simple cookie-based session.

### Implementation checklist

- [ ] Implement a thin DB access layer (plain `sqlite3`) for:
  - [ ] Connecting to the SQLite database file (configurable via env).
  - [ ] Applying the schema on first use (using `docs/database-schema.json` /
        `app/db_schema.py`).
  - [ ] Creating the demo user and default board/columns if they do not exist.
- [ ] Implement backend authentication with cookie-based sessions:
  - [ ] `POST /api/login`:
    - [ ] Accepts `username` / `password` JSON (demo credentials `user` / `password`).
    - [ ] Ensures the demo user exists in the `users` table.
    - [ ] Creates an in-memory session and sets an HTTP-only cookie.
  - [ ] `POST /api/logout`:
    - [ ] Clears the session and deletes the cookie.
  - [ ] A `get_current_user_id` dependency that:
    - [ ] Reads the session cookie.
    - [ ] Resolves the current user ID or rejects with 401.
- [ ] Implement board persistence API routes for authenticated users:
  - [ ] `GET /api/board`:
    - [ ] Ensures a board and default columns exist for the current user.
    - [ ] Returns the board, columns, and cards as a simple JSON structure
          mirroring the normalized schema (IDs, positions, and relationships).
  - [ ] Column operations:
    - [ ] `POST /api/columns/{column_id}/rename` to update a column title.
  - [ ] Card operations:
    - [ ] `POST /api/cards` to create a new card at the end of a column.
    - [ ] `DELETE /api/cards/{card_id}` to remove a card.
    - [ ] `POST /api/cards/{card_id}/move` to move a card between columns and
          update ordering within a column.
- [ ] Keep implementation simple and direct (no ORMs or extra abstraction layers).

### Tests

- [ ] Backend unit/integration tests:
  - [ ] Auth:
    - [ ] Successful login sets a session cookie and returns 200.
    - [ ] Invalid credentials return 401 and no session.
    - [ ] Logout clears the session and subsequent protected calls fail.
  - [ ] Board API (using `TestClient` with cookies preserved):
    - [ ] Unauthenticated calls to `/api/board` and mutation routes return 401.
    - [ ] `GET /api/board` after login creates a default board with the expected
          columns and returns it.
    - [ ] Renaming a column persists the new title and is visible on a
          subsequent `GET /api/board`.
    - [ ] Creating a card adds it to the correct column and it appears when
          re-fetching the board.
    - [ ] Deleting a card removes it from the board view.
    - [ ] Moving a card between columns updates its `column_id` and ensures
          the ordering within the target column is consistent.
  - [ ] Tests should use a **temporary SQLite file** (via an env override) to
        avoid coupling to any local development database.

### Success criteria

- [ ] An authenticated user can persistently store a single Kanban board backed
      by SQLite.
- [ ] Board endpoints are protected by a simple cookie-based session and
      reject unauthenticated access.
- [ ] All new backend tests (auth + board API) are passing and provide
      high-value coverage of core persistence flows.

---

## Part 7: Frontend + Backend

Goal: Wire the frontend to use the backend API so the Kanban board becomes
persistent per user instead of purely in-memory.

### Implementation checklist

- [ ] Define a minimal client API layer in the frontend for:
  - [ ] Fetching the current board from `/api/board` after login.
  - [ ] Sending updates when the user:
    - [ ] Renames a column.
    - [ ] Adds a card.
    - [ ] Deletes a card.
    - [ ] Drags a card between columns.
- [ ] Decide on data sync strategy (keep it simple):
  - [ ] Either send small, incremental updates per user action.
  - [ ] Or, for MVP, send the full board on each change if that is simpler.
- [ ] Update the `KanbanBoard` component:
  - [ ] Initialize from backend data instead of `initialData` once the user is authenticated.
  - [ ] Keep local state for responsiveness but ensure writes eventually hit the backend.
- [ ] Ensure error handling is minimal but user-friendly (e.g. toast or inline message).

### Tests

- [ ] Frontend integration tests (Vitest + Testing Library):
  - [ ] Mock API calls and verify that:
    - [ ] Initial load fetches the board.
    - [ ] Column rename triggers the correct API call.
    - [ ] Adding/removing a card triggers the correct API calls.
- [ ] E2E tests (Playwright):
  - [ ] Login, then load the board, create a card, reload the page, and check
        that the card is still present.
  - [ ] Move a card, reload, and verify its new position is persisted.

### Success criteria

- [ ] The board state persists across reloads for the same user.
- [ ] All user flows (rename column, add/delete/move card) are backed by the API.
- [ ] Tests demonstrate persistence end-to-end.

---

## Part 8: AI connectivity

Goal: Allow the backend to make a simple AI call through OpenRouter and confirm
the plumbing (auth, HTTP, and response parsing) works.

### Implementation checklist

- [ ] Add configuration for OpenRouter:
  - [ ] Read `OPENROUTER_API_KEY` from environment (e.g. `.env`) in the backend.
  - [ ] Configure the base URL and headers required by OpenRouter.
  - [ ] Use the `openai/gpt-oss-120b` model.
- [ ] Implement a simple AI service in the backend that:
  - [ ] Sends a prompt like "What is 2+2?".
  - [ ] Parses back a plain-text answer using a small helper (no heavy SDK).
- [ ] Expose a test endpoint, e.g. `GET /api/ai-test`:
  - [ ] Calls the AI service and returns the parsed answer as a JSON payload.
- [ ] Ensure AI calls are clearly separated from core Kanban logic for now
      (no board mutations yet).

### Tests

- [ ] Add backend tests (using a mocked HTTP client) that:
  - [ ] Exercise the AI service function and check that a non-empty answer is
        returned for "2+2" when the provider responds successfully.
  - [ ] Handle error paths gracefully (e.g. missing API key, provider errors,
        unexpected response shape) without crashing the app.
- [ ] Manual test:
  - [ ] Call `/api/ai-test` from a running container and verify that it
        returns a sensible answer.

### Success criteria

- [ ] The backend can successfully call OpenRouter using `openai/gpt-oss-120b`.
- [ ] Basic error handling is in place and does not crash the app.
- [ ] AI connectivity is confirmed both in tests and manually.

---

## Part 9: AI with structured outputs over the Kanban JSON

Goal: Extend the AI integration so that the backend always calls the model
with the current Kanban board (as JSON) plus the user’s question/history, and
the AI responds with **structured JSON** describing both a reply and optional
board updates.

### Implementation checklist

- [ ] Define a structured output schema for AI responses, for example:
  - [ ] Top-level fields:
    - [ ] `reply`: string — the natural language answer to show in the UI.
    - [ ] `operations`: array of zero or more operations to apply to the board.
  - [ ] Each operation includes:
    - [ ] `type`: `"createCard" | "updateCard" | "moveCard" | "deleteCard" | "renameColumn"`.
    - [ ] Optional fields such as `cardId`, `columnId`, `targetColumnId`,
          `title`, and `details` depending on `type`.
- [ ] Document this schema in `docs/` so it is easy to update later.
- [ ] Implement a backend endpoint, e.g. `POST /api/ai-kanban` that:
  - [ ] Accepts the user’s message and conversation history.
  - [ ] Fetches the current board for the authenticated user.
  - [ ] Calls OpenRouter with a prompt or tool/JSON mode that:
    - [ ] Provides the board JSON and conversation.
    - [ ] Instructs the model to respond only with JSON in the agreed schema.
  - [ ] Parses the AI response and:
    - [ ] Returns `reply` and `operations` to the caller.
    - [ ] Applies the operations to the DB via existing board APIs.
- [ ] Implement server-side logic to safely apply operations to the board in the DB:
  - [ ] Validate all IDs and types.
  - [ ] Ignore or reject invalid operations rather than corrupting state (logically no-ops on bad ids).

### Tests

- [ ] Backend unit tests for the operation-application logic:
  - [ ] Each operation type correctly mutates an in-memory board/DB.
  - [ ] Invalid operations (unknown type, missing IDs) are handled safely.
- [ ] Backend integration tests for `POST /api/ai-kanban`:
  - [ ] Use a mock AI client that returns canned structured JSON.
  - [ ] Verify the endpoint:
    - [ ] Returns the `reply` and `operations`.
    - [ ] Applies operations correctly to the DB (e.g. new cards created, columns renamed).

### Success criteria

- [ ] A clear, documented JSON schema exists for AI structured outputs.
- [ ] The backend can accept a user question, call the AI with board JSON,
      and produce both a reply and board operations.
- [ ] Tests demonstrate that applying AI operations results in correct board updates.

---

## Part 10: AI-powered sidebar in the UI

Goal: Add a beautiful sidebar widget to the frontend that supports full AI chat
and allows the LLM to update the Kanban board via the structured outputs
defined in Part 9.

### Implementation checklist

- [ ] Design the sidebar UI:
  - [ ] Visually aligned with the existing Kanban layout and color system
        (using the provided palette and CSS variables).
  - [ ] Shows chat history between user and AI.
  - [ ] Includes a message input and send button.
- [ ] Frontend behavior:
  - [ ] When the user sends a message:
    - [ ] Call `POST /api/ai-kanban` with the message and current conversation.
    - [ ] Append the AI `reply` to the chat view.
    - [ ] If `operations` are present, either:
      - [ ] Apply them locally and then sync to the backend; or
      - [ ] Trigger a backend call that applies them and refetch the board.
  - [ ] Refresh the visible board automatically when operations change it.
- [ ] Ensure UX remains simple:
  - [ ] Clear indication when the AI is thinking/loading.
  - [ ] Minimal but clear error messaging if the AI call fails.

### Tests

- [ ] Frontend tests:
  - [ ] Unit/integration tests with mocked `POST /api/ai-kanban`:
    - [ ] User messages appear in the chat.
    - [ ] AI replies appear in the chat.
    - [ ] When mocked responses include operations, the board updates accordingly.
- [ ] E2E tests:
  - [ ] A basic scenario where the user asks the AI to "Create a card in Backlog"
        results in a new card appearing in the Backlog column.
  - [ ] A scenario where the AI suggests moving a card actually moves it.

### Success criteria

- [ ] The sidebar provides a smooth chat experience that feels integrated with
      the Kanban board, not bolted on.
- [ ] AI-driven operations reliably update the persisted board and are reflected
      in the UI without manual reloads.
- [ ] Tests provide confidence that common AI flows work end-to-end.