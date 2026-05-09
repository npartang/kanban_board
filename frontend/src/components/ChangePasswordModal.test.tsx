import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangePasswordModal } from "./ChangePasswordModal";

const defaultProps = {
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const fillForm = async (user: ReturnType<typeof userEvent.setup>, current: string, newPw: string, confirm: string) => {
  await user.type(screen.getByLabelText("Current password"), current);
  await user.type(screen.getByLabelText("New password"), newPw);
  await user.type(screen.getByLabelText("Confirm new password"), confirm);
};

describe("ChangePasswordModal", () => {
  it("renders all password fields", () => {
    render(<ChangePasswordModal {...defaultProps} />);
    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    render(<ChangePasswordModal {...defaultProps} />);
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Cancel button is clicked", async () => {
    render(<ChangePasswordModal {...defaultProps} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it("shows error when new passwords do not match", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordModal {...defaultProps} />);
    await fillForm(user, "oldpass123", "newpass123", "differentpass");
    await user.click(screen.getByRole("button", { name: /update password/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/do not match/i);
  });

  it("shows error when new password is too short", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordModal {...defaultProps} />);
    await fillForm(user, "oldpass123", "short", "short");
    await user.click(screen.getByRole("button", { name: /update password/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/at least 8 characters/i);
  });

  it("calls PATCH /api/me/password and shows success on 200", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "Password changed" }) } as Response)
    );
    render(<ChangePasswordModal {...defaultProps} />);
    await fillForm(user, "oldpass123", "newpassword1", "newpassword1");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/me/password",
      expect.objectContaining({ method: "PATCH" })
    );
    await waitFor(() =>
      expect(screen.getByText(/password changed successfully/i)).toBeInTheDocument()
    );
  });

  it("shows error when current password is incorrect (401)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) } as Response)
    );
    render(<ChangePasswordModal {...defaultProps} />);
    await fillForm(user, "wrongpass", "newpassword1", "newpassword1");
    await user.click(screen.getByRole("button", { name: /update password/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/current password is incorrect/i)
    );
  });

  it("shows server error message on 422", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ detail: "New password must be at least 8 characters" }),
      } as Response)
    );
    render(<ChangePasswordModal {...defaultProps} />);
    await fillForm(user, "oldpass123", "newpassword1", "newpassword1");
    await user.click(screen.getByRole("button", { name: /update password/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/at least 8 characters/i)
    );
  });

  it("calls onClose when backdrop is clicked", async () => {
    render(<ChangePasswordModal {...defaultProps} />);
    await userEvent.click(screen.getByRole("dialog"));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it("disables submit button when fields are empty", () => {
    render(<ChangePasswordModal {...defaultProps} />);
    expect(screen.getByRole("button", { name: /update password/i })).toBeDisabled();
  });
});
