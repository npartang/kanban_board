import { useMemo, useState } from "react";
import clsx from "clsx";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Card, Column, Priority } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
  onEditCard?: (cardId: string) => void;
  onDeleteColumn?: (columnId: string) => void;
  onSetWipLimit?: (columnId: string, limit: number | null) => void;
  isHighlighted?: boolean;
};

export const KanbanColumn = ({
  column,
  cards,
  onRename,
  onAddCard,
  onDeleteCard,
  onEditCard,
  onDeleteColumn,
  onSetWipLimit,
  isHighlighted,
}: KanbanColumnProps) => {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: column.id });

  const [editingWip, setEditingWip] = useState(false);
  const [wipInput, setWipInput] = useState("");
  const [sortMode, setSortMode] = useState<"default" | "priority" | "due-asc" | "due-desc">("default");

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isOverLimit = column.wipLimit !== null && cards.length > column.wipLimit;
  const isAtLimit = column.wipLimit !== null && cards.length === column.wipLimit;

  const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const sortedCards = useMemo(() => {
    if (sortMode === "default") return cards;
    const sorted = [...cards];
    if (sortMode === "priority") {
      sorted.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2));
    } else if (sortMode === "due-asc") {
      sorted.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    } else if (sortMode === "due-desc") {
      sorted.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return b.dueDate.localeCompare(a.dueDate);
      });
    }
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, sortMode]);

  const commitWipLimit = () => {
    setEditingWip(false);
    if (!onSetWipLimit) return;
    const parsed = parseInt(wipInput, 10);
    if (wipInput.trim() === "" || isNaN(parsed) || parsed < 1) {
      onSetWipLimit(column.id, null);
    } else {
      onSetWipLimit(column.id, parsed);
    }
  };

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={clsx(
        "flex min-h-[520px] flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-4 shadow-[var(--shadow)] transition",
        (isOver || isHighlighted) && "ring-2 ring-[var(--accent-yellow)]",
        isOverLimit && "border-orange-300",
        isDragging && "opacity-60"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-full">
          <div className="flex items-center gap-3">
            {/* Drag handle for column reordering */}
            <div
              {...attributes}
              {...listeners}
              className="h-2 w-10 cursor-grab rounded-full bg-[var(--accent-yellow)] active:cursor-grabbing"
              aria-label="Drag to reorder column"
            />
            <span
              className={clsx(
                "text-xs font-semibold uppercase tracking-[0.2em]",
                isOverLimit ? "text-orange-500" : "text-[var(--gray-text)]"
              )}
            >
              {cards.length}
              {column.wipLimit !== null && `/${column.wipLimit}`} cards
              {isOverLimit && " ⚠"}
            </span>
            {/* Sort control */}
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
              onPointerDown={(e) => e.stopPropagation()}
              className="ml-auto text-[10px] text-[var(--gray-text)] bg-transparent border-0 outline-none cursor-pointer hover:text-[var(--primary-blue)]"
              aria-label="Sort cards"
            >
              <option value="default">Default</option>
              <option value="priority">Priority ↑</option>
              <option value="due-asc">Due date ↑</option>
              <option value="due-desc">Due date ↓</option>
            </select>

            {/* WIP limit editor */}
            {onSetWipLimit && (
              editingWip ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); commitWipLimit(); }}
                  className="flex items-center gap-1"
                >
                  <input
                    autoFocus
                    type="number"
                    min={1}
                    value={wipInput}
                    onChange={(e) => setWipInput(e.target.value)}
                    onBlur={commitWipLimit}
                    placeholder="∞"
                    className="w-12 rounded border border-[var(--stroke)] px-1 py-0.5 text-[11px] text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
                    aria-label="WIP limit"
                  />
                </form>
              ) : (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => { setWipInput(column.wipLimit !== null ? String(column.wipLimit) : ""); setEditingWip(true); }}
                  className="text-[10px] text-[var(--gray-text)] underline hover:text-[var(--primary-blue)]"
                  aria-label="Set WIP limit"
                >
                  {column.wipLimit !== null ? "WIP" : "set limit"}
                </button>
              )
            )}
          </div>
          <input
            value={column.title}
            onChange={(event) => onRename(column.id, event.target.value)}
            className="mt-3 w-full bg-transparent font-display text-lg font-semibold text-[var(--navy-dark)] outline-none"
            aria-label="Column title"
          />
        </div>
        {onDeleteColumn && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              if (window.confirm(`Delete "${column.title}" and all its cards? This cannot be undone.`)) {
                onDeleteColumn(column.id);
              }
            }}
            className="mt-1 shrink-0 rounded-full border border-transparent px-2 py-1 text-xs text-[var(--gray-text)] transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            aria-label={`Delete column ${column.title}`}
          >
            ×
          </button>
        )}
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {sortedCards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
              onEdit={onEditCard}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Drop a card here
          </div>
        )}
      </div>
      <NewCardForm
        onAdd={(title, details) => onAddCard(column.id, title, details)}
        disabled={isAtLimit || isOverLimit}
      />
    </section>
  );
};
