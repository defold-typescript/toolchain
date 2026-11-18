"use client";
import type { SortedResult } from "fumadocs-core/search";
import { staticClient } from "fumadocs-core/search/client/orama-static";
import { useEffect, useState } from "react";
import { withBase } from "./base";
import { searchPageRequest } from "./search-route";
import { searchExcerpt } from "./snippet";

const RESULT_LIMIT = 30;

interface Hit {
  url: string;
  title: string;
  page?: string;
  passage?: string;
}

type Results =
  | { status: "loading" }
  | { status: "no-query" }
  | { status: "searching"; query: string }
  | { status: "found"; query: string; hits: Hit[] }
  | { status: "failed"; query: string };

// The engine lists each matching page, then its matching headings and passages.
// One entry per URL: a passage joins the heading or page it sits under, and an
// entry below a page names that page.
function toHits(results: readonly SortedResult[], query: string): Hit[] {
  const hits = new Map<string, Hit>();
  let page = "";
  for (const result of results) {
    const existing = hits.get(result.url);
    if (result.type === "text") {
      const passage = searchExcerpt(result.content, query);
      if (existing) existing.passage ??= passage;
      else hits.set(result.url, { url: result.url, title: page, passage });
      continue;
    }
    if (result.type === "page") page = result.content;
    if (existing) existing.title = result.content;
    else hits.set(result.url, { url: result.url, title: result.content });
    const entry = hits.get(result.url);
    if (entry && result.type === "heading" && page !== result.content) entry.page = page;
  }
  return [...hits.values()];
}

// The query lives in the page URL, which a static export cannot read, so the
// search runs once the page is in the browser.
export function SearchResults({ versionIds }: { versionIds: readonly string[] }) {
  const [results, setResults] = useState<Results>({ status: "loading" });
  useEffect(() => {
    const { query, indexFile } = searchPageRequest(window.location.search, versionIds);
    if (!query) {
      setResults({ status: "no-query" });
      return;
    }
    let current = true;
    setResults({ status: "searching", query });
    const client = staticClient({
      from: withBase(`/${indexFile}`),
      search: { tolerance: 1, limit: RESULT_LIMIT },
    });
    Promise.resolve(client.search(query)).then(
      (found) => {
        if (current) setResults({ status: "found", query, hits: toHits(found, query) });
      },
      () => {
        if (current) setResults({ status: "failed", query });
      },
    );
    return () => {
      current = false;
    };
  }, [versionIds]);

  switch (results.status) {
    case "loading":
      return null;
    case "no-query":
      return <p role="status">Open the search dialog and type a query to list its results here.</p>;
    case "searching":
      return <p role="status">Searching for “{results.query}”…</p>;
    case "failed":
      return <p role="status">The search index for “{results.query}” could not be loaded.</p>;
    case "found":
      if (results.hits.length === 0) {
        return <p role="status">No results for “{results.query}”.</p>;
      }
      return (
        <>
          <p role="status" className="text-text-muted">
            Results for “{results.query}”
          </p>
          <ul>
            {results.hits.map((hit) => (
              <li key={hit.url}>
                <a href={withBase(hit.url)}>
                  <span className="font-medium">{hit.title}</span>
                  {hit.page ? <span className="text-text-faint"> in {hit.page}</span> : null}
                  {hit.passage ? (
                    <span className="block font-normal text-text-muted">{hit.passage}</span>
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        </>
      );
  }
}
