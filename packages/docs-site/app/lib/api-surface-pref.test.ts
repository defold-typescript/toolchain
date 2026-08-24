import { describe, expect, test } from "bun:test";
import {
  type ApiSurfaceConfig,
  type ApiSurfaceRange,
  activeRangeForPath,
  canonicalLinkPath,
  readStoredRange,
  reconcileRangeSelector,
  resolveApiSurfaceRedirect,
  rewriteApiNavForRange,
  showApiSurfaceSelector,
} from "./api-surface-pref";
import type { NavCategory } from "./nav";
import { windowHref } from "./version-window";

// The tracked axis is newest-first and every version owns an `/api/<id>/…`
// family. `defold-1.13.0` is the default (what the bare canonical route renders
// as its `to`); `defold-1.12.0` is the oldest, so it is the `from` a full-range
// URL leaves implicit.
const CONFIG: ApiSurfaceConfig = {
  base: "",
  versionIds: ["defold-1.13.0", "defold-1.12.4", "defold-1.12.0"],
  defaultVersionId: "defold-1.13.0",
  // Version-independent namespaces (`Hash`, `base`) are intentionally absent, so
  // a range never steers them to a version-prefixed 404.
  namespacesByVersion: {
    "defold-1.13.0": ["camera", "go", "model"],
    "defold-1.12.4": ["go", "model"],
    "defold-1.12.0": ["go"],
  },
};

const BASED: ApiSurfaceConfig = { ...CONFIG, base: "/toolchain" };

const OLDEST = "defold-1.12.0";
const DEFAULT = "defold-1.13.0";
const FULL: ApiSurfaceRange = { from: OLDEST, to: DEFAULT };

describe("readStoredRange — legacy stored values migrate instead of resetting", () => {
  test("the retired `combined` id resolves to the full default range", () => {
    expect(readStoredRange("/api/camera", "", "combined", CONFIG)).toEqual(FULL);
  });

  test("a stored bare version id becomes a range ending at that version", () => {
    expect(readStoredRange("/api/camera", "", "defold-1.12.4", CONFIG)).toEqual({
      from: OLDEST,
      to: "defold-1.12.4",
    });
  });

  test("no stored value, an empty one, and an unparseable one all resolve to the full default range", () => {
    expect(readStoredRange("/api/camera", "", null, CONFIG)).toEqual(FULL);
    expect(readStoredRange("/api/camera", "", "", CONFIG)).toEqual(FULL);
    expect(readStoredRange("/api/camera", "", "bogus", CONFIG)).toEqual(FULL);
    expect(readStoredRange("/api/camera", "", "defold-9.9.9|defold-8.8.8", CONFIG)).toEqual(FULL);
  });

  test("a stored range round-trips both bounds", () => {
    expect(readStoredRange("/api/camera", "", "defold-1.12.4|defold-1.13.0", CONFIG)).toEqual({
      from: "defold-1.12.4",
      to: DEFAULT,
    });
  });

  test("a stored inverted range clamps `from` down to `to` rather than being discarded", () => {
    expect(readStoredRange("/api/camera", "", "defold-1.13.0|defold-1.12.0", CONFIG)).toEqual({
      from: OLDEST,
      to: OLDEST,
    });
  });
});

describe("readStoredRange — an explicit URL always wins over the stored range", () => {
  test("a version-prefixed path yields that `to` whatever is stored", () => {
    expect(
      readStoredRange("/api/defold-1.12.4/go", "", "defold-1.13.0|defold-1.13.0", CONFIG),
    ).toEqual({ from: OLDEST, to: "defold-1.12.4" });
  });

  test("`?since=` yields that `from` on a routed page", () => {
    expect(readStoredRange("/api/defold-1.13.0/go", "?since=defold-1.12.4", null, CONFIG)).toEqual({
      from: "defold-1.12.4",
      to: DEFAULT,
    });
  });

  test("`?since=` is honored on an un-prefixed page too, keeping the stored `to`", () => {
    expect(readStoredRange("/api/go", "?since=defold-1.12.4", "defold-1.12.4", CONFIG)).toEqual({
      from: "defold-1.12.4",
      to: "defold-1.12.4",
    });
  });

  test("a routed page with no `?since=` states the full range, ignoring a stored `from`", () => {
    expect(
      readStoredRange("/api/defold-1.13.0/go", "", "defold-1.12.4|defold-1.12.4", CONFIG),
    ).toEqual(FULL);
  });

  test("an untracked `?since=` widens to the oldest version instead of dropping the page", () => {
    expect(readStoredRange("/api/defold-1.13.0/go", "?since=defold-9.9.9", null, CONFIG)).toEqual(
      FULL,
    );
  });

  test("a `?since=` newer than the routed `to` clamps down to `to`", () => {
    expect(readStoredRange("/api/defold-1.12.0/go", "?since=defold-1.13.0", null, CONFIG)).toEqual({
      from: OLDEST,
      to: OLDEST,
    });
  });

  test("the deploy base is stripped before the path is read", () => {
    expect(readStoredRange("/toolchain/api/defold-1.12.4/go", "", null, BASED)).toEqual({
      from: OLDEST,
      to: "defold-1.12.4",
    });
  });
});

