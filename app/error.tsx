"use client";

export default function EditorError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md rounded-xl border border-(--border) bg-(--surface) p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <p className="text-[10px] uppercase tracking-[0.24em] text-(--accent)">
          Editor recovery
        </p>
        <h1 className="mt-4 text-xl font-medium">The editor hit an unexpected error.</h1>
        <p className="mt-3 text-sm leading-6 text-(--text-muted)">
          Your source image was not uploaded anywhere. Local edits may need to
          be reopened; if memory was exhausted, use a smaller source frame.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="h-11 rounded-lg border border-(--accent) bg-(--accent) px-4 text-[10px] font-medium uppercase tracking-[0.14em] text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
            onClick={reset}
          >
            Try again
          </button>
          <button
            type="button"
            className="h-11 rounded-lg border border-(--border) px-4 text-[10px] font-medium uppercase tracking-[0.14em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
            onClick={() => window.location.reload()}
          >
            Reload editor
          </button>
        </div>
      </div>
    </main>
  );
}
