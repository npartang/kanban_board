import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { LoginGate } from "@/components/LoginGate";

const renderWithChild = () =>
  render(
    <LoginGate>
      <div>Protected content</div>
    </LoginGate>
  );

const mockFetchSequence = (...responses: Response[]) => {
  const fn = vi.fn();
  responses.forEach((res) => fn.mockResolvedValueOnce(res));
  vi.stubGlobal("fetch", fn);
  return fn;
};

const okJson = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body } as Response);

describe("LoginGate", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows login form when not authenticated", () => {
    renderWithChild();
    expect(screen.getByLabelText(/^username$/i)).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("logs in with correct credentials and shows protected content", async () => {
    // login → me
    mockFetchSequence(
      okJson({ message: "Logged in" }),
      okJson({ id: 1, username: "user" })
    );

    renderWithChild();

    const form = screen.getByRole("form", { name: /login form/i });
    await userEvent.type(screen.getByLabelText(/^username$/i), "user");
    await userEvent.type(screen.getByLabelText(/^password$/i), "password");
    await userEvent.click(within(form).getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByText("Protected content")).toBeInTheDocument()
    );
  });

  it("shows an error for invalid credentials (401)", async () => {
    mockFetchSequence({ ok: false, status: 401, json: async () => ({}) } as Response);

    renderWithChild();

    const form = screen.getByRole("form", { name: /login form/i });
    await userEvent.type(screen.getByLabelText(/^username$/i), "wrong");
    await userEvent.type(screen.getByLabelText(/^password$/i), "credentials");
    await userEvent.click(within(form).getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/invalid username or password/i)
    );
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("shows protected content immediately when localStorage flag is set", () => {
    window.localStorage.setItem("pm-auth-logged-in", "true");
    renderWithChild();
    expect(screen.queryByLabelText(/^username$/i)).not.toBeInTheDocument();
    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });

  it("logs out and returns to login screen", async () => {
    // login → me → logout
    mockFetchSequence(
      okJson({ message: "Logged in" }),
      okJson({ id: 1, username: "user" }),
      okJson({ message: "Logged out" })
    );

    renderWithChild();

    const form = screen.getByRole("form", { name: /login form/i });
    await userEvent.type(screen.getByLabelText(/^username$/i), "user");
    await userEvent.type(screen.getByLabelText(/^password$/i), "password");
    await userEvent.click(within(form).getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByText("Protected content")).toBeInTheDocument()
    );

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/^username$/i)).toBeInTheDocument()
    );
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("shows register form when register tab is clicked", async () => {
    renderWithChild();
    await userEvent.click(screen.getByRole("button", { name: /register/i }));
    expect(screen.getByLabelText(/^username$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("registers successfully and shows protected content", async () => {
    mockFetchSequence(okJson({ message: "Registered" }));

    renderWithChild();

    await userEvent.click(screen.getByRole("button", { name: /register/i }));
    await userEvent.type(screen.getByLabelText(/^username$/i), "newuser");
    await userEvent.type(screen.getByLabelText(/^password$/i), "securepass1");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "securepass1");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(screen.getByText("Protected content")).toBeInTheDocument()
    );
  });

  it("shows error when passwords do not match during registration", async () => {
    renderWithChild();
    await userEvent.click(screen.getByRole("button", { name: /register/i }));
    await userEvent.type(screen.getByLabelText(/^username$/i), "bob");
    await userEvent.type(screen.getByLabelText(/^password$/i), "passA1234");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "passB5678");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/passwords do not match/i)
    );
  });

  it("shows conflict error when username is taken (409)", async () => {
    mockFetchSequence({ ok: false, status: 409, json: async () => ({}) } as Response);

    renderWithChild();
    await userEvent.click(screen.getByRole("button", { name: /register/i }));
    await userEvent.type(screen.getByLabelText(/^username$/i), "taken");
    await userEvent.type(screen.getByLabelText(/^password$/i), "mypassword1");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "mypassword1");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/username already taken/i)
    );
  });
});