describe("activeRangeForPath — the window the server renders", () => {
  test("a version-prefixed route renders its own window", () => {
    expect(activeRangeForPath("/api/defold-1.12.4/go", "?since=defold-1.12.4", CONFIG)).toEqual({
      from: "defold-1.12.4",
      to: "defold-1.12.4",
    });
  });

  test("the bare canonical route renders the full default window", () => {
    expect(activeRangeForPath("/api/camera", "", CONFIG)).toEqual(FULL);
    expect(activeRangeForPath("/api", "", CONFIG)).toEqual(FULL);
  });

  test("a non-API route resolves to the full default window", () => {
    expect(activeRangeForPath("/guides", "", CONFIG)).toEqual(FULL);
  });

  test("ignores the client-persisted preference the server cannot read", () => {
    // Same inputs as `readStoredRange` with a narrower stored range: the server
    // must render what the URL says, never what a browser remembered.
    expect(activeRangeForPath("/api/camera", "", CONFIG)).toEqual(FULL);
  });
});

describe("resolveApiSurfaceRedirect — un-prefixed entry points steer to the stored range", () => {
  const redirect = (path: string, search: string, stored: string | null, cfg = CONFIG) =>
    resolveApiSurfaceRedirect(path, search, stored, cfg, readStoredRange);

  test("a full default range leaves the canonical page put", () => {
    expect(redirect("/api/camera", "", null)).toBeNull();
    expect(redirect("/api/camera", "", "combined")).toBeNull();
    expect(redirect("/api", "", null)).toBeNull();
  });

  test("a narrower stored range moves the page onto its windowed route", () => {
    expect(redirect("/api/go", "", "defold-1.12.4|defold-1.12.4")).toBe(
      "/api/defold-1.12.4/go?since=defold-1.12.4",
    );
    expect(redirect("/api/go", "", "defold-1.12.4")).toBe("/api/defold-1.12.4/go");
  });

  test("an explicit versioned route is the reader's stated intent and is never overridden", () => {
    expect(redirect("/api/defold-1.12.4/go", "", "defold-1.13.0|defold-1.13.0")).toBeNull();
    expect(redirect("/api/combined/camera", "", null)).toBeNull();
  });

  test("a non-API path is ignored", () => {
    expect(redirect("/guides", "", "defold-1.12.4")).toBeNull();
    expect(redirect("/", "", "defold-1.12.4")).toBeNull();
  });

  test("a namespace the `to` version does not own stays canonical rather than 404ing", () => {
    // `base` and `Hash` are version-independent; `camera` exists only in 1.13.0.
    expect(redirect("/api/base", "", "defold-1.12.4")).toBeNull();
    expect(redirect("/api/camera", "", "defold-1.12.4")).toBeNull();
  });

  test("re-applies the deploy base to the target", () => {
    expect(redirect("/toolchain/api/go", "", "defold-1.12.4", BASED)).toBe(
      "/toolchain/api/defold-1.12.4/go",
    );
  });

  test("emits exactly the href `windowHref` builds for the same window", () => {
    // The redirect inlines its own path/query encoding to stay `.toString()`
    // serializable, so this pins the duplicate against the one real builder.
    const bare = (id: string) => id.replace(/^defold-/, "");
    const axis = CONFIG.versionIds.map(bare);
    for (const [from, to] of [
      ["defold-1.12.4", "defold-1.12.4"],
      ["defold-1.12.0", "defold-1.12.4"],
      ["defold-1.12.4", "defold-1.13.0"],
    ] as const) {
      expect(redirect("/api/go", "", `${from}|${to}`)).toBe(
        windowHref("go", { from: bare(from), to: bare(to) }, axis),
      );
    }
  });
});

