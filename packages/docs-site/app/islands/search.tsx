import { create, insertMultiple, type Orama, search } from "@orama/orama";
import { useEffect, useState } from "hono/jsx";
import { withBase } from "../lib/base";
import type { SearchRecord } from "../lib/search-index";
import { buildSnippet } from "../lib/snippet";

const SCHEMA = { route: "string", title: "string", text: "string" } as const;
type SearchDb = Orama<typeof SCHEMA>;
type Hit = { route: string; title: string; snippet: string };

export default function Search() {
  const [db, setDb] = useState<SearchDb | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const response = await fetch(withBase("/search-index.json"));
      const records = (await response.json()) as SearchRecord[];
      const instance = create({ schema: SCHEMA }) as SearchDb;
      await insertMultiple(instance, records);
      if (active) setDb(instance);
    })();
    return () => {
      active = false;
    };
  }, []);

  const onInput = async (event: Event) => {
    const value = (event.target as HTMLInputElement).value.trim();
    setTerm(value);
    if (!db || value.length < 2) {
      setHits([]);
      setOpen(false);
      return;
    }
    const results = await search(db, {
      term: value,
      tolerance: 1,
      properties: ["title", "text"],
      limit: 8,
    });
    const next: Hit[] = results.hits.map((hit) => ({
      route: hit.document.route,
      title: hit.document.title,
      snippet: buildSnippet(hit.document.text, value, { context: 120 }).html,
    }));
    setHits(next);
    setOpen(next.length > 0);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" || term.length < 2) return;
    event.preventDefault();
    window.location.href = `${withBase("/search")}?q=${encodeURIComponent(term)}`;
  };

  return (
    <div class="relative">
      <input
        type="search"
        placeholder="Search docs…"
        aria-label="Search documentation"
        onInput={onInput}
        onKeyDown={onKeyDown}
        onFocus={() => hits.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        class="h-9 w-56 max-w-[40vw] rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
      />
      {open && hits.length > 0 ? (
        <ul class="absolute right-0 z-40 mt-1 w-80 overflow-hidden rounded-md border border-border bg-bg shadow-lg">
          {hits.map((hit) => (
            <li>
              <a href={withBase(hit.route)} class="block px-3 py-2 transition hover:bg-surface">
                <span class="block text-sm font-medium text-text">{hit.title}</span>
                <span
                  class="search-snippet mt-0.5 line-clamp-2 block text-xs text-text-muted"
                  dangerouslySetInnerHTML={{ __html: hit.snippet }}
                />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
