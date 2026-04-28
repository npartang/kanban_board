# Database design

This document describes the normalized SQLite schema used for the Project
Management MVP and how it supports the current “single board per user”
assumption while remaining flexible for future changes.

The authoritative machine-readable version of the schema lives in
`docs/database-schema.json`.

## Goals

- Support **multiple users** even though the MVP only exposes one demo user.
- Enforce **one board per user** for the MVP via a simple constraint.
- Keep tables **normalized and predictable**:
  - No opaque JSON blobs for boards or cards.
  - IDs and foreign keys are explicit.
- Make it straightforward to:
  - List a user’s board, columns, and cards.
  - Rename columns.
  - Create, edit, move, and delete cards.

## Tables

### `users`

Represents application users.

- `id` – integer primary key.
- `username` – unique, non-null, used to look up the user.
- `password_hash` – text placeholder for future password hashing.
- `created_at` – timestamp of user creation.

For the MVP we will create a single row for the demo user (`user`), but
the schema supports multiple users out of the box.

### `boards`

Top-level kanban boards.

- `id` – integer primary key.
- `user_id` – foreign key to `users.id`, `ON DELETE CASCADE`.
- `name` – human-readable board name.
- `created_at`, `updated_at` – timestamps.
- Unique index on `user_id` to enforce **one board per user**.

This unique constraint encodes the “one board per user” rule in the
database. If we later decide to support multiple boards per user, we
can safely drop or relax this constraint without changing the rest of
the schema.

### `columns`

Columns within a board (e.g. Backlog, In Progress, Done).

- `id` – integer primary key.
- `board_id` – foreign key to `boards.id`, `ON DELETE CASCADE`.
- `title` – column title.
- `position` – integer used to order columns within a board.

`position` is intentionally simple: the exact convention (0-based or
1-based) is an implementation detail. The important property is that
it can be used to order columns consistently.

### `cards`

Cards that live inside columns.

- `id` – integer primary key.
- `column_id` – foreign key to `columns.id`, `ON DELETE CASCADE`.
- `title` – card title.
- `details` – optional long-form text.
- `position` – integer used to order cards inside a column.
- `created_at`, `updated_at` – timestamps.

Cards are attached to columns, and indirectly to boards and users via
foreign keys. This keeps relationships explicit and simplifies
queries such as:

- All cards for a board.
- All cards in a given column ordered by `position`.

## Mapping to the frontend model

The existing frontend uses an in-memory `BoardData` structure with:

- A list of columns, each with an `id`, `title`, and ordered `cardIds`.
- A `cards` map keyed by card ID.

The database schema maps cleanly onto this shape:

- `boards` ↔ the single `BoardData` instance for a user.
- `columns` rows ↔ `BoardData.columns` entries.
  - `columns.id` ↔ column IDs.
  - `columns.position` ↔ the order of `BoardData.columns`.
- `cards` rows ↔ entries in the `BoardData.cards` map.
  - `cards.column_id` ↔ which column a card belongs to.
  - `cards.position` ↔ the order of `cardIds` within a column.

The backend will be responsible for:

- Translating integer primary keys into the string IDs the frontend
  expects (e.g. using a consistent prefix like `col-<id>` or
  `card-<id>`).
- Applying board operations (create/move/delete) to both the
  in-database rows and the derived `BoardData` representation.

## Initialization behavior

When the backend starts up it will:

- Create the SQLite database file if it does not exist.
- Apply the schema using `CREATE TABLE IF NOT EXISTS` statements based
  on `docs/database-schema.json`.
- Ensure that foreign key support is enabled for the SQLite connection.

This keeps migrations simple for the MVP while still giving us a
normalized, well-structured schema to build on in later parts of the
project.

