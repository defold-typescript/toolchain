import { describe, expect, test } from "bun:test";
import {
  type ApiSurfaceConfig,
  activeSurfaceForPath,
  currentSurfaceForRoute,
  reconcileSurfaceSelector,
  resolveApiSurfaceRedirect,
  rewriteApiNavForSurface,
  surfacePathForNamespace,
} from "./api-surface-pref";
import type { NavCategory } from "./nav";

// Combined is the canonical un-prefixed surface; `versionIds` now lists EVERY
// tracked version — the default (1.13.0) included — each owning a prefixed family.
const CONFIG: ApiSurfaceConfig = {
  base: "",
  defaultVersionId: "defold-1.13.0",
  versionIds: ["defold-1.13.0", "defold-1.12.4"],
  combinedNamespaces: ["camera", "go", "vmath"],
  // Each version's engine namespaces; version-independent namespaces (`Hash`,
  // `base`) are intentionally absent, so a version preference never prefixes them.
  namespacesByVersion: {
    "defold-1.13.0": ["camera", "go", "model"],
    "defold-1.12.4": ["go", "model"],
  },
};

const BASED: ApiSurfaceConfig = { ...CONFIG, base: "/toolchain" };

describe("resolveApiSurfaceRedirect — Combined is the canonical un-prefixed surface", () => {
  test("an un-prefixed page with no preference (or a combined preference) stays put", () => {
    expect(resolveApiSurfaceRedirect("/api/camera", null, CONFIG)).toBeNull();
    expect(resolveApiSurfaceRedirect("/api/camera", "", CONFIG)).toBeNull();
    expect(resolveApiSurfaceRedirect("/api/camera", "combined", CONFIG)).toBeNull();
    expect(resolveApiSurfaceRedirect("/api", null, CONFIG)).toBeNull();
  });

  test("a version preference — even the current version — prefixes an owned engine page", () => {
    expect(resolveApiSurfaceRedirect("/api/camera", "defold-1.13.0", CONFIG)).toBe(
      "/api/defold-1.13.0/camera",
    );
    expect(resolveApiSurfaceRedirect("/api/go", "defold-1.12.4", CONFIG)).toBe(
      "/api/defold-1.12.4/go",
    );
  });
});

describe("resolveApiSurfaceRedirect — explicit surfaces are honored", () => {
  test("an explicit Combined or versioned route is never redirected", () => {
    expect(resolveApiSurfaceRedirect("/api/combined/camera", null, CONFIG)).toBeNull();
    expect(resolveApiSurfaceRedirect("/api/defold-1.12.4/go", null, CONFIG)).toBeNull();
    expect(resolveApiSurfaceRedirect("/api/defold-1.13.0/camera", "combined", CONFIG)).toBeNull();
  });

  test("a non-API path is ignored", () => {
    expect(resolveApiSurfaceRedirect("/guides", "defold-1.12.4", CONFIG)).toBeNull();
    expect(resolveApiSurfaceRedirect("/", "combined", CONFIG)).toBeNull();
  });

  test("an unknown preference is ignored", () => {
    expect(resolveApiSurfaceRedirect("/api/camera", "bogus-surface", CONFIG)).toBeNull();
  });
});

describe("resolveApiSurfaceRedirect — version-ownership guard (current version included)", () => {
  test("a version-independent page the version does not own stays put (no version-prefixed 404)", () => {
    expect(resolveApiSurfaceRedirect("/api/base", "defold-1.12.4", CONFIG)).toBeNull();
    expect(resolveApiSurfaceRedirect("/api/Hash", "defold-1.13.0", CONFIG)).toBeNull();
  });

  test("an owned engine namespace still redirects to its version route", () => {
    expect(resolveApiSurfaceRedirect("/api/model", "defold-1.12.4", CONFIG)).toBe(
      "/api/defold-1.12.4/model",
    );
  });
});

describe("resolveApiSurfaceRedirect — base prefix", () => {
  test("strips and re-applies the deploy base", () => {
    expect(resolveApiSurfaceRedirect("/toolchain/api/camera", "defold-1.13.0", BASED)).toBe(
      "/toolchain/api/defold-1.13.0/camera",
    );
  });

  test("no-op when the based target equals the current path", () => {
    expect(
      resolveApiSurfaceRedirect("/toolchain/api/defold-1.13.0/camera", "defold-1.13.0", BASED),
    ).toBeNull();
  });
});

describe("activeSurfaceForPath", () => {
  test("un-prefixed engine and version-independent pages read as Combined", () => {
    expect(activeSurfaceForPath("/api/camera", CONFIG)).toBe("combined");
    expect(activeSurfaceForPath("/api/Hash", CONFIG)).toBe("combined");
    expect(activeSurfaceForPath("/api", CONFIG)).toBe("combined");
    expect(activeSurfaceForPath("/guides", CONFIG)).toBe("combined");
  });

  test("an explicit version prefix reads as that version", () => {
    expect(activeSurfaceForPath("/api/defold-1.13.0/camera", CONFIG)).toBe("defold-1.13.0");
    expect(activeSurfaceForPath("/api/defold-1.12.4/camera", CONFIG)).toBe("defold-1.12.4");
  });

  test("honors the deploy base", () => {
    expect(activeSurfaceForPath("/toolchain/api/defold-1.12.4/go", BASED)).toBe("defold-1.12.4");
  });
});

