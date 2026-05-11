import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

const dispatchKey = (key: string, options: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; target?: EventTarget } = {}) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    shiftKey: options.shiftKey ?? false,
  });
  if (options.target) {
    Object.defineProperty(event, "target", { value: options.target });
  }
  document.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useKeyboardShortcuts", () => {
  it("calls the matching handler when key is pressed", () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: "s", description: "Save", handler }])
    );
    dispatchKey("s");
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not call handler when key does not match", () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: "s", description: "Save", handler }])
    );
    dispatchKey("x");
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not call handler when typing in an input element", () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: "s", description: "Save", handler }])
    );
    const input = document.createElement("input");
    dispatchKey("s", { target: input });
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not call handler when typing in a textarea", () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: "s", description: "Save", handler }])
    );
    const textarea = document.createElement("textarea");
    dispatchKey("s", { target: textarea });
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not call handler when enabled is false", () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: "s", description: "Save", handler }], false)
    );
    dispatchKey("s");
    expect(handler).not.toHaveBeenCalled();
  });

  it("removes listener on unmount", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts([{ key: "s", description: "Save", handler }])
    );
    unmount();
    dispatchKey("s");
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls only first matching shortcut when multiple match", () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        { key: "s", description: "First", handler: h1 },
        { key: "s", description: "Second", handler: h2 },
      ])
    );
    dispatchKey("s");
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).not.toHaveBeenCalled();
  });
});
