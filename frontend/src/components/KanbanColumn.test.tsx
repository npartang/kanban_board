import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanColumn } from "./KanbanColumn";
import type { Card, Column } from "@/lib/kanban";

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    setNodeRef: vi.fn(),
    attributes: {},
    listeners: {},
    transform: null,
    transition: null,
    isDragging: false,
    isOver: false,
  }),
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: {},
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

vi.mock("@/components/KanbanCard", () => ({
  KanbanCard: ({ card }: { card: Card }) => <div data-testid={`card-${card.id}`}>{card.title}</div>,
}));

vi.mock("@/components/NewCardForm", () => ({
  NewCardForm: () => <div />,
}));

const mockColumn: Column = {
  id: "col-1",
  title: "Backlog",
  cardIds: ["card-1", "card-2", "card-3"],
  wipLimit: null,
};

const makeCard = (id: string, title: string, priority: Card["priority"], dueDate: string | null = null): Card => ({
  id,
  title,
  priority,
  dueDate,
  details: "",
  labels: [],
});

const cards: Card[] = [
  makeCard("card-1", "Medium task", "medium", "2026-06-15"),
  makeCard("card-2", "Urgent task", "urgent", "2026-05-01"),
  makeCard("card-3", "Low task", "low", "2026-08-01"),
];

const defaultProps = {
  column: mockColumn,
  cards,
  onRename: vi.fn(),
  onAddCard: vi.fn(),
  onDeleteCard: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("KanbanColumn", () => {
  it("renders column title", () => {
    render(<KanbanColumn {...defaultProps} />);
    expect(screen.getByDisplayValue("Backlog")).toBeInTheDocument();
  });

  it("renders all cards in default order", () => {
    render(<KanbanColumn {...defaultProps} />);
    const cardEls = screen.getAllByTestId(/card-/);
    expect(cardEls[0]).toHaveTextContent("Medium task");
    expect(cardEls[1]).toHaveTextContent("Urgent task");
    expect(cardEls[2]).toHaveTextContent("Low task");
  });

  it("sorts cards by priority when Priority ↑ is selected", async () => {
    const user = userEvent.setup();
    render(<KanbanColumn {...defaultProps} />);
    await user.selectOptions(screen.getByRole("combobox", { name: /sort cards/i }), "priority");
    const cardEls = screen.getAllByTestId(/card-/);
    expect(cardEls[0]).toHaveTextContent("Urgent task");
    expect(cardEls[1]).toHaveTextContent("Medium task");
    expect(cardEls[2]).toHaveTextContent("Low task");
  });

  it("sorts cards by due date ascending", async () => {
    const user = userEvent.setup();
    render(<KanbanColumn {...defaultProps} />);
    await user.selectOptions(screen.getByRole("combobox", { name: /sort cards/i }), "due-asc");
    const cardEls = screen.getAllByTestId(/card-/);
    expect(cardEls[0]).toHaveTextContent("Urgent task"); // 2026-05-01
    expect(cardEls[1]).toHaveTextContent("Medium task"); // 2026-06-15
    expect(cardEls[2]).toHaveTextContent("Low task");    // 2026-08-01
  });

  it("sorts cards by due date descending", async () => {
    const user = userEvent.setup();
    render(<KanbanColumn {...defaultProps} />);
    await user.selectOptions(screen.getByRole("combobox", { name: /sort cards/i }), "due-desc");
    const cardEls = screen.getAllByTestId(/card-/);
    expect(cardEls[0]).toHaveTextContent("Low task");    // 2026-08-01
    expect(cardEls[1]).toHaveTextContent("Medium task"); // 2026-06-15
    expect(cardEls[2]).toHaveTextContent("Urgent task"); // 2026-05-01
  });

  it("cards without due dates sort after cards with due dates", async () => {
    const user = userEvent.setup();
    const cardsWithNull: Card[] = [
      makeCard("card-1", "No due date", "medium", null),
      makeCard("card-2", "Has due date", "medium", "2026-05-01"),
    ];
    render(<KanbanColumn {...defaultProps} cards={cardsWithNull} />);
    await user.selectOptions(screen.getByRole("combobox", { name: /sort cards/i }), "due-asc");
    const cardEls = screen.getAllByTestId(/card-/);
    expect(cardEls[0]).toHaveTextContent("Has due date");
    expect(cardEls[1]).toHaveTextContent("No due date");
  });

  it("shows WIP limit warning when over limit", () => {
    const column: Column = { ...mockColumn, wipLimit: 2 };
    render(<KanbanColumn {...defaultProps} column={column} />);
    expect(screen.getByText(/⚠/)).toBeInTheDocument();
  });
});
