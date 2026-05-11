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

  const today = new Date().toISOString().split("T")[0];
  const thisWeek = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  })();
  const isOverdue = !!card.dueDate && card.dueDate < today;
  const isDueToday = card.dueDate === today;
  const isDueSoon = !!card.dueDate && card.dueDate > today && card.dueDate <= thisWeek;
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
        "group relative rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      {/* hover action buttons */}
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {onEdit && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onEdit(card.id)}
            className="rounded-lg border border-[var(--stroke)] bg-white px-2 py-0.5 text-[11px] font-semibold text-[var(--gray-text)] shadow-sm transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
            aria-label={`Edit ${card.title}`}
          >
            Edit
          </button>
        )}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onDelete(card.id)}
          className="rounded-lg border border-[var(--stroke)] bg-white px-2 py-0.5 text-[11px] font-semibold text-[var(--gray-text)] shadow-sm transition hover:border-red-300 hover:text-red-500"
          aria-label={`Delete ${card.title}`}
        >
          ✕
        </button>
      </div>

      <h4 className="font-display pr-16 text-base font-semibold text-[var(--navy-dark)]">
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
          <span
            className={clsx(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              isOverdue && "bg-red-50 text-red-600",
              isDueToday && "bg-orange-50 text-orange-600",
              isDueSoon && !isDueToday && "bg-amber-50 text-amber-600",
              !isOverdue && !isDueToday && !isDueSoon && "text-[var(--gray-text)]"
            )}
          >
            {isOverdue ? `Overdue · ${formattedDate}` : isDueToday ? `Today · ${formattedDate}` : isDueSoon ? `Soon · ${formattedDate}` : `Due ${formattedDate}`}
          </span>
        )}
        {card.checklistTotal > 0 && (
          <span
            className={clsx(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              card.checklistDone === card.checklistTotal
                ? "bg-green-50 text-green-700"
                : "bg-[var(--surface)] text-[var(--gray-text)] border border-[var(--stroke)]"
            )}
          >
            ✓ {card.checklistDone}/{card.checklistTotal}
          </span>
        )}
        {card.labels.map((label) => (
          <span
            key={label}
            className="rounded-full border border-[var(--stroke)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--navy-dark)]"
          >
            {label}
          </span>
        ))}
      </div>
    </article>
  );
};
