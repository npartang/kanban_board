"use client";

import { FormEvent, useState } from "react";

type AISidebarProps = {
  onBoardUpdated: () => void;
};

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

export const AISidebar = ({ onBoardUpdated }: AISidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: trimmed,
    };

    const history = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ai-kanban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: trimmed,
          history,
        }),
      });

      if (!response.ok) {
        throw new Error("AI request failed");
      }

      const data = (await response.json()) as { reply: string };

      const assistantMessage: ChatMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: data.reply,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      onBoardUpdated();
    } catch {
      setError("Unable to contact AI. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <aside className="mt-6 w-full max-w-md rounded-3xl border border-[var(--stroke)] bg-white/90 p-4 shadow-[var(--shadow)] lg:mt-0 lg:w-80">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
            AI Assistant
          </p>
          <p className="mt-1 text-sm font-medium text-[var(--navy-dark)]">
            Ask for next steps
          </p>
        </div>
      </header>
      <div className="mb-3 max-h-72 space-y-3 overflow-y-auto pr-1 text-sm">
        {messages.length === 0 && (
          <p className="text-[var(--gray-text)]">
            Ask how to prioritize your work, request a summary of this board, or
            have the assistant add cards to the Backlog.
          </p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === "user"
                ? "ml-auto max-w-[85%] rounded-2xl bg-[var(--primary-blue)] px-3 py-2 text-xs font-medium text-white"
                : "max-w-[85%] rounded-2xl bg-[var(--surface)] px-3 py-2 text-xs text-[var(--navy-dark)]"
            }
          >
            {message.content}
          </div>
        ))}
      </div>
      {error && (
        <p className="mb-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={3}
          className="w-full resize-none rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
          placeholder="Ask the assistant how to organize this week..."
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="self-end rounded-full bg-[var(--secondary-purple)] px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {isLoading ? "Thinking…" : "Send"}
        </button>
      </form>
    </aside>
  );
};

