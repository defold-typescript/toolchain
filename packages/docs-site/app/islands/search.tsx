import { create, insertMultiple, type Orama, search } from "@orama/orama";
import { useEffect, useState } from "hono/jsx";
import type { SearchRecord } from "../lib/search-index";

const SCHEMA = { route: "string", title: "string", text: "string" } as const;
type SearchDb = Orama<typeof SCHEMA>;
type Hit = { route: string; title: string };

export default function Search() {
  const [db, setDb] = useState<SearchDb | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);

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
      return;
    }
    const results = await search(db, {
      term,
      tolerance: 1,
      properties: ["title", "text"],
      limit: 8,
    });
    setHits(results.hits.map((hit) => ({ route: hit.document.route, title: hit.document.title })));
  };

  return (
    <div class="search">
      <input
        type="search"
        class="search-input"
        placeholder="Search docs…"
        aria-label="Search documentation"
        onInput={onInput}
      />
      {hits.length > 0 && (
        <ul class="search-results">
          {hits.map((hit) => (
            <li>
              <a href={hit.route}>{hit.title}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