describe("currentSurfaceForRoute", () => {
  test("an explicit prefix wins over the stored preference", () => {
    expect(currentSurfaceForRoute("/api/combined/go", "defold-1.12.4", CONFIG)).toBe("combined");
    expect(currentSurfaceForRoute("/api/defold-1.12.4/model", "combined", CONFIG)).toBe(
      "defold-1.12.4",
    );
  });

  test("an un-prefixed page keeps a validated stored surface (no flip to Combined)", () => {
    expect(currentSurfaceForRoute("/api/Hash", "defold-1.12.4", CONFIG)).toBe("defold-1.12.4");
  });

  test("a new user, an unknown pref, and non-API routes resolve to Combined", () => {
    expect(currentSurfaceForRoute("/api/Hash", null, CONFIG)).toBe("combined");
    expect(currentSurfaceForRoute("/api/Hash", "bogus", CONFIG)).toBe("combined");
    expect(currentSurfaceForRoute("/guides/intro", "defold-1.12.4", CONFIG)).toBe("combined");
  });

  test("honors the deploy base prefix", () => {
    expect(currentSurfaceForRoute("/toolchain/api/Hash", "defold-1.12.4", BASED)).toBe(
      "defold-1.12.4",
    );
  });

  test("is serializable — references no module-scope identifiers", () => {
    const source = currentSurfaceForRoute.toString();
    expect(source).not.toContain("COMBINED_VERSION_ID");
    expect(source).toContain('"combined"');
  });
});

describe("surfacePathForNamespace", () => {
  test("Combined is un-prefixed; every version — the default included — is prefixed", () => {
    expect(surfacePathForNamespace("combined", "camera")).toBe("/api/camera");
    expect(surfacePathForNamespace("combined", undefined)).toBe("/api");
    expect(surfacePathForNamespace("defold-1.13.0", "camera")).toBe("/api/defold-1.13.0/camera");
    expect(surfacePathForNamespace("defold-1.12.4", "go")).toBe("/api/defold-1.12.4/go");
  });
});

describe("rewriteApiNavForSurface", () => {
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
            { label: "go", labelHtml: "go", route: "/api/go" },
            { label: "base", labelHtml: "base", route: "/api/base" },
          ],
        },
      ],
    },
  ];

  test("remaps only the surface's engine leaves and the api root onto a version", () => {
    const out = rewriteApiNavForSurface(nav(), "defold-1.12.4", ["go", "model"]);
    const api = out.find((c) => c.id === "api");
    expect(api?.route).toBe("/api/defold-1.12.4");
    const leaves = api?.links[0]?.children ?? [];
    expect(leaves.find((l) => l.label === "go")?.route).toBe("/api/defold-1.12.4/go");
    // `base` is not owned by the version, so its route is left canonical.
    expect(leaves.find((l) => l.label === "base")?.route).toBe("/api/base");
  });

  test("is a no-op on the canonical Combined surface", () => {
    const input = nav();
    expect(rewriteApiNavForSurface(input, "combined", ["go"])).toBe(input);
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

describe("reconcileSurfaceSelector (DOM contract)", () => {
  function selectorDom() {
    const doc = new FakeDoc();
    const root = doc.createElement("div");
    const labels: Record<string, string> = {
      combined: "Combined",
      "defold-1.13.0": "Defold 1.13.0",
      "defold-1.12.4": "Defold 1.12.4",
    };
    for (const id of ["combined", "defold-1.13.0", "defold-1.12.4"]) {
      const option = doc.createElement("a");
      option.setAttribute("data-api-surface", id);
      const label = doc.createElement("span");
      label.textContent = labels[id] as string;
      option.appendChild(label);
      root.appendChild(option);
    }
    const summary = doc.createElement("span");
    summary.setAttribute("data-surface-summary", "");
    summary.textContent = "Defold 1.13.0";
    root.appendChild(summary);
    const optionFor = (id: string) =>
      root
        .querySelectorAll("[data-api-surface]")
        .find((o) => o.getAttribute("data-api-surface") === id);
    return { root, summary, optionFor };
  }

  test("activates the Combined option and sets the summary to 'Combined'", () => {
    const { root, summary, optionFor } = selectorDom();
    reconcileSurfaceSelector(root, "combined");
    const combined = optionFor("combined");
    expect(combined?.getAttribute("aria-current")).toBe("page");
    expect(combined?.className).toContain("text-accent");
    expect(combined?.querySelector("[data-surface-dot]")).not.toBeNull();
    expect(summary.textContent).toBe("Combined");
  });

  test("activates a version option and copies its label into the summary", () => {
    const { root, summary, optionFor } = selectorDom();
    reconcileSurfaceSelector(root, "defold-1.13.0");
    expect(optionFor("defold-1.13.0")?.getAttribute("aria-current")).toBe("page");
    expect(summary.textContent).toBe("Defold 1.13.0");
    // The non-active options carry no marker and no dot.
    const combined = optionFor("combined");
    expect(combined?.getAttribute("aria-current")).toBeNull();
    expect(combined?.querySelector("[data-surface-dot]")).toBeNull();
  });

  test("is serializable — references no module-scope identifiers", () => {
    const source = reconcileSurfaceSelector.toString();
    expect(source).not.toContain("COMBINED_VERSION_ID");
  });
});
