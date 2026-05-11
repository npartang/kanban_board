import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardDetailModal } from "./CardDetailModal";
import type { Card, CardComment, ChecklistItem, Column } from "@/lib/kanban";

const mockCard: Card = {
  id: "card-1",
  title: "Test card",
  details: "Some description",
  priority: "medium",
  dueDate: "2026-06-15",
  labels: [],
  checklistTotal: 0,
  checklistDone: 0,
};

const mockColumns: Column[] = [
  { id: "col-1", title: "Backlog", cardIds: ["card-1"], wipLimit: null },
  { id: "col-2", title: "In Progress", cardIds: [], wipLimit: null },
  { id: "col-3", title: "Done", cardIds: [], wipLimit: null },
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

  describe("comments", () => {
    const mockComment: CardComment = {
      id: 1,
      cardId: 1,
      body: "This is a comment",
      createdAt: "2026-05-01T10:00:00",
    };

    it("does not show comments section when onAddComment is not provided", () => {
      render(<CardDetailModal {...defaultProps} />);
      expect(screen.queryByLabelText(/new comment/i)).not.toBeInTheDocument();
    });

    it("shows comments section when onAddComment is provided", () => {
      render(<CardDetailModal {...defaultProps} onAddComment={vi.fn()} />);
      expect(screen.getByLabelText(/new comment/i)).toBeInTheDocument();
    });

    it("renders existing comments", () => {
      render(
        <CardDetailModal
          {...defaultProps}
          comments={[mockComment]}
          onAddComment={vi.fn()}
        />
      );
      expect(screen.getByText("This is a comment")).toBeInTheDocument();
    });

    it("calls onAddComment when Post button clicked", async () => {
      const user = userEvent.setup();
      const onAddComment = vi.fn().mockResolvedValue(mockComment);
      render(<CardDetailModal {...defaultProps} onAddComment={onAddComment} />);
      await user.type(screen.getByLabelText(/new comment/i), "Hello world");
      await user.click(screen.getByRole("button", { name: /post/i }));
      expect(onAddComment).toHaveBeenCalledWith("Hello world");
    });

    it("calls onAddComment when Enter is pressed in comment input", async () => {
      const user = userEvent.setup();
      const onAddComment = vi.fn().mockResolvedValue(mockComment);
      render(<CardDetailModal {...defaultProps} onAddComment={onAddComment} />);
      await user.type(screen.getByLabelText(/new comment/i), "Quick note{Enter}");
      expect(onAddComment).toHaveBeenCalledWith("Quick note");
    });

    it("clears comment input after posting", async () => {
      const user = userEvent.setup();
      const onAddComment = vi.fn().mockResolvedValue(mockComment);
      render(<CardDetailModal {...defaultProps} onAddComment={onAddComment} />);
      const input = screen.getByLabelText(/new comment/i);
      await user.type(input, "Temp comment");
      await user.click(screen.getByRole("button", { name: /post/i }));
      await waitFor(() => expect(input).toHaveValue(""));
    });

    it("Post button is disabled when input is empty", () => {
      render(<CardDetailModal {...defaultProps} onAddComment={vi.fn()} />);
      expect(screen.getByRole("button", { name: /post/i })).toBeDisabled();
    });

    it("calls onDeleteComment when delete button is clicked", async () => {
      const user = userEvent.setup();
      const onDeleteComment = vi.fn();
      render(
        <CardDetailModal
          {...defaultProps}
          comments={[mockComment]}
          onAddComment={vi.fn()}
          onDeleteComment={onDeleteComment}
        />
      );
      await user.click(screen.getByRole("button", { name: /delete comment/i }));
      expect(onDeleteComment).toHaveBeenCalledWith(1);
    });

    it("shows comment count in section header", () => {
      render(
        <CardDetailModal
          {...defaultProps}
          comments={[mockComment]}
          onAddComment={vi.fn()}
        />
      );
      expect(screen.getByText(/comments \(1\)/i)).toBeInTheDocument();
    });
  });

  describe("checklist", () => {
    const mockItem: ChecklistItem = {
      id: 1,
      cardId: 1,
      text: "Write tests",
      isChecked: false,
      position: 0,
    };

    it("does not show checklist section when onAddChecklistItem is not provided", () => {
      render(<CardDetailModal {...defaultProps} />);
      expect(screen.queryByLabelText(/new checklist item/i)).not.toBeInTheDocument();
    });

    it("shows checklist section when onAddChecklistItem is provided", () => {
      render(<CardDetailModal {...defaultProps} onAddChecklistItem={vi.fn()} />);
      expect(screen.getByLabelText(/new checklist item/i)).toBeInTheDocument();
    });

    it("renders existing checklist items", () => {
      render(
        <CardDetailModal
          {...defaultProps}
          checklist={[mockItem]}
          onAddChecklistItem={vi.fn()}
        />
      );
      expect(screen.getByLabelText("Write tests")).toBeInTheDocument();
    });

    it("calls onAddChecklistItem when Add button clicked", async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn().mockResolvedValue(mockItem);
      render(<CardDetailModal {...defaultProps} onAddChecklistItem={onAdd} />);
      await user.type(screen.getByLabelText(/new checklist item/i), "New task");
      await user.click(screen.getByRole("button", { name: /add checklist item/i }));
      expect(onAdd).toHaveBeenCalledWith("New task");
    });

    it("calls onAddChecklistItem when Enter pressed", async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn().mockResolvedValue(mockItem);
      render(<CardDetailModal {...defaultProps} onAddChecklistItem={onAdd} />);
      await user.type(screen.getByLabelText(/new checklist item/i), "Quick task{Enter}");
      expect(onAdd).toHaveBeenCalledWith("Quick task");
    });

    it("calls onToggleChecklistItem when checkbox is clicked", async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();
      render(
        <CardDetailModal
          {...defaultProps}
          checklist={[mockItem]}
          onAddChecklistItem={vi.fn()}
          onToggleChecklistItem={onToggle}
        />
      );
      await user.click(screen.getByRole("checkbox", { name: "Write tests" }));
      expect(onToggle).toHaveBeenCalledWith(1, true);
    });

    it("calls onDeleteChecklistItem when delete clicked", async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      render(
        <CardDetailModal
          {...defaultProps}
          checklist={[mockItem]}
          onAddChecklistItem={vi.fn()}
          onDeleteChecklistItem={onDelete}
        />
      );
      await user.click(screen.getByRole("button", { name: /delete checklist item write tests/i }));
      expect(onDelete).toHaveBeenCalledWith(1);
    });

    it("shows progress bar when checklist has items", () => {
      const checkedItem: ChecklistItem = { ...mockItem, id: 2, isChecked: true };
      render(
        <CardDetailModal
          {...defaultProps}
          checklist={[mockItem, checkedItem]}
          onAddChecklistItem={vi.fn()}
        />
      );
      expect(screen.getByRole("progressbar", { name: /checklist progress/i })).toBeInTheDocument();
    });

    it("shows checklist count (done/total)", () => {
      const checkedItem: ChecklistItem = { ...mockItem, id: 2, isChecked: true };
      render(
        <CardDetailModal
          {...defaultProps}
          checklist={[mockItem, checkedItem]}
          onAddChecklistItem={vi.fn()}
        />
      );
      expect(screen.getByText(/1\/2/)).toBeInTheDocument();
    });
  });
});
