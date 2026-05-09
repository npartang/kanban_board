"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type ChangePasswordModalProps = {
  onClose: () => void;
};

export const ChangePasswordModal = ({ onClose }: ChangePasswordModalProps) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const currentRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    currentRef.current?.focus();
  }, []);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/me/password", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });

      if (res.status === 401) {
        setError("Current password is incorrect.");
        return;
      }
      if (res.status === 422) {
        const body = (await res.json()) as { detail?: string };
        setError(body.detail ?? "Invalid password.");
        return;
      }
      if (!res.ok) {
        setError("Failed to change password. Please try again.");
        return;
      }

      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Change password"
    >
      <div className="w-full max-w-sm rounded-3xl border border-[var(--stroke)] bg-white shadow-[0_32px_64px_rgba(3,33,71,0.16)]">
        <div className="border-b border-[var(--stroke)] px-6 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
              Change password
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[var(--stroke)] px-2 py-1 text-sm text-[var(--gray-text)] hover:border-[var(--primary-blue)]"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {success ? (
          <div className="px-6 py-8 text-center">
            <p className="text-sm font-semibold text-green-600">Password changed successfully!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
            <div className="space-y-1">
              <label
                htmlFor="cp-current"
                className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
              >
                Current password
              </label>
              <input
                ref={currentRef}
                id="cp-current"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="cp-new"
                className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
              >
                New password
              </label>
              <input
                id="cp-new"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
                className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="cp-confirm"
                className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
              >
                Confirm new password
              </label>
              <input
                id="cp-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold text-[var(--gray-text)] hover:border-[var(--primary-blue)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !currentPassword || !newPassword || !confirmPassword}
                className="flex-1 rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
              >
                {isSubmitting ? "Saving…" : "Update password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
