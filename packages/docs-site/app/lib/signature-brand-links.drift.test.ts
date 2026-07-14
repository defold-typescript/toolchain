import { expect, test } from "bun:test";
import { join } from "node:path";
import { canonicalApiPages } from "./api-content";
import { apiSignatureSymbolLinks } from "./api-page-render";
import { loadApiSurfaceForVersion } from "./api-surface-loader";
import { buildSymbolIndex } from "./symbol-index";

const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");
const REAL_LIBRARY_TYPES_DIR = join(import.meta.dir, "../../../library-types");

test("apiSignatureSymbolLinks resolves Opaque to the document-engine-globals page route", () => {
  const pages = canonicalApiPages(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
  const route = buildSymbolIndex(pages).Opaque?.route;
  // Dropping or renaming the `Opaque` global-type page makes this undefined.
  expect(route).toBe("/api/Opaque");
  expect(apiSignatureSymbolLinks(pages).get("Opaque")).toBe(route);
});

test("a versioned surface carries no Opaque page, so its route resolves against canonical", () => {
  // Global types are version-independent — `apiPagesForVersion` excludes them, so
  // resolving against a versioned surface yields nothing. This is why the
  // `/api/<version>/<namespace>` route builds its signature links from the
  // canonical surface (which links every version's `Opaque` to `/api/Opaque`).
  const versioned = loadApiSurfaceForVersion(REAL_TYPES_DIR, "defold-1.13.0");
  expect(apiSignatureSymbolLinks(versioned).size).toBe(0);
});