describe("showApiSurfaceSelector", () => {
  test("renders as soon as one version is tracked — both columns hold that version", () => {
    expect(showApiSurfaceSelector(1)).toBe(true);
    expect(showApiSurfaceSelector(3)).toBe(true);
  });

  test("hides only when no version is tracked at all", () => {
    expect(showApiSurfaceSelector(0)).toBe(false);
  });
});

describe("rewriteApiNavForRange", () => {
  const nav = (): NavCategory[] => [
    { id: "guides", label: "Guides", route: "/guides", links: [] },
    {
      id: "api",
      label: "API",
      route: "/api",
      links: [
        {
          label: "Defold",
          labelHtml: "Defold",
          children: [
            { label: "go", labelHtml: "go", route: "/api/go", badgeHtml: "<span>PILL</span>" },
            { label: "base", labelHtml: "base", route: "/api/base" },
          ],
        },
      ],
    },
  ];

  test("points engine leaves and the api root at the active window", () => {
    const out = rewriteApiNavForRange(
      nav(),
      { from: "defold-1.12.4", to: "defold-1.12.4" },
      CONFIG,
    );
    const api = out.find((c) => c.id === "api");
    expect(api?.route).toBe("/api/defold-1.12.4?since=defold-1.12.4");
    const leaves = api?.links[0]?.children ?? [];
    expect(leaves.find((l) => l.label === "go")?.route).toBe(
      "/api/defold-1.12.4/go?since=defold-1.12.4",
    );
    // `base` is version-independent, so its canonical route is left alone.
    expect(leaves.find((l) => l.label === "base")?.route).toBe("/api/base");
  });

  test("omits `?since=` for a full range, so the default window keeps clean URLs", () => {
    const out = rewriteApiNavForRange(nav(), FULL, CONFIG);
    const api = out.find((c) => c.id === "api");
    expect(api?.route).toBe("/api/defold-1.13.0");
    expect(api?.links[0]?.children?.find((l) => l.label === "go")?.route).toBe(
      "/api/defold-1.13.0/go",
    );
  });

  test("keeps the count pills on every window — no surface is badge-free any more", () => {
    const out = rewriteApiNavForRange(
      nav(),
      { from: "defold-1.12.4", to: "defold-1.12.4" },
      CONFIG,
    );
    const leaves = out.find((c) => c.id === "api")?.links[0]?.children ?? [];
    expect(leaves.find((l) => l.label === "go")?.badgeHtml).toBe("<span>PILL</span>");
  });
});

// A minimal hand-rolled DOM the serializable selector reconciliation can drive,
// implementing only the surface it reads (attributes, classList, query, children).
class FakeEl {
  tag: string;
  ownerDocument: FakeDoc;
  attrs: Record<string, string> = {};
  classes = new Set<string>();
  children: FakeEl[] = [];
  documentElement?: FakeEl;
  parentNode: FakeEl | null = null;
  textContent = "";
  constructor(tag: string, doc: FakeDoc) {
    this.tag = tag;
    this.ownerDocument = doc;
  }
  get classList() {
    const classes = this.classes;
    return {
      add: (...tokens: string[]) => {
        for (const t of tokens) classes.add(t);
      },
      remove: (...tokens: string[]) => {
        for (const t of tokens) classes.delete(t);
      },
    };
  }
  set className(value: string) {
    this.classes = new Set(value.split(/\s+/).filter(Boolean));
  }
  get className(): string {
    return [...this.classes].join(" ");
  }
  getAttribute(name: string): string | null {
    return name in this.attrs ? (this.attrs[name] as string) : null;
  }
  setAttribute(name: string, value: string): void {
    this.attrs[name] = value;
  }
  removeAttribute(name: string): void {
    delete this.attrs[name];
  }
  appendChild(node: FakeEl): FakeEl {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }
  removeChild(node: FakeEl): FakeEl {
    this.children = this.children.filter((c) => c !== node);
    node.parentNode = null;
    return node;
  }
  createElement(tag: string): FakeEl {
    return this.ownerDocument.createElement(tag);
  }
  private descendants(): FakeEl[] {
    const out: FakeEl[] = [];
    for (const child of this.children) {
      out.push(child, ...child.descendants());
    }
    return out;
  }
  private matches(selector: string): boolean {
    if (selector.charAt(0) === "[") return selector.slice(1, -1) in this.attrs;
    return this.tag === selector;
  }
  querySelector(selector: string): FakeEl | null {
    return this.descendants().find((el) => el.matches(selector)) ?? null;
  }
  querySelectorAll(selector: string): FakeEl[] {
    return this.descendants().filter((el) => el.matches(selector));
  }
}

