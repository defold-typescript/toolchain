import { useEffect, useRef } from "react";
import { useViewer, type ViewerStore } from "./store";

/**
 * The page's own find, since the browser's cannot see lines a virtualized list has not rendered.
 * Ctrl/Cmd+F opens it; pressed again while it is open, the browser's find takes over.
 */
export function SearchBox({ store }: { store: ViewerStore }) {
  const open = useViewer(store, (state) => state.searchOpen);
  const search = useViewer(store, (state) => state.search);
  const setOpen = useViewer(store, (state) => state.setSearchOpen);
  const setQuery = useViewer(store, (state) => state.setQuery);
  const stepMatch = useViewer(store, (state) => state.stepMatch);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f" && !open) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [open]);

  if (!open) {
    return null;
  }
  const count = search.matches.length;
  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        type="search"
        aria-label="search the code"
        placeholder="search"
        className="w-40 border border-border bg-background px-1"
        value={search.query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            stepMatch(event.shiftKey ? -1 : 1);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      <span className="text-muted-foreground">
        {count === 0 ? "0/0" : `${(search.current ?? 0) + 1}/${count}`}
      </span>
    </div>
  );
}
