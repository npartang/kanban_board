import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardDetailModal } from "./CardDetailModal";
import type { Card, Column } from "@/lib/kanban";

const mockCard: Card = {
  id: "card-1",
  title: "Test card",
  details: "Some description",
  priority: "medium",
  dueDate: "2026-06-15",
  labels: [],
};

const mockColumns: Column[] = [
  { id: "col-1", title: "Backlog", cardIds: ["card-1"] },
  { id: "col-2", title: "In Progress", cardIds: [] },
  { id: "col-3", title: "Done", cardIds: [] },
];

const defaultProps = {
  card: mockCard,
  currentColumnId: "col-1",
  columns: mockColumns,
  onClose: vi.fn(),
  onSave: vi.fn(),
  onDelete: vi.fn(),
  onMove: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CardDetailModal", () => {
  it("renders the card title and description", () => {
    render(<CardDetailModal {...defaultProps} />);
    expect(screen.getByDisplayValue("Test card")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Some description")).toBeInTheDocument();
  });

  it("renders priority buttons with the current priority selected", () => {
    render(<CardDetailModal {...defaultProps} />);
    const mediumButton = screen.getByRole("button", { name: /medium/i });
    expect(mediumButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /low/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("renders the due date input", () => {
    render(<CardDetailModal {...defaultProps} />);
    expect(screen.getByLabelText(/due date/i)).toHaveValue("2026-06-15");
  });

  it("renders the column selector with the current column selected", () => {
    render(<CardDetailModal {...defaultProps} />);
    const select = screen.getByRole("combobox", { name: /move to column/i });
    expect(select).toHaveValue("col-1");
    expect(screen.getByRole("option", { name: "Backlog" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "In Progress" })).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    render(<CardDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Cancel button is clicked", () => {
    render(<CardDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Escape key is pressed", () => {
    render(<CardDetailModal {...defaultProps} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it("disables Save when nothing has changed (not dirty)", () => {
    render(<CardDetailModal {...defaultProps} />);
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("enables Save after editing the title", async () => {
    const user = userEvent.setup();
    render(<CardDetailModal {...defaultProps} />);
    const titleInput = screen.getByDisplayValue("Test card");
    await user.clear(titleInput);
    await user.type(titleInput, "Updated title");
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });

  it("disables Save when title is cleared", async () => {
    const user = userEvent.setup();
    render(<CardDetailModal {...defaultProps} />);
    const titleInput = screen.getByDisplayValue("Test card");
    await user.clear(titleInput);
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("calls onSave with updated title on submit", async () => {
    const user = userEvent.setup();
    defaultProps.onSave.mockResolvedValue(undefined);
    render(<CardDetailModal {...defaultProps} />);
    const titleInput = screen.getByDisplayValue("Test card");
    await user.clear(titleInput);
    await user.type(titleInput, "New title");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(defaultProps.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: "New title" })
    );
  });

  it("calls onSave with updated priority", async () => {
    const user = userEvent.setup();
    defaultProps.onSave.mockResolvedValue(undefined);
    render(<CardDetailModal {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /urgent/i }));
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(defaultProps.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ priority: "urgent" })
    );
  });

  it("calls onSave with null due date when cleared", async () => {
    const user = userEvent.setup();
    defaultProps.onSave.mockResolvedValue(undefined);
    render(<CardDetailModal {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /clear/i }));
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(defaultProps.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: null })
    );
  });

  it("calls onClose after successful save", async () => {
    const user = userEvent.setup();
    defaultProps.onSave.mockResolvedValue(undefined);
    render(<CardDetailModal {...defaultProps} />);
    const titleInput = screen.getByLabelText("Card title");
    await user.clear(titleInput);
    await user.type(titleInput, "Updated");
    await user.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(defaultProps.onClose).toHaveBeenCalledOnce());
  });

  it("shows an error message when save fails", async () => {
    const user = userEvent.setup();
    defaultProps.onSave.mockRejectedValue(new Error("network error"));
    render(<CardDetailModal {...defaultProps} />);
    const titleInput = screen.getByLabelText("Card title");
    await user.clear(titleInput);
    await user.type(titleInput, "Updated");
    await user.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Failed to save changes")
    );
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it("shows delete confirmation when Delete card is clicked", async () => {
    const user = userEvent.setup();
    render(<CardDetailModal {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /delete card/i }));
    expect(screen.getByText(/delete this card\?/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /yes, delete/i })).toBeInTheDocument();
  });

  it("calls onDelete when confirmed", async () => {
    const user = userEvent.setup();
    render(<CardDetailModal {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /delete card/i }));
    await user.click(screen.getByRole("button", { name: /yes, delete/i }));
    expect(defaultProps.onDelete).toHaveBeenCalledOnce();
  });

  it("cancels delete confirmation", async () => {
    const user = userEvent.setup();
    render(<CardDetailModal {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /delete card/i }));
    // Two Cancel buttons are visible: one in the confirm section, one in the footer.
    // Click the first one (inside the confirm section).
    const cancelButtons = screen.getAllByRole("button", { name: /cancel/i });
    await user.click(cancelButtons[0]);
    expect(screen.queryByText(/delete this card\?/i)).not.toBeInTheDocument();
    expect(defaultProps.onDelete).not.toHaveBeenCalled();
  });

  it("calls onMove when column is changed", async () => {
    const user = userEvent.setup();
    render(<CardDetailModal {...defaultProps} />);
    const select = screen.getByRole("combobox", { name: /move to column/i });
    await user.selectOptions(select, "col-2");
    expect(defaultProps.onMove).toHaveBeenCalledWith("col-2");
  });

  it("updates the column selector to show the newly selected column", async () => {
    const user = userEvent.setup();
    render(<CardDetailModal {...defaultProps} />);
    const select = screen.getByRole("combobox", { name: /move to column/i });
    await user.selectOptions(select, "col-2");
    expect(select).toHaveValue("col-2");
  });

  it("treats 'No details yet.' as empty description", () => {
    const card: Card = { ...mockCard, details: "No details yet." };
    render(<CardDetailModal {...defaultProps} card={card} />);
    expect(screen.getByLabelText(/card description/i)).toHaveValue("");
  });

  it("calls onClose when backdrop is clicked", () => {
    render(<CardDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByRole("dialog"));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });
});
