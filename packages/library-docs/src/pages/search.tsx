import { SearchResults } from "@defold-typescript/docs-render/search-results";
import { DocsBody, DocsPage } from "fumadocs-ui/layouts/docs/page";
import { SITE_NAME } from "../lib/site";

// The library site exports one search index, so no `index` names another.
const VERSION_IDS: readonly string[] = [];

export default function Search() {
  return (
    <DocsPage>
      <title>{`Search | ${SITE_NAME}`}</title>
      <DocsBody>
        <h1>Search</h1>
        <SearchResults versionIds={VERSION_IDS} />
      </DocsBody>
    </DocsPage>
  );
}

export async function getConfig() {
  return { render: "static" } as const;
}
