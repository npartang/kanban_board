import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { AISidebar } from "@/components/AISidebar";

describe("AISidebar", () => {
  beforeEach(() => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
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

  it("shows an error message when the fetch fails", async () => {
    (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error("network error"));
    const onBoardUpdated = vi.fn();
    render(<AISidebar onBoardUpdated={onBoardUpdated} />);

    await userEvent.type(screen.getByPlaceholderText(/ask the assistant/i), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toBeInTheDocument()
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/unable to contact ai/i);
    expect(onBoardUpdated).not.toHaveBeenCalled();
  });

  it("shows an error message when the server returns non-ok", async () => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    render(<AISidebar onBoardUpdated={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText(/ask the assistant/i), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/unable to contact ai/i)
    );
  });
});
