"use client";

import type { ShortcutHandler } from "@/lib/useKeyboardShortcuts";

type KeyboardShortcutsHelpProps = {
  shortcuts: ShortcutHandler[];
  onClose: () => void;
};

const formatKey = (s: ShortcutHandler) => {
  const parts: string[] = [];
  if (s.ctrl) parts.push("⌘");
  if (s.shift) parts.push("⇧");
  parts.push(s.key === "?" ? "?" : s.key.toUpperCase());
  return parts.join(" ");
};

export const KeyboardShortcutsHelp = ({ shortcuts, onClose }: KeyboardShortcutsHelpProps) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
    onClick={(e) => e.target === e.currentTarget && onClose()}
    role="dialog"
    aria-modal="true"
    aria-label="Keyboard shortcuts"
  >
    <div className="w-full max-w-sm rounded-3xl border border-[var(--stroke)] bg-white p-6 shadow-[0_32px_64px_rgba(3,33,71,0.16)]">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
          Keyboard shortcuts
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
      <ul className="mt-4 space-y-2">
        {shortcuts.map((s) => (
          <li key={`${s.key}-${s.ctrl}-${s.shift}`} className="flex items-center justify-between">
            <span className="text-sm text-[var(--gray-text)]">{s.description}</span>
            <kbd className="rounded-lg border border-[var(--stroke)] bg-[var(--surface)] px-2 py-0.5 font-mono text-xs text-[var(--navy-dark)]">
              {formatKey(s)}
            </kbd>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] text-[var(--gray-text)]">
        Shortcuts are disabled when typing in inputs.
      </p>
    </div>
  </div>
);
