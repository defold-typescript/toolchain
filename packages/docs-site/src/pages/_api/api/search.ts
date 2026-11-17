import { createSearchAPI } from "fumadocs-core/search/server";
import { searchEntries } from "../../../lib/site";

// GitHub Pages runs no server, so the index is written to a file at build time
// and the browser searches it.
const api = createSearchAPI("simple", { indexes: searchEntries() });

export const GET = api.staticGET;

export async function getConfig() {
  return { render: "static" } as const;
}
