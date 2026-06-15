import { create, insertMultiple, type Orama, search } from "@orama/orama";
import { useEffect, useState } from "hono/jsx";
import type { SearchRecord } from "../lib/search-index";

const SCHEMA = { route: "string", title: "string", text: "string" } as const;
type SearchDb = Orama<typeof SCHEMA>;
type Hit = { route: string; title: string };

export default function Search() {
  const [db, setDb] = useState<SearchDb | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const response = await fetch("/search-index.json");
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
    const term = (event.target as HTMLInputElement).value.trim();
    if (!db || term.length < 2) {
      setHits([]);
      setOpen(false);
      return;
    }
    const results = await search(db, {
      term,
      tolerance: 1,
      properties: ["title", "text"],
      limit: 8,
    });
    const next: Hit[] = results.hits.map((hit) => ({
      route: hit.document.route,
      title: hit.document.title,
    }));
    setHits(next);
    setOpen(next.length > 0);
  };

  return (
    <div class="relative">
      <input
        type="search"
        placeholder="Search docs…"
        aria-label="Search documentation"
        onInput={onInput}
        onFocus={() => hits.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        class="h-9 w-56 max-w-[40vw] rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
      />
      {open && hits.length > 0 ? (
        <ul class="absolute right-0 z-40 mt-1 w-72 overflow-hidden rounded-md border border-border bg-bg shadow-lg">
          {hits.map((hit) => (
            <li>
              <a
                href={hit.route}
                class="block px-3 py-2 text-sm text-text transition hover:bg-surface"
              >
                {hit.title}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
