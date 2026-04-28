import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";

const mockBoardResponse = {
  id: 1,
  name: "My board",
  columns: [
    { id: 1, title: "Backlog", position: 0 },
    { id: 2, title: "Discovery", position: 1 },
    { id: 3, title: "In Progress", position: 2 },
    { id: 4, title: "Review", position: 3 },
    { id: 5, title: "Done", position: 4 },
  ],
  cards: [],
};

const setupFetchMock = () => {
  (globalThis as any).fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.endsWith("/api/board") && method === "GET") {
      return Promise.resolve({
        ok: true,
        json: async () => mockBoardResponse,
      } as Response);
    }

    if (url.endsWith("/api/columns/1/rename") && method === "POST") {
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      } as Response);
    }

    if (url.endsWith("/api/cards") && method === "POST") {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      return Promise.resolve({
        ok: true,
        json: async () => ({
          id: 101,
          column_id: body.column_id ?? 1,
          title: body.title,
          details: body.details,
          position: 0,
        }),
      } as Response);
    }

    if (/\/api\/cards\/\d+$/.test(url) && method === "DELETE") {
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      } as Response);
    }

    if (/\/api\/cards\/\d+\/move$/.test(url) && method === "POST") {
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      } as Response);
    }

    return Promise.reject(new Error(`Unexpected fetch call: ${url} ${method}`));
  });
};

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  beforeEach(() => {
    setupFetchMock();
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

  it("adds and removes a card", async () => {
    render(<KanbanBoard />);
    const column = (await screen.findAllByTestId(/column-/i))[0];
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });
});
