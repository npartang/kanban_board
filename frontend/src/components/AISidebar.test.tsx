import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { AISidebar } from "@/components/AISidebar";

describe("AISidebar", () => {
  beforeEach(() => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "AI reply", operations: [] }),
    } as Response);
  });

  it("sends a message and shows AI reply, then calls onBoardUpdated", async () => {
    const onBoardUpdated = vi.fn();
    render(<AISidebar onBoardUpdated={onBoardUpdated} />);

    const textbox = screen.getByPlaceholderText(/ask the assistant/i);
    await userEvent.type(textbox, "What should I do next?");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(screen.getByText("AI reply")).toBeInTheDocument()
    );
    expect(onBoardUpdated).toHaveBeenCalled();
  });
});

