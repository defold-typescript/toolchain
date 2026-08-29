import { expect, test } from "bun:test";
import { join } from "node:path";
import { canonicalApiPages } from "./api-content";
import { apiPageMarkdown, apiSignatureSymbolLinks } from "./api-page-render";
import type { ApiPage } from "./api-surface";
import { loadApiSurfaceForVersion, versionsWithDiskFixtures } from "./api-surface-loader";
import { allPageHeadings } from "./headings";
import { renderMarkdown } from "./markdown";
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
  const defaultId = versionsWithDiskFixtures(REAL_TYPES_DIR).find((v) => v.isDefault)?.id;
  expect(defaultId).toBeDefined();
  const versioned = loadApiSurfaceForVersion(REAL_TYPES_DIR, defaultId as string);
  expect(apiSignatureSymbolLinks(versioned).size).toBe(0);
});

test("a page's own shapes join the map at that page's route, beside Opaque", () => {
  const pages = canonicalApiPages(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
  const page = pages.find((p) => p.namespace === "monarch.monarch");
  expect(page).toBeDefined();
  if (!page) return;
  const links = apiSignatureSymbolLinks(pages, page);
  expect(links.get("Opaque")).toBe("/api/Opaque");
  expect(links.get("ShowOptions")).toEqual({ route: page.route, heading: "ShowOptions" });
  // The fallback grouping label names no shape, so it never enters the map.
  expect(links.has("Types")).toBe(false);
});

test("a shape name declared on two pages resolves against the page being rendered", () => {
  const pages = canonicalApiPages(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
  const fps = pages.find((p) => p.namespace === "metrics.fps");
  const mem = pages.find((p) => p.namespace === "metrics.mem");
  const monarch = pages.find((p) => p.namespace === "monarch.monarch");
  expect(fps).toBeDefined();
  expect(mem).toBeDefined();
  expect(monarch).toBeDefined();
  if (!fps || !mem || !monarch) return;
  expect(apiSignatureSymbolLinks(pages, fps).get("Metrics")).toEqual({
    route: fps.route,
    heading: "Metrics",
  });
  expect(apiSignatureSymbolLinks(pages, mem).get("Metrics")).toEqual({
    route: mem.route,
    heading: "Metrics",
  });
  // A page declaring no `Metrics` must not inherit either route.
  expect(apiSignatureSymbolLinks(pages, monarch).has("Metrics")).toBe(false);
});

test("a rendered signature deep-links a shape it declares and leaves other tokens inert", async () => {
  const pages = canonicalApiPages(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
  const page = pages.find((p) => p.namespace === "monarch.monarch");
  expect(page).toBeDefined();
  if (!page) return;
  const html = await renderMarkdown(
    apiPageMarkdown(page, (t) => t, { omitHeading: true }),
    {
      highlightSignatureHeadings: true,
      signatureSymbolLinks: apiSignatureSymbolLinks(pages, page),
    },
  );

  // The expected anchor is the id the `slugify-headings` rule actually minted for
  // the rendered `## ShowOptions` heading, so a de-duplication suffix cannot drift
  // the link away from the heading it points at.
  const heading = allPageHeadings(html).find((h) => h.text === "ShowOptions");
  expect(heading).toBeDefined();
  if (!heading) return;

  const signature = html.split(/<h3\b/).find((chunk) => chunk.includes("show(screen_id"));
  expect(signature).toBeDefined();
  if (!signature) return;

  const linked = new Map(
    [
      ...signature.matchAll(/<a class="signature-symbol-link" href="([^"]*)">(?:<[^>]*>)*([^<]*)/g),
    ].map((m) => [m[2] as string, m[1] as string]),
  );
  expect([...linked.keys()]).toContain("ShowOptions");
  for (const inert of ["ScreenId", "Data", "Callback"]) {
    expect([...linked.keys()]).not.toContain(inert);
  }
  expect(linked.get("ShowOptions")?.endsWith(`#${heading.id}`)).toBe(true);
});

// A page whose module-function section heading and typedef shape share the slug
// `functions`: the section renders `h2#functions` and the shape `h2#functions-1`,
// so a link built from `slugify(<shape name>)` alone lands on the wrong heading.
// No shipped page carries this collision yet, which is why it takes a fixture.
function collidingShapePage(): ApiPage {
  return {
    namespace: "demo",
    route: "/api/demo",
    brief: "Demo",
    module: {
      namespace: "demo",
      brief: "Demo",
      description: "Heading-collision demo.",
      functions: [
        {
          name: "demo.use",
          brief: "",
          description: "Uses the option table.",
          parameters: [
            { name: "opts", doc: "the options", types: ["Functions"], isOptional: false },
          ],
          returnValues: [],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [
        {
          name: "Functions",
          functions: [
            {
              name: "run",
              brief: "",
              description: "Runs the callback.",
              parameters: [],
              returnValues: [],
            },
          ],
          properties: [{ name: "count", brief: "", description: "How many.", types: ["number"] }],
        },
      ],
    },
    translations: {},
    signatures: {},
    category: "library",
  };
}

test("a shape link targets its own heading when an earlier heading shares the slug", async () => {
  const page = collidingShapePage();
  const html = await renderMarkdown(
    apiPageMarkdown(page, (t) => t, { omitHeading: true }),
    {
      highlightSignatureHeadings: true,
      signatureSymbolLinks: apiSignatureSymbolLinks([page], page),
    },
  );

  // Both sides come from production: the expected id is read off the rendered
  // shape heading, so the assertion compares two render outputs rather than a
  // literal, and the de-duplication suffix cannot drift them apart silently.
  const collided = allPageHeadings(html).filter((h) => h.level === 2 && h.text === "Functions");
  expect(collided.length).toBe(2);
  const shape = collided[collided.length - 1] as (typeof collided)[number];
  expect(shape.id).not.toBe("functions");

  const signature = html.split(/<h3\b/).find((chunk) => chunk.includes("demo.use(opts"));
  expect(signature).toBeDefined();
  if (!signature) return;
  const linked = new Map(
    [
      ...signature.matchAll(/<a class="signature-symbol-link" href="([^"]*)">(?:<[^>]*>)*([^<]*)/g),
    ].map((m) => [m[2] as string, m[1] as string]),
  );
  expect([...linked.keys()]).toContain("Functions");
  expect(linked.get("Functions")?.endsWith(`#${shape.id}`)).toBe(true);
  // Stated separately so the assertion above cannot pass by both ids agreeing:
  // resolving first-wins, or from `slugify(label)`, lands on the section heading.
  expect(linked.get("Functions")?.endsWith("#functions")).toBe(false);
});
