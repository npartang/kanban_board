"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { AISidebar } from "@/components/AISidebar";
import { moveCard, type BoardData } from "@/lib/kanban";
import { useAuth } from "@/lib/auth-context";

type ApiColumn = {
  id: number;
  title: string;
  position: number;
};

type ApiCard = {
  id: number;
  column_id: number;
  title: string;
  details: string | null;
  position: number;
};

type ApiBoard = {
  id: number;
  name: string;
  columns: ApiColumn[];
  cards: ApiCard[];
};

const toColumnId = (dbId: number) => `col-${dbId}`;
const toCardId = (dbId: number) => `card-${dbId}`;

const fromColumnId = (id: string) => Number(id.replace(/^col-/, ""));
const fromCardId = (id: string) => Number(id.replace(/^card-/, ""));

const isApiBoard = (data: unknown): data is ApiBoard =>
  typeof data === "object" &&
  data !== null &&
  Array.isArray((data as ApiBoard).columns) &&
  Array.isArray((data as ApiBoard).cards);

const toBoardData = (apiBoard: ApiBoard): BoardData => {
  const sortedColumns = [...apiBoard.columns].sort(
    (a, b) => a.position - b.position
  );

  const cardsByColumn: Record<number, ApiCard[]> = {};
  for (const card of apiBoard.cards) {
    const list = cardsByColumn[card.column_id] ?? [];
    list.push(card);
    cardsByColumn[card.column_id] = list;
  }

  const columns = sortedColumns.map((column) => {
    const cardsForColumn = (cardsByColumn[column.id] ?? []).sort(
      (a, b) => a.position - b.position
    );
    return {
      id: toColumnId(column.id),
      title: column.title,
      cardIds: cardsForColumn.map((card) => toCardId(card.id)),
    };
  });

  const cards: BoardData["cards"] = {};
  for (const card of apiBoard.cards) {
    const id = toCardId(card.id);
    cards[id] = {
      id,
      title: card.title,
      details: card.details ?? "No details yet.",
    };
  }

  return { columns, cards };
};

