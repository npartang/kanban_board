"use client";

import { FormEvent, useState } from "react";

export type BoardSummary = {
  id: number;
  name: string;
};

type BoardSelectorProps = {
  boards: BoardSummary[];
  activeBoardId: number | null;
  onSelect: (id: number) => void;
  onCreate: (name: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onRename: (id: number, name: string) => Promise<void>;
};

export const BoardSelector = ({
  boards,
  activeBoardId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
}: BoardSelectorProps) => {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await onCreate(name);
      setNewName("");
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  };

  const handleRenameSubmit = async (id: number) => {
    const name = editName.trim();
    if (!name) { setEditingId(null); return; }
    await onRename(id, name);
    setEditingId(null);
  };

  const startEdit = (board: BoardSummary) => {
    setEditingId(board.id);
    setEditName(board.name);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {boards.map((board) => (
        <div key={board.id} className="group relative flex items-center">
          {editingId === board.id ? (
            <form
              onSubmit={(e) => { e.preventDefault(); void handleRenameSubmit(board.id); }}
              className="flex items-center gap-1"
            >
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => void handleRenameSubmit(board.id)}
                onKeyDown={(e) => e.key === "Escape" && setEditingId(null)}
                className="rounded-lg border border-[var(--primary-blue)] bg-white px-2 py-1 text-xs font-semibold text-[var(--navy-dark)] outline-none"
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => onSelect(board.id)}
              onDoubleClick={() => startEdit(board)}
              title="Click to switch · double-click to rename"
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] transition ${
                activeBoardId === board.id
                  ? "border-[var(--primary-blue)] bg-[var(--primary-blue)] text-white"
                  : "border-[var(--stroke)] bg-white text-[var(--navy-dark)] hover:border-[var(--primary-blue)]"
              }`}
            >
              {board.name}
            </button>
          )}

          {boards.length > 1 && editingId !== board.id && (
            <button
              type="button"
              onClick={() => void onDelete(board.id)}
              title="Delete board"
              className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white group-hover:flex"
            >
              ×
            </button>
          )}
        </div>
      ))}

      {showCreate ? (
        <form onSubmit={handleCreate} className="flex items-center gap-1">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Board name"
            onKeyDown={(e) => e.key === "Escape" && setShowCreate(false)}
            className="rounded-lg border border-[var(--stroke)] bg-white px-2 py-1 text-xs text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="rounded-full bg-[var(--secondary-purple)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            {creating ? "…" : "Add"}
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs text-[var(--gray-text)]"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 rounded-full border border-dashed border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--navy-dark)]"
        >
          <span>+</span> New board
        </button>
      )}
    </div>
  );
};
