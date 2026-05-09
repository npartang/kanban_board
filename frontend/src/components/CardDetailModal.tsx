"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import type { Card, Column, Priority } from "@/lib/kanban";

export type CardUpdates = {
  title?: string;
  details?: string;
  priority?: Priority;
  dueDate?: string | null;
};

type CardDetailModalProps = {
  card: Card;
  currentColumnId: string;
  columns: Column[];
  onClose: () => void;
  onSave: (updates: CardUpdates) => Promise<void>;
  onDelete: () => void;
  onMove: (targetColumnId: string) => void;
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const PRIORITY_COLORS: Record<Priority, string> = {
  low: "bg-blue-50 text-blue-700 border-blue-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  urgent: "bg-red-50 text-red-700 border-red-200",
};

const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

export const CardDetailModal = ({
  card,
  currentColumnId,
  columns,
  onClose,
  onSave,
  onDelete,
  onMove,
}: CardDetailModalProps) => {
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details === "No details yet." ? "" : card.details);
  const [priority, setPriority] = useState<Priority>(card.priority);
  const [dueDate, setDueDate] = useState(card.dueDate ?? "");
  const [selectedColumnId, setSelectedColumnId] = useState(currentColumnId);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  const isDirty =
    title !== card.title ||
    (details !== (card.details === "No details yet." ? "" : card.details)) ||
    priority !== card.priority ||
    dueDate !== (card.dueDate ?? "");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        details: details.trim() || undefined,
        priority,
        dueDate: dueDate || null,
      });
      onClose();
    } catch {
      setError("Failed to save changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Card details"
    >
      <div className="w-full max-w-lg rounded-3xl border border-[var(--stroke)] bg-white shadow-[0_32px_64px_rgba(3,33,71,0.16)]">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-start gap-3 border-b border-[var(--stroke)] px-6 pt-6 pb-4">
            <div className="flex-1">
              <input
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full font-display text-xl font-semibold text-[var(--navy-dark)] outline-none placeholder:text-[var(--gray-text)]"
                placeholder="Card title"
                aria-label="Card title"
                required
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[var(--stroke)] px-2 py-1 text-sm text-[var(--gray-text)] hover:border-[var(--primary-blue)]"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="space-y-5 px-6 py-5">
            {/* Details */}
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                Description
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                placeholder="Add a description…"
                aria-label="Card description"
              />
            </div>

            {/* Priority + Due date row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                  Priority
                </label>
                <div className="flex flex-wrap gap-1">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                        priority === p
                          ? PRIORITY_COLORS[p]
                          : "border-[var(--stroke)] bg-white text-[var(--gray-text)] hover:border-[var(--primary-blue)]"
                      }`}
                      aria-pressed={priority === p}
                    >
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="due-date"
                  className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
                >
                  Due date
                </label>
                <input
                  id="due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                  aria-label="Due date"
                />
                {dueDate && (
                  <button
                    type="button"
                    onClick={() => setDueDate("")}
                    className="text-[11px] text-[var(--gray-text)] underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Move to column */}
            <div className="space-y-1">
              <label
                htmlFor="move-column"
                className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
              >
                Column
              </label>
              <select
                id="move-column"
                value={selectedColumnId}
                onChange={(e) => { setSelectedColumnId(e.target.value); onMove(e.target.value); }}
                className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                aria-label="Move to column"
              >
                {columns.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.title}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-[var(--stroke)] px-6 py-4">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600">Delete this card?</span>
                <button
                  type="button"
                  onClick={onDelete}
                  className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Yes, delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs text-[var(--gray-text)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-xs font-semibold text-red-500 hover:text-red-700"
              >
                Delete card
              </button>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold text-[var(--gray-text)] hover:border-[var(--primary-blue)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !isDirty || !title.trim()}
                className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
              >
                {isSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