export const KanbanBoard = () => {
  const { onUnauthenticated } = useAuth();

  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);

  // Per-column debounce timers for rename API calls
  const renameTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const loadBoard = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/board", { credentials: "include" });
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      if (!response.ok) {
        throw new Error(`Board load failed: ${response.status}`);
      }
      const json: unknown = await response.json().catch(() => null);
      if (!isApiBoard(json)) {
        throw new Error("Unexpected board response shape");
      }
      setBoard(toBoardData(json));
      setError(null);
    } catch (err) {
      console.error("Failed to load board:", err);
      setError("Unable to load board.");
    } finally {
      setIsLoading(false);
    }
  }, [onUnauthenticated]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const cardsById = useMemo(() => board?.cards ?? {}, [board]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    if (!board) return;
    const { over } = event;
    if (!over) { setOverColumnId(null); return; }
    const overId = String(over.id);
    const column =
      board.columns.find((c) => c.id === overId) ??
      board.columns.find((c) => c.cardIds.includes(overId));
    setOverColumnId(column ? column.id : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (!board) return;
    const { active, over } = event;
    setActiveCardId(null);
    setOverColumnId(null);
    if (!over || active.id === over.id) return;

    const movedCardId = active.id as string;
    const nextColumns = moveCard(board.columns, movedCardId, over.id as string);
    setBoard((prev) => prev ? { ...prev, columns: nextColumns } : prev);

    const targetColumn = nextColumns.find((c) => c.cardIds.includes(movedCardId));
    if (!targetColumn) return;

    const position = targetColumn.cardIds.indexOf(movedCardId);
    void fetch(`/api/cards/${fromCardId(movedCardId)}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ target_column_id: fromColumnId(targetColumn.id), position }),
    }).then((r) => {
      if (r.status === 401) onUnauthenticated();
    }).catch((err) => {
      console.error("Failed to persist card move:", err);
    });
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    // Optimistic local update
    setBoard((prev) =>
      prev
        ? { ...prev, columns: prev.columns.map((c) => c.id === columnId ? { ...c, title } : c) }
        : prev
    );

    // Debounced API call: only fires 400 ms after the user stops typing
    const existing = renameTimers.current.get(columnId);
    if (existing) clearTimeout(existing);
    renameTimers.current.set(
      columnId,
      setTimeout(() => {
        renameTimers.current.delete(columnId);
        void fetch(`/api/columns/${fromColumnId(columnId)}/rename`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ title }),
        }).then((r) => {
          if (r.status === 401) onUnauthenticated();
        }).catch((err) => {
          console.error("Failed to persist column rename:", err);
        });
      }, 400)
    );
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    void (async () => {
      try {
        const response = await fetch("/api/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ column_id: fromColumnId(columnId), title, details }),
        });
        if (response.status === 401) { onUnauthenticated(); return; }
        if (!response.ok) throw new Error(`Create card failed: ${response.status}`);

        const json: unknown = await response.json().catch(() => null);
        if (
          !json ||
          typeof json !== "object" ||
          typeof (json as { id?: unknown }).id !== "number"
        ) {
          throw new Error("Unexpected create-card response shape");
        }
        const card = json as { id: number; column_id: number; title: string; details: string | null; position: number };
        const cardId = toCardId(card.id);
        setBoard((prev) =>
          prev
            ? {
                ...prev,
                cards: {
                  ...prev.cards,
                  [cardId]: { id: cardId, title: card.title, details: card.details ?? "No details yet." },
                },
                columns: prev.columns.map((c) =>
                  fromColumnId(c.id) === card.column_id
                    ? { ...c, cardIds: [...c.cardIds, cardId] }
                    : c
                ),
              }
            : prev
        );
      } catch (err) {
        console.error("Failed to add card:", err);
      }
    })();
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    setBoard((prev) => {
      if (!prev) return prev;
      const nextCards = Object.fromEntries(Object.entries(prev.cards).filter(([id]) => id !== cardId));
      return {
        ...prev,
        cards: nextCards,
        columns: prev.columns.map((c) =>
          c.id === columnId ? { ...c, cardIds: c.cardIds.filter((id) => id !== cardId) } : c
        ),
      };
    });

    void fetch(`/api/cards/${fromCardId(cardId)}`, {
      method: "DELETE",
      credentials: "include",
    }).then((r) => {
      if (r.status === 401) onUnauthenticated();
    }).catch((err) => {
      console.error("Failed to delete card:", err);
    });
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                Focus
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                One board. Five columns. Zero clutter.
              </p>
            </div>
          </div>
          {board && (
            <div className="flex flex-wrap items-center gap-4">
              {board.columns.map((column) => (
                <div
                  key={column.id}
                  className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
                >
                  <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                  {column.title}
                </div>
              ))}
            </div>
          )}
        </header>

        {isLoading && !board && (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--gray-text)]">
            Loading board…
          </div>
        )}

        {!isLoading && error && !board && (
          <div className="flex flex-1 items-center justify-center text-sm text-red-600">
            {error}
          </div>
        )}

        {board && (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <section className="grid flex-1 gap-6 lg:grid-cols-5">
                {board.columns.map((column) => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    cards={column.cardIds.map((cardId) => board.cards[cardId])}
                    onRename={handleRenameColumn}
                    onAddCard={handleAddCard}
                    onDeleteCard={handleDeleteCard}
                    isHighlighted={overColumnId === column.id}
                  />
                ))}
              </section>
              <DragOverlay>
                {activeCard ? (
                  <div className="w-[260px]">
                    <KanbanCardPreview card={activeCard} />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
            <AISidebar onBoardUpdated={() => void loadBoard()} />
          </div>
        )}
      </main>
    </div>
  );
};
