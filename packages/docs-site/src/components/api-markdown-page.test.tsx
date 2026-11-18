import { afterAll, expect, spyOn, test } from "bun:test";
// A document must exist before React DOM and Radix load; see test-dom.ts.
import "@defold-typescript/docs-render/test-dom";
import { apiLinkify, renderApiPage } from "@defold-typescript/docs-render/api-page-render";
import type { ApiPage, AvailabilityLookup } from "@defold-typescript/docs-render/api-surface";
import { apiBodyComponents, MarkdownBody } from "@defold-typescript/docs-render/markdown-body";
import { act, registerDom, unregisterDom } from "@defold-typescript/docs-render/test-dom";
import { normalizedFunctionSignature, symbolIdentityKey } from "@defold-typescript/types";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { applySinceFilter } from "../../app/lib/since-filter";

registerDom();
afterAll(unregisterDom);

const NEWEST = "3.0.0";
const AXIS = [NEWEST, "2.0.0", "1.0.0"];

const fn = (name: string) => ({
  name,
  brief: "",
  description: `What ${name} does.`,
  parameters: [],
  returnValues: [],
});

const identity = (name: string) => ({
  namespace: "demo",
  kind: "FUNCTION" as const,
  name,
  signature: normalizedFunctionSignature(fn(name)),
});

// `demo.retired` ends at the oldest version and `demo.recent` reads New across
// the full range, so a window of the newest version alone hides one symbol and
// one chip.
function availability(): AvailabilityLookup {
  const spans: [string, string[]][] = [
    ["demo.always", AXIS],
    ["demo.retired", [AXIS[2] as string]],
    ["demo.recent", [NEWEST]],
  ];
  return {
    versions: AXIS,
    records: new Map(
      spans.map(([name, availableIn]) => [
        symbolIdentityKey(identity(name)),
        { identity: identity(name), availableIn },
      ]),
    ),
    transitions: new Set<string>(),
  };
}

const page: ApiPage = {
  namespace: "demo",
  route: "/api/demo",
  brief: "Demo",
  module: {
    namespace: "demo",
    brief: "Demo",
    description: "Demo namespace.",
    functions: ["demo.always", "demo.recent", "demo.retired"].map(fn),
    variables: [],
    constants: [],
    properties: [],
    typedefs: [],
  },
  translations: {},
  signatures: {},
  category: "engine",
  availability: availability(),
};

test("an API body hydrates without a mismatch after the ?since= filter hides a symbol and a chip", async () => {
  const { hast } = await renderApiPage(page, apiLinkify([page]), { combinedMarkers: true });
  const body = <MarkdownBody hast={hast} components={apiBodyComponents} />;
  const host = document.createElement("div");
  host.innerHTML = renderToString(body);
  document.body.append(host);

  const heading = (name: string): HTMLElement => {
    const found = [...host.querySelectorAll<HTMLElement>("h3")].find((h) =>
      h.textContent?.startsWith(name),
    );
    if (!found) throw new Error(`no ${name} heading`);
    return found;
  };
  const recentChip = heading("demo.recent").querySelector<HTMLElement>(".api-badge-dot--new");
  expect(recentChip?.style.display).toBe("");

  applySinceFilter(host, { from: NEWEST, to: NEWEST }, { versionIds: AXIS, badgeCounts: {} });
  expect(heading("demo.retired").style.display).toBe("none");
  expect(recentChip?.style.display).toBe("none");

  const errors = spyOn(console, "error").mockImplementation(() => {});
  const recoverable: unknown[] = [];
  try {
    await act(async () => {
      hydrateRoot(host, body, { onRecoverableError: (error) => recoverable.push(error) });
    });
    expect(errors.mock.calls).toEqual([]);
    expect(recoverable).toEqual([]);
    expect(heading("demo.retired").style.display).toBe("none");
  } finally {
    errors.mockRestore();
    host.remove();
  }
});