class FakeDoc {
  createElement(tag: string): FakeEl {
    return new FakeEl(tag, this);
  }
}

describe("reconcileRangeSelector (DOM contract)", () => {
  const LABELS: Record<string, string> = {
    "defold-1.13.0": "Defold 1.13.0",
    "defold-1.12.4": "Defold 1.12.4",
    "defold-1.12.0": "Defold 1.12.0",
  };

  function selectorDom() {
    const doc = new FakeDoc();
    const root = doc.createElement("div");
    root.documentElement = root;
    for (const bound of ["from", "to"] as const) {
      const summary = doc.createElement("span");
      summary.setAttribute("data-range-summary", bound);
      summary.textContent = "server-rendered";
      root.appendChild(summary);
      for (const id of CONFIG.versionIds) {
        const option = doc.createElement("a");
        option.setAttribute("data-range-option", id);
        option.setAttribute("data-range-bound", bound);
        const label = doc.createElement("span");
        label.textContent = LABELS[id] as string;
        option.appendChild(label);
        root.appendChild(option);
      }
    }
    const optionFor = (bound: string, id: string) =>
      root
        .querySelectorAll("[data-range-option]")
        .find(
          (o) =>
            o.getAttribute("data-range-bound") === bound &&
            o.getAttribute("data-range-option") === id,
        );
    const summaryFor = (bound: string) =>
      root
        .querySelectorAll("[data-range-summary]")
        .find((s) => s.getAttribute("data-range-summary") === bound);
    return { root, optionFor, summaryFor };
  }

  test("marks the active option in both columns and writes both summaries", () => {
    const { root, optionFor, summaryFor } = selectorDom();
    reconcileRangeSelector(root, { from: "defold-1.12.4", to: DEFAULT });
    expect(optionFor("from", "defold-1.12.4")?.getAttribute("aria-current")).toBe("page");
    expect(optionFor("from", "defold-1.12.4")?.className).toContain("text-accent");
    expect(optionFor("to", DEFAULT)?.getAttribute("aria-current")).toBe("page");
    expect(summaryFor("from")?.textContent).toBe("Defold 1.12.4");
    expect(summaryFor("to")?.textContent).toBe("Defold 1.13.0");
  });

  test("clears the previously-marked option in each column independently", () => {
    const { root, optionFor } = selectorDom();
    reconcileRangeSelector(root, { from: "defold-1.12.4", to: DEFAULT });
    reconcileRangeSelector(root, { from: OLDEST, to: "defold-1.12.4" });
    expect(optionFor("from", "defold-1.12.4")?.getAttribute("aria-current")).toBeNull();
    expect(optionFor("from", "defold-1.12.4")?.querySelector("[data-range-dot]")).toBeNull();
    expect(optionFor("to", DEFAULT)?.getAttribute("aria-current")).toBeNull();
    expect(optionFor("from", OLDEST)?.getAttribute("aria-current")).toBe("page");
    expect(optionFor("to", "defold-1.12.4")?.getAttribute("aria-current")).toBe("page");
  });

  test("marks the same version in both columns when the window is a single version", () => {
    const { root, optionFor } = selectorDom();
    reconcileRangeSelector(root, { from: "defold-1.12.4", to: "defold-1.12.4" });
    expect(optionFor("from", "defold-1.12.4")?.getAttribute("aria-current")).toBe("page");
    expect(optionFor("to", "defold-1.12.4")?.getAttribute("aria-current")).toBe("page");
  });

  test("exposes the reconciled range on the document element", () => {
    const { root } = selectorDom();
    reconcileRangeSelector(root, { from: "defold-1.12.4", to: DEFAULT });
    expect(root.getAttribute("data-api-range-current")).toBe("defold-1.12.4|defold-1.13.0");
  });
});

