import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";

const mockBoardDetail = {
  id: 1,
  name: "My Board",
  columns: [
    { id: 1, title: "Backlog", position: 0 },
    { id: 2, title: "Discovery", position: 1 },
    { id: 3, title: "In Progress", position: 2 },
    { id: 4, title: "Review", position: 3 },
    { id: 5, title: "Done", position: 4 },
  ],
  cards: [],
};

const mockBoardList = [{ id: 1, name: "My Board" }];

type FetchInput = RequestInfo | URL;

const setupFetchMock = () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: FetchInput, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.endsWith("/api/boards") && method === "GET") {
        return Promise.resolve({
          ok: true, status: 200, json: async () => mockBoardList,
        } as Response);
      }

      if (/\/api\/boards\/1$/.test(url) && method === "GET") {
        return Promise.resolve({
          ok: true, status: 200, json: async () => mockBoardDetail,
        } as Response);
      }

      if (url.endsWith("/api/board") && method === "GET") {
        return Promise.resolve({
          ok: true, status: 200, json: async () => mockBoardDetail,
        } as Response);
      }

      if (url.endsWith("/api/columns/1/rename") && method === "POST") {
        return Promise.resolve({ ok: true, status: 204, json: async () => ({}) } as Response);
      }

      if (url.endsWith("/api/cards") && method === "POST") {
        const body = init?.body ? (JSON.parse(init.body as string) as { column_id?: number; title?: string; details?: string; priority?: string }) : {};
        return Promise.resolve({
          ok: true, status: 201,
          json: async () => ({
            id: 101,
            column_id: body.column_id ?? 1,
            title: body.title ?? "",
            details: body.details ?? null,
            priority: body.priority ?? "medium",
            due_date: null,
            position: 0,
          }),
        } as Response);
      }

      if (/\/api\/boards\/\d+\/columns$/.test(url) && method === "POST") {
        const body = init?.body ? (JSON.parse(init.body as string) as { title?: string }) : {};
        return Promise.resolve({
          ok: true, status: 201,
          json: async () => ({ id: 6, title: body.title ?? "New Column", position: 5 }),
        } as Response);
      }

      if (/\/api\/columns\/\d+$/.test(url) && method === "DELETE") {
        return Promise.resolve({ ok: true, status: 204, json: async () => ({}) } as Response);
      }

      if (/\/api\/cards\/\d+$/.test(url) && method === "DELETE") {
        return Promise.resolve({ ok: true, status: 204, json: async () => ({}) } as Response);
      }

      if (/\/api\/cards\/\d+\/move$/.test(url) && method === "POST") {
        return Promise.resolve({ ok: true, status: 204, json: async () => ({}) } as Response);
      }

      return Promise.reject(new Error(`Unexpected fetch call: ${method} ${url}`));
    })
  );
};

describe("KanbanBoard", () => {
  beforeEach(() => {
    setupFetchMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an error when the board cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response)
    );

    render(<KanbanBoard />);
    await screen.findByText(/unable to load board/i);
  });

  it("renders five columns", async () => {
    render(<KanbanBoard />);
    const columns = await screen.findAllByTestId(/column-/i);
    expect(columns).toHaveLength(5);
  });

  it("renames a column", async () => {
    render(<KanbanBoard />);
    const column = (await screen.findAllByTestId(/column-/i))[0];
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("adds a new column via the Add column form", async () => {
    render(<KanbanBoard />);
    await screen.findAllByTestId(/column-/i);

    await userEvent.click(screen.getByRole("button", { name: /add a column/i }));
    const input = screen.getByRole("textbox", { name: /new column title/i });
    await userEvent.type(input, "Sprint 1");
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(await screen.findByDisplayValue("Sprint 1")).toBeInTheDocument();
  });

  it("deletes a column when confirmed", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    render(<KanbanBoard />);
    const columns = await screen.findAllByTestId(/column-/i);
    expect(columns).toHaveLength(5);

    const firstColumn = columns[0];
    const deleteBtn = within(firstColumn).getByRole("button", { name: /delete column/i });
    await userEvent.click(deleteBtn);

    const remaining = screen.getAllByTestId(/column-/i);
    expect(remaining).toHaveLength(4);
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard />);
    const column = (await screen.findAllByTestId(/column-/i))[0];
    const addButton = within(column).getByRole("button", { name: /add a card/i });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));
    expect(within(column).getByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", { name: /delete new card/i });
    await userEvent.click(deleteButton);
    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });
});
