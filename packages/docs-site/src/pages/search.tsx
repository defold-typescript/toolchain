import { SearchResults } from "@defold-typescript/docs-render/search-results";
import { apiVersions } from "@defold-typescript/docs-render/toolchain-surface";
import { DocsBody, DocsPage } from "fumadocs-ui/layouts/docs/page";
import { TYPES_DIR } from "../../app/lib/api-content";
import { SITE_NAME } from "../lib/site";

export default function Search() {
  return (
    <DocsPage>
      <title>{`Search | ${SITE_NAME}`}</title>
      <DocsBody>
        <h1>Search</h1>
        <SearchResults versionIds={apiVersions(TYPES_DIR).map((version) => version.id)} />
      </DocsBody>
    </DocsPage>
  );
}

export async function getConfig() {
  return { render: "static" } as const;
}
