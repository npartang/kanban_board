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
import { SortableContext, horizontalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { AISidebar } from "@/components/AISidebar";
import { BoardSelector, type BoardSummary } from "@/components/BoardSelector";
import { CardDetailModal, type CardUpdates } from "@/components/CardDetailModal";
import { KeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { moveCard, type BoardData, type CardComment, type ChecklistItem, type Priority } from "@/lib/kanban";
import { useKeyboardShortcuts, type ShortcutHandler } from "@/lib/useKeyboardShortcuts";
import { useAuth } from "@/lib/auth-context";

type ApiColumn = { id: number; title: string; position: number; wip_limit: number | null };
type ApiCard = { id: number; column_id: number; title: string; details: string | null; priority: string; due_date: string | null; labels: string[]; position: number; checklist_total?: number; checklist_done?: number };
type ApiBoard = { id: number; name: string; columns: ApiColumn[]; cards: ApiCard[] };

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
  const sortedColumns = [...apiBoard.columns].sort((a, b) => a.position - b.position);
  const cardsByColumn: Record<number, ApiCard[]> = {};
  for (const card of apiBoard.cards) {
    (cardsByColumn[card.column_id] ??= []).push(card);
  }
  const columns = sortedColumns.map((column) => ({
    id: toColumnId(column.id),
    title: column.title,
    cardIds: (cardsByColumn[column.id] ?? [])
      .sort((a, b) => a.position - b.position)
      .map((card) => toCardId(card.id)),
    wipLimit: column.wip_limit ?? null,
  }));
  const cards: BoardData["cards"] = {};
  for (const card of apiBoard.cards) {
    const id = toCardId(card.id);
    cards[id] = {
      id,
      title: card.title,
      details: card.details ?? "No details yet.",
      priority: (card.priority || "medium") as Priority,
      dueDate: card.due_date,
      labels: card.labels ?? [],
      checklistTotal: card.checklist_total ?? 0,
      checklistDone: card.checklist_done ?? 0,
    };
  }
  return { columns, cards };
};

export const KanbanBoard = () => {
  const { onUnauthenticated } = useAuth();

  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [archivedBoards, setArchivedBoards] = useState<BoardSummary[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingCardComments, setEditingCardComments] = useState<CardComment[]>([]);
  const [editingCardChecklist, setEditingCardChecklist] = useState<ChecklistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showShortcuts, setShowShortcuts] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const renameTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ---- API helpers ----

  const apiFetch = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      const res = await fetch(url, { credentials: "include", ...init });
      if (res.status === 401) { onUnauthenticated(); throw new Error("unauthenticated"); }
      return res;
    },
    [onUnauthenticated]
  );

  // ---- Load board list ----

  const loadBoards = useCallback(async () => {
    try {
      const [activeRes, archivedRes] = await Promise.all([
        apiFetch("/api/boards"),
        apiFetch("/api/boards?archived=true"),
      ]);
      if (!activeRes.ok) return;
      const list = (await activeRes.json()) as BoardSummary[];
      setBoards(list);
      if (archivedRes.ok) {
        const archived = (await archivedRes.json()) as BoardSummary[];
        setArchivedBoards(archived);
      }
      return list;
    } catch {
      return undefined;
    }
  }, [apiFetch]);

  // ---- Load specific board ----

  const loadBoard = useCallback(
    async (boardId: number) => {
      setIsLoading(true);
      try {
        const res = await apiFetch(`/api/boards/${boardId}`);
        if (!res.ok) throw new Error(`Board load failed: ${res.status}`);
        const json: unknown = await res.json().catch(() => null);
        if (!isApiBoard(json)) throw new Error("Unexpected board shape");
        setBoard(toBoardData(json));
        setError(null);
      } catch (err) {
        if ((err as Error).message !== "unauthenticated") {
          setError("Unable to load board.");
        }
      } finally {
        setIsLoading(false);
      }
    },
    [apiFetch]
  );

  // prevBoardId tracks what was last loaded so the activeBoardId watcher skips
  // boards that were already loaded by the initial effect.
  const prevBoardId = useRef<number | null>(null);

  // ---- Initial load ----

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      try {
        const list = await loadBoards();

        if (!list || list.length === 0) {
          // Backward-compat: /api/board auto-creates the first board if none exist.
          const res = await apiFetch("/api/board");
          if (!res.ok) {
            setError("Unable to load board.");
            setIsLoading(false);
            return;
          }
          const json: unknown = await res.json().catch(() => null);
          if (isApiBoard(json)) {
            const api = json as ApiBoard;
            const summary: BoardSummary = { id: api.id, name: api.name };
            prevBoardId.current = api.id;  // prevent watcher from re-loading
            setBoards([summary]);
            setActiveBoardId(api.id);
            setBoard(toBoardData(api));
            setError(null);
            setIsLoading(false);
            return;
          }
          setError("Unable to load board.");
          setIsLoading(false);
          return;
        }

        // Normal path: let the activeBoardId watcher load the board.
        setActiveBoardId(list[0].id);
      } catch {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load board whenever activeBoardId changes (skips IDs already handled above).
  useEffect(() => {
    if (activeBoardId === null || activeBoardId === prevBoardId.current) return;
    prevBoardId.current = activeBoardId;
    void loadBoard(activeBoardId);
  }, [activeBoardId, loadBoard]);

  // ---- Board management ----

  const handleCreateBoard = async (name: string) => {
    const res = await apiFetch("/api/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return;
    const created = (await res.json()) as BoardSummary;
    setBoards((prev) => [...prev, created]);
    setActiveBoardId(created.id);
  };

  const handleDeleteBoard = async (id: number) => {
    const res = await apiFetch(`/api/boards/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    const archived = boards.find((b) => b.id === id);
    setBoards((prev) => {
      const next = prev.filter((b) => b.id !== id);
      if (activeBoardId === id) {
        if (next.length > 0) {
          setActiveBoardId(next[0].id);
        } else {
          setActiveBoardId(null);
          setBoard(null);
        }
      }
      return next;
    });
    if (archived) setArchivedBoards((prev) => [...prev, archived]);
  };

  const handleRestoreBoard = async (id: number) => {
    const res = await apiFetch(`/api/boards/${id}/restore`, { method: "POST" });
    if (!res.ok) return;
    const restored = archivedBoards.find((b) => b.id === id);
    setArchivedBoards((prev) => prev.filter((b) => b.id !== id));
    if (restored) setBoards((prev) => [...prev, restored]);
  };

  const handleRenameBoard = async (id: number, name: string) => {
    const res = await apiFetch(`/api/boards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return;
    setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, name } : b)));
  };

  const handleSelectBoard = (id: number) => {
    if (id === activeBoardId) return;
    setBoard(null);
    setActiveBoardId(id);
  };

  // ---- Column management ----

  const handleAddColumn = async (title: string) => {
    if (!activeBoardId) return;
    const res = await apiFetch(`/api/boards/${activeBoardId}/columns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return;
    const col = (await res.json()) as { id: number; title: string; position: number };
    setBoard((prev) =>
      prev
        ? {
            ...prev,
            columns: [
              ...prev.columns,
              { id: toColumnId(col.id), title: col.title, cardIds: [], wipLimit: null },
            ],
          }
        : prev
    );
  };


  // ---- DnD ----

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const cardsById = useMemo(() => board?.cards ?? {}, [board]);

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    if (id.startsWith("col-")) {
      setActiveColumnId(id);
      setActiveCardId(null);
    } else {
      setActiveCardId(id);
      setActiveColumnId(null);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    if (!board) return;
    const { active, over } = event;
    // Skip column-to-column drag (handled in handleDragEnd)
    if (String(active.id).startsWith("col-")) { setOverColumnId(null); return; }
    if (!over) { setOverColumnId(null); return; }
    const overId = String(over.id);
    const column =
      board.columns.find((c) => c.id === overId) ??
      board.columns.find((c) => c.cardIds.includes(overId));
    setOverColumnId(column?.id ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (!board) return;
    const { active, over } = event;
    setActiveCardId(null);
    setActiveColumnId(null);
    setOverColumnId(null);
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Column reorder
    if (activeId.startsWith("col-") && overId.startsWith("col-")) {
      const oldIndex = board.columns.findIndex((c) => c.id === activeId);
      const newIndex = board.columns.findIndex((c) => c.id === overId);
      if (oldIndex === -1 || newIndex === -1) return;
      const nextColumns = arrayMove(board.columns, oldIndex, newIndex);
      setBoard((prev) => prev ? { ...prev, columns: nextColumns } : prev);
      if (activeBoardId !== null) {
        void apiFetch(`/api/boards/${activeBoardId}/reorder-columns`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ column_ids: nextColumns.map((c) => fromColumnId(c.id)) }),
        }).catch((err) => console.error("Failed to persist column order:", err));
      }
      return;
    }

    // Card move
    const movedCardId = activeId;
    const nextColumns = moveCard(board.columns, movedCardId, overId);
    setBoard((prev) => prev ? { ...prev, columns: nextColumns } : prev);

    const targetColumn = nextColumns.find((c) => c.cardIds.includes(movedCardId));
    if (!targetColumn) return;
    const position = targetColumn.cardIds.indexOf(movedCardId);

    void apiFetch(`/api/cards/${fromCardId(movedCardId)}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_column_id: fromColumnId(targetColumn.id), position }),
    }).catch((err) => console.error("Failed to persist card move:", err));
  };

  // ---- Column handlers ----

  const handleRenameColumn = (columnId: string, title: string) => {
    setBoard((prev) =>
      prev
        ? { ...prev, columns: prev.columns.map((c) => c.id === columnId ? { ...c, title } : c) }
        : prev
    );

    const existing = renameTimers.current.get(columnId);
    if (existing) clearTimeout(existing);
    renameTimers.current.set(
      columnId,
      setTimeout(() => {
        renameTimers.current.delete(columnId);
        void apiFetch(`/api/columns/${fromColumnId(columnId)}/rename`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        }).catch((err) => console.error("Failed to persist column rename:", err));
      }, 400)
    );
  };

  // ---- Card handlers ----

  const handleAddCard = (columnId: string, title: string, details: string) => {
    void (async () => {
      try {
        const res = await apiFetch("/api/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ column_id: fromColumnId(columnId), title, details }),
        });
        if (!res.ok) throw new Error(`Create card failed: ${res.status}`);

        const json = (await res.json()) as ApiCard;
        const cardId = toCardId(json.id);
        setBoard((prev) =>
          prev
            ? {
                ...prev,
                cards: {
                  ...prev.cards,
                  [cardId]: {
                    id: cardId,
                    title: json.title,
                    details: json.details ?? "No details yet.",
                    priority: (json.priority || "medium") as Priority,
                    dueDate: json.due_date,
                    labels: json.labels ?? [],
                    checklistTotal: 0,
                    checklistDone: 0,
                  },
                },
                columns: prev.columns.map((c) =>
                  fromColumnId(c.id) === json.column_id ? { ...c, cardIds: [...c.cardIds, cardId] } : c
                ),
              }
            : prev
        );
      } catch (err) {
        console.error("Failed to add card:", err);
      }
    })();
  };

  const handleEditCard = (cardId: string) => {
    setEditingCardId(cardId);
    setEditingCardComments([]);
    setEditingCardChecklist([]);
    const numId = fromCardId(cardId);
    void Promise.all([
      apiFetch(`/api/cards/${numId}/comments`).then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as Array<{ id: number; card_id: number; body: string; created_at: string }>;
        setEditingCardComments(data.map((c) => ({ id: c.id, cardId: c.card_id, body: c.body, createdAt: c.created_at })));
      }),
      apiFetch(`/api/cards/${numId}/checklist`).then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as Array<{ id: number; card_id: number; text: string; is_checked: boolean; position: number }>;
        setEditingCardChecklist(data.map((i) => ({ id: i.id, cardId: i.card_id, text: i.text, isChecked: i.is_checked, position: i.position })));
      }),
    ]).catch(() => {});
  };

  const handleSaveCard = useCallback(
    async (updates: CardUpdates) => {
      if (!editingCardId) throw new Error("No card selected");
      const numId = fromCardId(editingCardId);
      const body: Record<string, unknown> = {};
      if (updates.title !== undefined) body.title = updates.title;
      if (updates.details !== undefined) body.details = updates.details;
      if (updates.priority !== undefined) body.priority = updates.priority;
      if ("dueDate" in updates) body.due_date = updates.dueDate ?? "";
      if (updates.labels !== undefined) body.labels = updates.labels;

      const res = await apiFetch(`/api/cards/${numId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);

      const updated = (await res.json()) as ApiCard;
      const cid = editingCardId;
      setBoard((prev) =>
        prev
          ? {
              ...prev,
              cards: {
                ...prev.cards,
                [cid]: {
                  id: cid,
                  title: updated.title,
                  details: updated.details ?? "No details yet.",
                  priority: (updated.priority || "medium") as Priority,
                  dueDate: updated.due_date,
                  labels: updated.labels ?? [],
                  checklistTotal: prev.cards[cid]?.checklistTotal ?? 0,
                  checklistDone: prev.cards[cid]?.checklistDone ?? 0,
                },
              },
            }
          : prev
      );
    },
    [editingCardId, apiFetch]
  );

  const handleMoveCardFromModal = useCallback(
    (targetColumnId: string) => {
      if (!editingCardId || !board) return;
      const cardId = editingCardId;
      const currentColumn = board.columns.find((c) => c.cardIds.includes(cardId));
      if (!currentColumn || currentColumn.id === targetColumnId) return;
      const targetColumn = board.columns.find((c) => c.id === targetColumnId);
      if (!targetColumn) return;
      const position = targetColumn.cardIds.length;

      setBoard((prev) =>
        prev
          ? {
              ...prev,
              columns: prev.columns.map((c) => {
                if (c.id === currentColumn.id) return { ...c, cardIds: c.cardIds.filter((id) => id !== cardId) };
                if (c.id === targetColumnId) return { ...c, cardIds: [...c.cardIds, cardId] };
                return c;
              }),
            }
          : prev
      );

      void apiFetch(`/api/cards/${fromCardId(cardId)}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_column_id: fromColumnId(targetColumnId), position }),
      }).catch((err) => console.error("Failed to move card:", err));
    },
    [editingCardId, board, apiFetch]
  );

  const handleAddComment = useCallback(
    async (body: string): Promise<CardComment> => {
      if (!editingCardId) throw new Error("No card selected");
      const numId = fromCardId(editingCardId);
      const res = await apiFetch(`/api/cards/${numId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error(`Add comment failed: ${res.status}`);
      const data = (await res.json()) as { id: number; card_id: number; body: string; created_at: string };
      const comment: CardComment = { id: data.id, cardId: data.card_id, body: data.body, createdAt: data.created_at };
      setEditingCardComments((prev) => [...prev, comment]);
      return comment;
    },
    [editingCardId, apiFetch]
  );

  const handleDeleteComment = useCallback(
    (commentId: number) => {
      setEditingCardComments((prev) => prev.filter((c) => c.id !== commentId));
      void apiFetch(`/api/comments/${commentId}`, { method: "DELETE" }).catch((err) =>
        console.error("Failed to delete comment:", err)
      );
    },
    [apiFetch]
  );

  const handleAddChecklistItem = useCallback(
    async (text: string): Promise<ChecklistItem> => {
      if (!editingCardId) throw new Error("No card selected");
      const numId = fromCardId(editingCardId);
      const res = await apiFetch(`/api/cards/${numId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`Add checklist item failed: ${res.status}`);
      const data = (await res.json()) as { id: number; card_id: number; text: string; is_checked: boolean; position: number };
      const item: ChecklistItem = { id: data.id, cardId: data.card_id, text: data.text, isChecked: data.is_checked, position: data.position };
      setEditingCardChecklist((prev) => [...prev, item]);
      setBoard((prev) => {
        if (!prev || !editingCardId) return prev;
        return {
          ...prev,
          cards: {
            ...prev.cards,
            [editingCardId]: { ...prev.cards[editingCardId], checklistTotal: (prev.cards[editingCardId]?.checklistTotal ?? 0) + 1 },
          },
        };
      });
      return item;
    },
    [editingCardId, apiFetch]
  );

  const handleToggleChecklistItem = useCallback(
    (itemId: number, isChecked: boolean) => {
      setEditingCardChecklist((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, isChecked } : i))
      );
      setBoard((prev) => {
        if (!prev || !editingCardId) return prev;
        const card = prev.cards[editingCardId];
        if (!card) return prev;
        const delta = isChecked ? 1 : -1;
        return {
          ...prev,
          cards: { ...prev.cards, [editingCardId]: { ...card, checklistDone: Math.max(0, (card.checklistDone ?? 0) + delta) } },
        };
      });
      void apiFetch(`/api/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_checked: isChecked }),
      }).catch((err) => console.error("Failed to toggle checklist item:", err));
    },
    [editingCardId, apiFetch]
  );

  const handleDeleteChecklistItem = useCallback(
    (itemId: number) => {
      const item = editingCardChecklist.find((i) => i.id === itemId);
      setEditingCardChecklist((prev) => prev.filter((i) => i.id !== itemId));
      setBoard((prev) => {
        if (!prev || !editingCardId) return prev;
        const card = prev.cards[editingCardId];
        if (!card) return prev;
        const doneDelta = item?.isChecked ? -1 : 0;
        return {
          ...prev,
          cards: {
            ...prev.cards,
            [editingCardId]: {
              ...card,
              checklistTotal: Math.max(0, (card.checklistTotal ?? 0) - 1),
              checklistDone: Math.max(0, (card.checklistDone ?? 0) + doneDelta),
            },
          },
        };
      });
      void apiFetch(`/api/checklist/${itemId}`, { method: "DELETE" }).catch((err) =>
        console.error("Failed to delete checklist item:", err)
      );
    },
    [editingCardId, editingCardChecklist, apiFetch]
  );

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
    void apiFetch(`/api/cards/${fromCardId(cardId)}`, { method: "DELETE" }).catch((err) =>
      console.error("Failed to delete card:", err)
    );
  };

  const boardStats = useMemo(() => {
    if (!board) return null;
    const today = new Date().toISOString().split("T")[0];
    const allCards = Object.values(board.cards);
    const total = allCards.length;
    const overdue = allCards.filter((c) => c.dueDate && c.dueDate < today).length;
    const byPriority = { urgent: 0, high: 0, medium: 0, low: 0 };
    for (const c of allCards) byPriority[c.priority] = (byPriority[c.priority] ?? 0) + 1;
    return { total, overdue, byPriority };
  }, [board]);

  const filteredCardIds = useMemo(() => {
    if (!board || !searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return new Set(
      Object.values(board.cards)
        .filter(
          (c) =>
            c.title.toLowerCase().includes(q) ||
            c.details.toLowerCase().includes(q) ||
            c.labels.some((l) => l.toLowerCase().includes(q))
        )
        .map((c) => c.id)
    );
  }, [board, searchQuery]);

  const shortcuts: ShortcutHandler[] = useMemo(() => [
    { key: "?", description: "Show keyboard shortcuts", handler: () => setShowShortcuts((v) => !v) },
    { key: "/", description: "Focus search", handler: () => searchRef.current?.focus() },
    { key: "c", description: "Add column", handler: () => { if (!editingCardId) { setAddingColumn(true); setNewColumnTitle(""); } } },
    { key: "Escape", description: "Close overlay", handler: () => { setShowShortcuts(false); } },
  ], [editingCardId]);

  useKeyboardShortcuts(shortcuts, !editingCardId || showShortcuts);

  const activeCard = activeCardId ? cardsById[activeCardId] : null;
  const activeBoard = boards.find((b) => b.id === activeBoardId);

  return (
    <div className="relative overflow-hidden">
      {showShortcuts && (
        <KeyboardShortcutsHelp shortcuts={shortcuts} onClose={() => setShowShortcuts(false)} />
      )}

      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Project Management
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                {activeBoard?.name ?? "Kanban Studio"}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Rename columns, drag cards between stages, and capture quick notes. Double-click a
                board tab to rename it.
              </p>
            </div>
            <div className="flex flex-wrap items-start gap-3">
              <button
                type="button"
                onClick={() => setShowShortcuts(true)}
                className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--gray-text)] hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
                title="Keyboard shortcuts (?)"
                aria-label="Show keyboard shortcuts"
              >
                ?
              </button>
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Boards
                </p>
                <p className="mt-1 text-lg font-semibold text-[var(--primary-blue)]">
                  {boards.length}
                </p>
              </div>
              {boardStats && (
                <>
                  <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                      Cards
                    </p>
                    <p className="mt-1 text-lg font-semibold text-[var(--navy-dark)]">
                      {boardStats.total}
                    </p>
                  </div>
                  {boardStats.overdue > 0 && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-500">
                        Overdue
                      </p>
                      <p className="mt-1 text-lg font-semibold text-red-600">
                        {boardStats.overdue}
                      </p>
                    </div>
                  )}
                  {boardStats.byPriority.urgent > 0 && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-400">
                        Urgent
                      </p>
                      <p className="mt-1 text-lg font-semibold text-red-700">
                        {boardStats.byPriority.urgent}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <BoardSelector
            boards={boards}
            archivedBoards={archivedBoards}
            activeBoardId={activeBoardId}
            onSelect={handleSelectBoard}
            onCreate={handleCreateBoard}
            onArchive={handleDeleteBoard}
            onRename={handleRenameBoard}
            onRestore={handleRestoreBoard}
          />

          {board && (
            <div className="relative max-w-sm">
              <input
                ref={searchRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search cards…"
                className="w-full rounded-full border border-[var(--stroke)] bg-white py-2 pl-9 pr-4 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                aria-label="Search cards"
              />
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--gray-text)]">
                ⌕
              </span>
            </div>
          )}
        </header>

        {isLoading && !board && (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--gray-text)]">
            Loading board…
          </div>
        )}

        {!isLoading && error && !board && (
          <div className="flex flex-1 items-center justify-center text-sm text-red-600">{error}</div>
        )}

        {!isLoading && !error && !board && boards.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-sm text-[var(--gray-text)]">
            <p>No boards yet. Create your first one above.</p>
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
              <SortableContext
                items={board.columns.map((c) => c.id)}
                strategy={horizontalListSortingStrategy}
              >
                <section className="grid flex-1 gap-6 lg:grid-cols-5">
                  {board.columns.map((column) => (
                    <KanbanColumn
                      key={column.id}
                      column={column}
                      cards={column.cardIds
                        .filter((id) => !filteredCardIds || filteredCardIds.has(id))
                        .map((cardId) => board.cards[cardId])}
                      onRename={handleRenameColumn}
                      onAddCard={handleAddCard}
                      onDeleteCard={handleDeleteCard}
                      onEditCard={handleEditCard}
                      isHighlighted={overColumnId === column.id}
                    />
                  ))}
                </section>
              </SortableContext>
              <DragOverlay>
                {activeCard ? (
                  <div className="w-[260px]">
                    <KanbanCardPreview card={activeCard} />
                  </div>
                ) : activeColumnId && board ? (
                  <div className="w-[260px] rounded-3xl border-2 border-[var(--accent-yellow)] bg-[var(--surface-strong)] p-4 opacity-80 shadow-[var(--shadow)]">
                    <p className="font-display text-sm font-semibold text-[var(--navy-dark)]">
                      {board.columns.find((c) => c.id === activeColumnId)?.title ?? "Column"}
                    </p>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
            <div className="shrink-0">
              {!addingColumn ? (
                <button
                  type="button"
                  onClick={() => { setAddingColumn(true); setNewColumnTitle(""); }}
                  className="flex items-center gap-2 rounded-2xl border border-dashed border-[var(--stroke)] bg-white/60 px-4 py-3 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
                  aria-label="Add a column"
                >
                  + Add column
                </button>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const t = newColumnTitle.trim();
                    if (!t) return;
                    setAddingColumn(false);
                    await handleAddColumn(t);
                  }}
                  className="rounded-2xl border border-[var(--stroke)] bg-white p-4 shadow-[var(--shadow)]"
                >
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                    New column
                  </p>
                  <input
                    autoFocus
                    value={newColumnTitle}
                    onChange={(e) => setNewColumnTitle(e.target.value)}
                    placeholder="Column title"
                    className="w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
                    aria-label="New column title"
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="submit"
                      disabled={!newColumnTitle.trim()}
                      className="flex-1 rounded-full bg-[var(--primary-blue)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingColumn(false)}
                      className="flex-1 rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--gray-text)]"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
            {activeBoardId !== null && (
              <AISidebar onBoardUpdated={() => activeBoardId !== null && void loadBoard(activeBoardId)} />
            )}
          </div>
        )}
      </main>

      {editingCardId && board && (() => {
        const card = board.cards[editingCardId];
        const currentColumn = board.columns.find((c) => c.cardIds.includes(editingCardId));
        if (!card || !currentColumn) return null;
        return (
          <CardDetailModal
            card={card}
            currentColumnId={currentColumn.id}
            columns={board.columns}
            onClose={() => setEditingCardId(null)}
            onSave={handleSaveCard}
            onDelete={() => {
              const colId = currentColumn.id;
              const cid = editingCardId;
              setEditingCardId(null);
              handleDeleteCard(colId, cid);
            }}
            onMove={handleMoveCardFromModal}
            comments={editingCardComments}
            onAddComment={handleAddComment}
            onDeleteComment={handleDeleteComment}
            checklist={editingCardChecklist}
            onAddChecklistItem={handleAddChecklistItem}
            onToggleChecklistItem={handleToggleChecklistItem}
            onDeleteChecklistItem={handleDeleteChecklistItem}
          />
        );
      })()}
    </div>
  );
};