// The pre-paint `<script>` embeds these functions with `.toString()`, so their
// bodies run with no module scope at all. Re-evaluating each one through
// `new Function` reproduces exactly that isolation: any module-scope reference —
// an imported constant, a sibling helper, a hoisted regex — throws here while
// type-checking and the normal in-module call both stay green.
describe("pre-paint serialization contract", () => {
  const isolate = <T>(fn: T): T =>
    new Function(`"use strict";return (${String(fn)});`)() as unknown as T;

  test("readStoredRange runs with no module scope", () => {
    const isolated = isolate(readStoredRange);
    expect(isolated("/api/camera", "", "combined", CONFIG)).toEqual(FULL);
    expect(isolated("/api/defold-1.12.4/go", "?since=defold-1.12.0", null, CONFIG)).toEqual({
      from: OLDEST,
      to: "defold-1.12.4",
    });
  });

  test("resolveApiSurfaceRedirect runs with no module scope", () => {
    const isolated = isolate(resolveApiSurfaceRedirect);
    expect(isolated("/api/go", "", "defold-1.12.4", CONFIG, isolate(readStoredRange))).toBe(
      "/api/defold-1.12.4/go",
    );
  });

  test("reconcileRangeSelector runs with no module scope", () => {
    const doc = new FakeDoc();
    const root = doc.createElement("div");
    root.documentElement = root;
    const option = doc.createElement("a");
    option.setAttribute("data-range-option", DEFAULT);
    option.setAttribute("data-range-bound", "to");
    const label = doc.createElement("span");
    label.textContent = "Defold 1.13.0";
    option.appendChild(label);
    root.appendChild(option);
    const summary = doc.createElement("span");
    summary.setAttribute("data-range-summary", "to");
    root.appendChild(summary);

    isolate(reconcileRangeSelector)(root, { from: OLDEST, to: DEFAULT });
    expect(option.getAttribute("aria-current")).toBe("page");
    expect(summary.textContent).toBe("Defold 1.13.0");
  });
});

// The duplicate-content contract between the two routes that now render the same
// surface: `/api/<default-version>/<ns>` is the window `{oldest, default}`, which
// is exactly what canonical `/api/<ns>` renders. Only that pair is a duplicate —
// a historical version's page is its own content and must claim no canonical.
// These cases decide the URL only. `canonicalLinkPath` is serialized into the
// pre-paint script and cannot read a surface, so the inventories the verdict
// rests on are proven in `api-routing-migration.test.ts` instead.
describe("canonicalLinkPath", () => {
  const config: ApiSurfaceConfig = {
    base: "",
    versionIds: ["defold-3.0.0", "defold-2.0.0"],
    defaultVersionId: "defold-3.0.0",
    namespacesByVersion: { "defold-3.0.0": ["demo"], "defold-2.0.0": ["demo"] },
  };

  test("the default version's namespace page points at the bare canonical route", () => {
    expect(canonicalLinkPath("/api/defold-3.0.0/demo", config, "defold-3.0.0")).toBe("/api/demo");
  });

  test("the default version's index points at the bare API index", () => {
    expect(canonicalLinkPath("/api/defold-3.0.0", config, "defold-3.0.0")).toBe("/api");
  });

  test("a historical version's page is its own content and claims no canonical", () => {
    expect(canonicalLinkPath("/api/defold-2.0.0/demo", config, "defold-3.0.0")).toBeNull();
  });

  test("an already-canonical page and a non-API route claim nothing", () => {
    expect(canonicalLinkPath("/api/demo", config, "defold-3.0.0")).toBeNull();
    expect(canonicalLinkPath("/guides", config, "defold-3.0.0")).toBeNull();
  });

  test("re-applies the deploy base", () => {
    const based: ApiSurfaceConfig = { ...config, base: "/toolchain" };
    expect(canonicalLinkPath("/toolchain/api/defold-3.0.0/demo", based, "defold-3.0.0")).toBe(
      "/toolchain/api/demo",
    );
  });

  test("claims nothing when no default version is known", () => {
    expect(canonicalLinkPath("/api/defold-3.0.0/demo", config, undefined)).toBeNull();
  });
});
