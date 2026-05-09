import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Card, Priority } from "@/lib/kanban";

const PRIORITY_COLORS: Record<Priority, string> = {
  low: "bg-blue-50 text-blue-700",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-orange-50 text-orange-700",
  urgent: "bg-red-50 text-red-700",
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onEdit?: (cardId: string) => void;
};

export const KanbanCard = ({ card, onDelete, onEdit }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const formattedDate = card.dueDate
    ? new Date(card.dueDate + "T00:00:00").toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
            {card.title}
          </h4>
          {card.details && card.details !== "No details yet." && (
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--gray-text)]">
              {card.details}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className={clsx(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                PRIORITY_COLORS[card.priority]
              )}
            >
              {PRIORITY_LABELS[card.priority]}
            </span>
            {formattedDate && (
              <span className="text-[11px] text-[var(--gray-text)]">Due {formattedDate}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          {onEdit && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onEdit(card.id)}
              className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
              aria-label={`Edit ${card.title}`}
            >
              Edit
            </button>
          )}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDelete(card.id)}
            className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
            aria-label={`Delete ${card.title}`}
          >
            Remove
          </button>
        </div>
      </div>
    </article>
  );
};
