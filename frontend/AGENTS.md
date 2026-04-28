# Frontend agents guide

This document describes the current Next.js frontend and how agents should
extend it while keeping the implementation simple and aligned with the rest
of the project.

## High-level architecture

- **Framework**: Next.js (app router) in the `src/app` directory.
- **Entry points**:
  - `src/app/layout.tsx` defines the root HTML shell and wires up Google fonts.
  - `src/app/page.tsx` renders the main Kanban board via `KanbanBoard`.
- **Styling**:
  - Global styles are defined in `src/app/globals.css`.
  - Colors and surfaces are driven by CSS variables that match the project
    palette (accent yellow, primary blue, secondary purple, dark navy, gray
    text, etc.).
  - Tailwind CSS v4 is used in “utility-first” mode directly via class names.
- **Components**:
  - `src/components/KanbanBoard.tsx` – top-level board container and drag-and-drop
    orchestration.
  - `src/components/KanbanColumn.tsx` – individual column surface + drop target.
  - `src/components/KanbanCard.tsx` – draggable card in a column.
  - `src/components/KanbanCardPreview.tsx` – card preview used during drag overlay.
  - `src/components/NewCardForm.tsx` – small form for adding a new card to a column.
- **Domain logic**:
  - `src/lib/kanban.ts` defines:
    - `Card`, `Column`, and `BoardData` types.
    - `initialData` – the in-memory demo board used on first load.
    - `moveCard` – pure function handling card movement across columns.
    - `createId` – simple ID generator for new cards.

## Current behavior

- The Kanban board is **purely client-side and in-memory**:
  - `KanbanBoard` uses React state to hold `BoardData`.
  - On first render, the board is initialized from `initialData`.
  - Drag-and-drop is handled by `@dnd-kit`:
    - `DndContext` wraps the board and tracks the active draggable.
    - `KanbanColumn` uses `useDroppable` to act as a drop target.
    - `KanbanCard` uses `useSortable` to be draggable and reorderable.
  - When a drag ends, `moveCard` computes the new column/card order.
- Columns:
  - Users can rename column titles via an inline `<input>` in `KanbanColumn`.
  - The header area shows the current column name and card count.
- Cards:
  - Adding a card uses `NewCardForm`, which toggles between a button and a small
    form with “Card title” and “Details” fields.
  - New cards insert into the selected column and default details to
    `"No details yet."` if left blank.
  - Users can delete a card via the “Remove” button on each `KanbanCard`.
- Layout and visual design:
  - The main page uses a centered, responsive layout with rounded cards and
    soft shadows.
  - Gradients and colored overlays in `KanbanBoard` give depth without
    affecting logic.

## Tests

- **Unit and integration (Vitest + Testing Library)**:
  - `src/components/KanbanBoard.test.tsx` verifies:
    - The board renders 5 columns.
    - Columns can be renamed.
    - Cards can be added and removed via the UI.
  - `src/lib/kanban.test.ts` verifies:
    - `moveCard` reorders cards within a column.
    - `moveCard` moves cards between columns and handles dropping at the end.
- **E2E (Playwright)**:
  - `tests/kanban.spec.ts` verifies:
    - The Kanban page loads and displays the “Kanban Studio” heading.
    - A card can be added in the first column.
    - A card can be dragged from one column to another using mouse events.
- **Test setup**:
  - `src/test/setup.ts` and `src/test/vitest.d.ts` configure Testing Library
    and typings so `jest-dom` matchers are available.

Agents should keep tests passing and extend them when behavior changes.

## Design and styling guidelines

- **Color palette**:
  - Colors are centralized in `globals.css` via CSS custom properties:
    - `--accent-yellow`
    - `--primary-blue`
    - `--secondary-purple`
    - `--navy-dark`
    - `--gray-text`
    - Surface and stroke variables for cards and backgrounds.
  - When adding new UI, reuse these variables instead of introducing new colors.
- **Typography**:
  - `layout.tsx` configures `Manrope` and `Space_Grotesk` and exposes them via
    CSS variables.
  - The `.font-display` class is used for headings; body text defaults to
    the body font.
- **Layout**:
  - Prefer existing layout patterns:
    - Rounded corners and soft borders.
    - Moderate shadows defined via `--shadow`.
  - Keep new UI elements visually lightweight and focused.

## How future work should integrate with this frontend

The following guidance is intended for upcoming parts of the plan:

- **Authentication UI (Part 4)**:
  - Introduce a simple login screen as a **separate route or conditional**
    around `KanbanBoard`, rather than deeply coupling auth into the board logic.
  - Prefer a small wrapper (e.g. an `AuthGate` or `/login` page) that:
    - Checks auth state (cookie / API).
    - Shows `KanbanBoard` only for authenticated users.
- **Persistence (Parts 6–7)**:
  - Gradually replace usage of `initialData` with data fetched from the backend:
    - Keep the `BoardData` type as the single source of truth for the board
      shape in the frontend.
    - Shape backend responses so they can be plugged into `BoardData` with
      minimal transformation.
  - Keep board state lifting minimal:
    - `KanbanBoard` should continue to own interactive state for columns/cards.
    - Add a thin data-fetching layer around it instead of moving logic into
      many small stores.
- **AI sidebar (Parts 9–10)**:
  - Implement the AI chat UI as a **sidebar component** that lives alongside
    `KanbanBoard` in the main page layout, not inside each column or card.
  - The sidebar should:
    - Call a backend endpoint that returns both a chat reply and structured
      operations.
    - Apply operations either by:
      - Updating local `BoardData` and then syncing to the backend, or
      - Triggering a refetch of the board after the backend applies operations.
  - Avoid embedding AI-specific logic directly inside `KanbanBoard` drag-and-drop
    handlers; keep concerns separated.

## Constraints and principles for agents

- **Keep it simple**:
  - Do not introduce complex state management libraries (Redux, Zustand, etc.)
    unless explicitly requested.
  - Prefer plain React state and straightforward components.
- **Respect tests**:
  - Update or add tests alongside behavior changes.
  - Use the existing Vitest and Playwright setup rather than adding new
    testing frameworks.
- **Avoid unnecessary breaking changes**:
  - Preserve the existing look and feel of the Kanban board.
  - When refactoring, keep public component interfaces (`KanbanBoard` props,
    etc.) stable unless there is a strong reason to change them.

