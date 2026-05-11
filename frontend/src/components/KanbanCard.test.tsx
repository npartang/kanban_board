import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KanbanCard } from "./KanbanCard";
import type { Card } from "@/lib/kanban";

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

const mockCard: Card = {
  id: "card-1",
  title: "Build login flow",
  details: "Implement OAuth and session handling",
  priority: "high",
  dueDate: "2026-12-31",
  labels: ["Auth", "Backend"],
  checklistTotal: 0,
  checklistDone: 0,
};

const defaultProps = {
  card: mockCard,
  onDelete: vi.fn(),
  onEdit: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("KanbanCard", () => {
  it("renders the card title", () => {
    render(<KanbanCard {...defaultProps} />);
    expect(screen.getByText("Build login flow")).toBeInTheDocument();
  });

  it("renders the card details", () => {
    render(<KanbanCard {...defaultProps} />);
    expect(screen.getByText("Implement OAuth and session handling")).toBeInTheDocument();
  });

  it("renders the priority badge", () => {
    render(<KanbanCard {...defaultProps} />);
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("renders due date", () => {
    render(<KanbanCard {...defaultProps} />);
    expect(screen.getByText(/Dec 31/)).toBeInTheDocument();
  });

  it("renders labels", () => {
    render(<KanbanCard {...defaultProps} />);
    expect(screen.getByText("Auth")).toBeInTheDocument();
    expect(screen.getByText("Backend")).toBeInTheDocument();
  });

  it("calls onEdit when Edit button is clicked", () => {
    render(<KanbanCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /edit build login flow/i }));
    expect(defaultProps.onEdit).toHaveBeenCalledWith("card-1");
  });

  it("calls onDelete when Remove button is clicked", () => {
    render(<KanbanCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /delete build login flow/i }));
    expect(defaultProps.onDelete).toHaveBeenCalledWith("card-1");
  });

  it("does not render Edit button when onEdit is not provided", () => {
    render(<KanbanCard card={mockCard} onDelete={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  });

  it("shows overdue styling for past due dates", () => {
    const overdueCard: Card = { ...mockCard, dueDate: "2020-01-01" };
    render(<KanbanCard {...defaultProps} card={overdueCard} />);
    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
  });

  it("shows 'Today' for cards due today", () => {
    const today = new Date().toISOString().split("T")[0];
    const todayCard: Card = { ...mockCard, dueDate: today };
    render(<KanbanCard {...defaultProps} card={todayCard} />);
    expect(screen.getByText(/today/i)).toBeInTheDocument();
  });

  it("shows 'Soon' for cards due within a week", () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 3);
    const soonDate = soon.toISOString().split("T")[0];
    const soonCard: Card = { ...mockCard, dueDate: soonDate };
    render(<KanbanCard {...defaultProps} card={soonCard} />);
    expect(screen.getByText(/soon/i)).toBeInTheDocument();
  });

  it("does not show due date when dueDate is null", () => {
    const noDateCard: Card = { ...mockCard, dueDate: null };
    render(<KanbanCard {...defaultProps} card={noDateCard} />);
    expect(screen.queryByText(/due/i)).not.toBeInTheDocument();
  });

  it("does not render details when details is 'No details yet.'", () => {
    const noDetails: Card = { ...mockCard, details: "No details yet." };
    render(<KanbanCard {...defaultProps} card={noDetails} />);
    expect(screen.queryByText("No details yet.")).not.toBeInTheDocument();
  });

  it("does not render label pills when labels array is empty", () => {
    const noLabels: Card = { ...mockCard, labels: [] };
    render(<KanbanCard {...defaultProps} card={noLabels} />);
    expect(screen.queryByText("Auth")).not.toBeInTheDocument();
  });

  it("renders urgent priority badge correctly", () => {
    const urgent: Card = { ...mockCard, priority: "urgent" };
    render(<KanbanCard {...defaultProps} card={urgent} />);
    expect(screen.getByText("Urgent")).toBeInTheDocument();
  });
});
