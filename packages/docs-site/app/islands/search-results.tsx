import { create, insertMultiple, type Orama, search } from "@orama/orama";
import { useEffect, useState } from "hono/jsx";
import { withBase } from "../lib/base";
import type { SearchRecord } from "../lib/search-index";
import { buildSnippet } from "../lib/snippet";

const SCHEMA = { route: "string", title: "string", text: "string" } as const;
type SearchDb = Orama<typeof SCHEMA>;
type Result = { route: string; title: string; snippet: string };

function readQuery(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
}

export default function SearchResults() {
  const [db, setDb] = useState<SearchDb | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      // Dev appends a per-load `?t=` so Safari can't serve a stale index after
      // a regen; prod uses the stable cached path.
      const base = withBase("/search-index.json");
      const response = await fetch(import.meta.env.DEV ? `${base}?t=${Date.now()}` : base);
      const records = (await response.json()) as SearchRecord[];
      const instance = create({ schema: SCHEMA }) as SearchDb;
      await insertMultiple(instance, records);
      if (active) setDb(instance);
    })();
    setQuery(readQuery());
    const onPop = () => setQuery(readQuery());
    window.addEventListener("popstate", onPop);
    return () => {
      active = false;
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  useEffect(() => {
    if (!db) return;
    let active = true;
    (async () => {
      if (query.length < 2) {
        if (active) setResults([]);
        return;
      }
      const found = await search(db, {
        term: query,
        tolerance: 1,
        properties: ["title", "text"],
        limit: 30,
      });
      const next: Result[] = found.hits.map((hit) => ({
        route: hit.document.route,
        title: hit.document.title,
        snippet: buildSnippet(hit.document.text, query, { context: 260 }).html,
      }));
      if (active) setResults(next);
    })();
    return () => {
      active = false;
    };
  }, [db, query]);

  if (query.length < 2) {
    return <p class="text-text-muted">Type a query of at least two characters to search.</p>;
  }

  return (
    <div>
      <p class="text-text-muted">
        {results.length} result{results.length === 1 ? "" : "s"} for{" "}
        <span class="font-medium text-text">{query}</span>
      </p>
      <ul class="not-prose mt-6 list-none space-y-4 p-0">
        {results.map((result) => (
          <li class="rounded-lg border border-border bg-surface p-4">
            <a
              href={withBase(result.route)}
              class="text-base font-semibold text-accent hover:underline"
            >
              {result.title}
            </a>
            <p
              class="search-snippet mt-1 text-sm text-text-muted"
              dangerouslySetInnerHTML={{ __html: result.snippet }}
            />
            <span class="mt-2 block font-mono text-xs text-text-faint">{result.route}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
