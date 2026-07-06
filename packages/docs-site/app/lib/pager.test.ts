import { describe, expect, test } from "bun:test";
import type { NavCategory, NavLink } from "./nav";
import { buildPager } from "./pager";

function link(label: string, route: string): NavLink {
  return { label, labelHtml: `html:${label}`, route };
}

function group(label: string, children: NavLink[]): NavLink {
  return { label, labelHtml: `html:${label}`, children };
}

const nav: NavCategory[] = [
  {
    id: "get-started",
    label: "Get started",
    links: [link("A1", "/a1"), link("A2", "/a2"), link("A3", "/a3")],
  },
  {
    id: "guides",
    label: "Guides",
    links: [link("B1", "/b1"), link("B2", "/b2")],
  },
  {
    id: "reference",
    label: "Reference",
    links: [
      group("Globals", [link("G1", "/api/g1"), link("G2", "/api/g2")]),
      group("Defold", [link("D1", "/api/d1")]),
    ],
  },
];

describe("buildPager", () => {
  test("mid-topic neighbors stay within the topic", () => {
    const { prev, next } = buildPager(nav, "/a2");
    expect(prev?.route).toBe("/a1");
    expect(prev?.crossesTopic).toBe(false);
    expect(next?.route).toBe("/a3");
    expect(next?.crossesTopic).toBe(false);
  });

  test("a topic's last page points next into the following topic", () => {
    const { next } = buildPager(nav, "/a3");
    expect(next?.route).toBe("/b1");
    expect(next?.crossesTopic).toBe(true);
    expect(next?.topicId).toBe("guides");
    expect(next?.topicLabel).toBe("Guides");
  });

  test("a non-first topic's first page points prev into the previous topic", () => {
    const { prev } = buildPager(nav, "/b1");
    expect(prev?.route).toBe("/a3");
    expect(prev?.crossesTopic).toBe(true);
    expect(prev?.topicLabel).toBe("Get started");
  });

  test("the first page in reading order has no prev; the last has no next", () => {
    expect(buildPager(nav, "/a1").prev).toBeUndefined();
    expect(buildPager(nav, "/api/d1").next).toBeUndefined();
  });

  test("a route absent from the nav yields no neighbors", () => {
    const pager = buildPager(nav, "/missing");
    expect(pager.prev).toBeUndefined();
    expect(pager.next).toBeUndefined();
  });

  test("flattening descends into reference children, sub-group hops stay within the topic", () => {
    const { prev, next } = buildPager(nav, "/api/g2");
    expect(prev?.route).toBe("/api/g1");
    expect(prev?.crossesTopic).toBe(false);
    // Globals -> Defold is a sub-group hop inside the single Reference top topic.
    expect(next?.route).toBe("/api/d1");
    expect(next?.crossesTopic).toBe(false);
  });

  test("flattening descends into nested library subgroups", () => {
    const nested: NavCategory[] = [
      {
        id: "reference",
        label: "Reference",
        links: [
          group("Libraries", [
            group("defold-saver", [
              link("saver.saver", "/api/saver.saver"),
              link("saver.storage", "/api/saver.storage"),
            ]),
          ]),
        ],
      },
    ];
    const { prev, next } = buildPager(nested, "/api/saver.storage");
    expect(prev?.route).toBe("/api/saver.saver");
    expect(prev?.crossesTopic).toBe(false);
    expect(next).toBeUndefined();
  });

  test("crossing into or out of Reference is a cross-topic hop", () => {
    const outOf = buildPager(nav, "/b2");
    expect(outOf.next?.route).toBe("/api/g1");
    expect(outOf.next?.crossesTopic).toBe(true);
    const into = buildPager(nav, "/api/g1");
    expect(into.prev?.route).toBe("/b2");
    expect(into.prev?.crossesTopic).toBe(true);
  });

  test("category index routes are first-class pager entries", () => {
    const withIndex: NavCategory[] = [
      { id: "guides", label: "Guides", links: [link("Guide", "/guide")] },
      {
        id: "api",
        label: "API",
        route: "/api",
        links: [group("Defold", [link("go", "/api/go")])],
      },
    ];
    const outOf = buildPager(withIndex, "/guide");
    expect(outOf.next?.route).toBe("/api");
    expect(outOf.next?.label).toBe("API");
    expect(outOf.next?.crossesTopic).toBe(true);

    const index = buildPager(withIndex, "/api");
    expect(index.prev?.route).toBe("/guide");
    expect(index.next?.route).toBe("/api/go");
    expect(index.next?.crossesTopic).toBe(false);
  });

  test("each neighbor carries route, label, labelHtml, topicId, topicLabel, crossesTopic", () => {
    const { prev, next } = buildPager(nav, "/a3");
    expect(prev).toEqual({
      route: "/a2",
      label: "A2",
      labelHtml: "html:A2",
      topicId: "get-started",
      topicLabel: "Get started",
      crossesTopic: false,
    });
    expect(next).toEqual({
      route: "/b1",
      label: "B1",
      labelHtml: "html:B1",
      topicId: "guides",
      topicLabel: "Guides",
      crossesTopic: true,
    });
  });
});
