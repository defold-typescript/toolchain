import { describe, expect, test } from "bun:test";
import type { Equal } from "../../types/test-d/type-assert";
import {
  add,
  addSystem,
  type Filter,
  filter,
  processingSystem,
  rejectAll,
  rejectAny,
  remove,
  removeSystem,
  requireAll,
  requireAny,
  type SystemFields,
  setSystemIndex,
  sortedProcessingSystem,
  sortedSystem,
  system,
  tryFilter,
  type With,
  world,
} from "./index";

// The assertions here are the compiler's: `bun run typecheck` checks this file under
// both package tsconfigs, and each `@ts-expect-error` must meet the error it names.

interface Spring {
  k: number;
}

interface Ent {
  name: string;
  spring?: Spring;
  active?: boolean;
  dragged?: boolean;
}

type SpringOrDragged = With<Ent, "spring"> | With<Ent, "dragged">;

describe("filter narrowing", () => {
  test("requireAll makes its components present in process and onAdd", () => {
    const built = processingSystem<Ent>()(requireAll("spring", "active"), {
      process(e, dt) {
        const k: number = e.spring.k * dt;
        const active: boolean = e.active;
        void [k, active];
      },
      onAdd(e) {
        const k: number = e.spring.k;
        const active: boolean = e.active;
        void [k, active];
      },
    });
    expect(built.process).toBeTypeOf("function");
  });

  test("onRemove takes the unnarrowed entity, since a changed entity leaves without the component", () => {
    const built = processingSystem<Ent>()(requireAll("spring", "active"), {
      process() {},
      onRemove(e) {
        // @ts-expect-error onRemove may see an entity whose required component is gone
        const k: number = e.spring.k;
        if (e.spring !== undefined) {
          const guarded: number = e.spring.k;
          void guarded;
        }
        void k;
      },
    });
    expect(built.onRemove).toBeTypeOf("function");
  });

  test("a nested filter keeps the top-level requireAll's narrowing and adds none", () => {
    const built = processingSystem<Ent>()(requireAll("spring", rejectAny("dragged")), {
      process(e) {
        const k: number = e.spring.k;
        // @ts-expect-error a rejectAny inside requireAll leaves `dragged` optional
        const dragged: boolean = e.dragged;
        void [k, dragged];
      },
    });
    expect(built.process).toBeTypeOf("function");
  });

  test("requireAny makes no single alternative certain, and rejectAll, rejectAny and a boolean custom filter narrow nothing", () => {
    const factory = processingSystem<Ent>();
    const any = factory(requireAny("spring", "active"), {
      process(e) {
        // @ts-expect-error `spring` stays optional until a check rules `active` out
        const k: number = e.spring.k;
        void k;
      },
    });
    const rejectsAll = factory(rejectAll("spring", "active"), {
      process(e) {
        // @ts-expect-error rejectAll leaves `spring` optional
        const k: number = e.spring.k;
        void k;
      },
    });
    const rejectsAny = factory(rejectAny("dragged"), {
      process(e) {
        // @ts-expect-error rejectAny leaves `spring` optional
        const k: number = e.spring.k;
        void k;
      },
    });
    const custom = factory((_system: unknown, e: Ent) => e.spring !== undefined, {
      process(e) {
        // @ts-expect-error a custom filter leaves `spring` optional
        const k: number = e.spring.k;
        void k;
      },
    });
    expect([any, rejectsAll, rejectsAny, custom]).toHaveLength(4);
  });

  test("a plain system narrows onAdd, and update takes dt as a number", () => {
    const built = system<Ent>()(requireAll("spring"), {
      onAdd(e) {
        const k: number = e.spring.k;
        void k;
      },
      update: (dt) => {
        const seconds: number = dt;
        void seconds;
      },
    });
    expect(built.update).toBeTypeOf("function");
  });
});

describe("requireAny narrows to each alternative", () => {
  test("an in check that rules one alternative out leaves the other's components present", () => {
    const built = processingSystem<Ent>()(requireAny("spring", "dragged"), {
      process(e) {
        const exact: Equal<typeof e, SpringOrDragged> = true;
        if (!("spring" in e)) {
          const d: boolean = e.dragged;
          void d;
        }
        // @ts-expect-error neither alternative is certain before a check
        const k: number = e.spring.k;
        void [exact, k];
      },
    });
    expect(built.process).toBeTypeOf("function");
  });

  test("requireAll over requireAny narrows to each combination", () => {
    const built = processingSystem<Ent>()(requireAll("active", requireAny("spring", "dragged")), {
      process(e) {
        const exact: Equal<
          typeof e,
          With<Ent, "active" | "spring"> | With<Ent, "active" | "dragged">
        > = true;
        const a: boolean = e.active;
        if (!("spring" in e)) {
          const d: boolean = e.dragged;
          void d;
        }
        void [exact, a];
      },
    });
    expect(built.process).toBeTypeOf("function");
  });

  test("onAdd, this.entities and the returned system's entities carry the same alternatives", () => {
    const built = processingSystem<Ent>()(requireAny("spring", "dragged"), {
      onAdd(e) {
        const exact: Equal<typeof e, SpringOrDragged> = true;
        void exact;
      },
      postProcess() {
        for (const e of this.entities ?? []) {
          const exact: Equal<typeof e, SpringOrDragged> = true;
          void exact;
        }
      },
    });
    const held: Equal<NonNullable<typeof built.entities>[number], SpringOrDragged> = true;
    expect(held).toBe(true);
  });

  test("a pattern of names joined by & narrows like requireAll, and any other pattern narrows nothing", () => {
    const factory = processingSystem<Ent>();
    const joined = factory(filter("spring&active"), {
      process(e) {
        const k: number = e.spring.k;
        const a: boolean = e.active;
        void [k, a];
      },
    });
    const either = factory(filter("spring|active"), {
      process(e) {
        // @ts-expect-error a pattern with `|` leaves `spring` optional
        const k: number = e.spring.k;
        void k;
      },
    });
    const negated = factory(filter("!dragged"), {
      process(e) {
        // @ts-expect-error a pattern with `!` leaves `dragged` optional
        const d: boolean = e.dragged;
        void d;
      },
    });
    expect([joined, either, negated]).toHaveLength(3);
  });

  test("a type-predicate function filter narrows to its asserted type, and a boolean one narrows nothing", () => {
    const factory = processingSystem<Ent>();
    const asserted = factory(
      (_s: unknown, e: Ent): e is Ent & { spring: Spring } => e.spring !== undefined,
      {
        process(e) {
          const k: number = e.spring.k;
          void k;
        },
      },
    );
    const plain = factory((_s: unknown, e: Ent): boolean => e.spring !== undefined, {
      process(e) {
        // @ts-expect-error a boolean function filter leaves `spring` optional
        const k: number = e.spring.k;
        void k;
      },
    });
    expect([asserted, plain]).toHaveLength(2);
  });

  test("rejectAny narrows nothing, a two-argument Filter annotation still narrows, and a misspelled alternative is an error", () => {
    const rejects = processingSystem<Ent>()(rejectAny("dragged"), {
      process(e) {
        // @ts-expect-error rejectAny leaves `dragged` optional
        const d: boolean = e.dragged;
        void d;
      },
    });
    const annotated: Filter<"spring", "spring"> = requireAll("spring");
    const kept = processingSystem<Ent>()(annotated, {
      process(e) {
        const k: number = e.spring.k;
        void k;
      },
    });
    // Never called: the definitions hold what the types reject, and only the compiler reads them.
    const rejected = () => {
      processingSystem<Ent>()(
        // @ts-expect-error `sprng` is not a component of Ent
        requireAny("sprng", "dragged"),
        { process() {} },
      );
    };
    expect([rejects, kept, rejected]).toHaveLength(3);
  });
});

describe("a widened name or a union of patterns narrows only what every alternative requires", () => {
  type SpringOrActive = With<Ent, "spring"> | With<Ent, "active">;

  test("filter over a union of patterns narrows to one member per pattern", () => {
    const build = (p: "spring" | "active") =>
      processingSystem<Ent>()(filter(p), {
        process(e) {
          const exact: Equal<typeof e, SpringOrActive> = true;
          if (!("spring" in e)) {
            const a: boolean = e.active;
            void a;
          }
          // @ts-expect-error an entity passing `active` alone has no `spring`
          const k: number = e.spring.k;
          void [exact, k];
        },
        postProcess() {
          for (const e of this.entities ?? []) {
            const exact: Equal<typeof e, SpringOrActive> = true;
            void exact;
          }
        },
      });
    const built = build("spring");
    const held: Equal<NonNullable<typeof built.entities>[number], SpringOrActive> = true;
    expect(held).toBe(true);
  });

  test("a successful tryFilter over a union of patterns narrows to one member per pattern", () => {
    const build = (p: "spring" | "active") => {
      const result = tryFilter(p);
      if (!result.ok) {
        return undefined;
      }
      return processingSystem<Ent>()(result.filter, {
        process(e) {
          const exact: Equal<typeof e, SpringOrActive> = true;
          // @ts-expect-error an entity passing `active` alone has no `spring`
          const k: number = e.spring.k;
          void [exact, k];
        },
      });
    };
    expect(build("active")?.process).toBeTypeOf("function");
  });

  test("a pattern in the union that requires nothing makes nothing certain", () => {
    const build = (q: "spring" | "!dragged") =>
      processingSystem<Ent>()(filter(q), {
        process(e) {
          const exact: Equal<typeof e, With<Ent, "spring"> | Ent> = true;
          // @ts-expect-error an entity passing `!dragged` has no `spring`
          const k: number = e.spring.k;
          void [exact, k];
        },
      });
    expect(build("!dragged").process).toBeTypeOf("function");
  });

  test("patterns that all require a name keep it present", () => {
    const build = (two: "spring&active" | "spring&dragged") =>
      processingSystem<Ent>()(filter(two), {
        process(e) {
          const exact: Equal<
            typeof e,
            With<Ent, "spring" | "active"> | With<Ent, "spring" | "dragged">
          > = true;
          const k: number = e.spring.k;
          void [exact, k];
        },
      });
    expect(build("spring&dragged").process).toBeTypeOf("function");
  });

  test("a name typed as string makes no component certain", () => {
    const build = (name: string) => {
      const any = processingSystem<Ent>()(requireAny(name), {
        process(e) {
          const exact: Equal<typeof e, Ent> = true;
          // @ts-expect-error `name` may hold any component, so `dragged` is unchecked
          const d: boolean = e.dragged;
          void [exact, d];
        },
      });
      const all = processingSystem<Ent>()(requireAll(name), {
        process(e) {
          const exact: Equal<typeof e, Ent> = true;
          // @ts-expect-error `name` may hold any component, so `dragged` is unchecked
          const d: boolean = e.dragged;
          void [exact, d];
        },
      });
      const anyHeld: Equal<NonNullable<typeof any.entities>[number], Ent> = true;
      const allHeld: Equal<NonNullable<typeof all.entities>[number], Ent> = true;
      return [anyHeld, allHeld];
    };
    expect(build("dragged")).toEqual([true, true]);
  });

  test("a literal name beside a widened one in requireAll stays present", () => {
    const build = (name: string) => {
      const annotated: Filter<"spring", string> = requireAll("spring", name);
      const built = processingSystem<Ent>()(requireAll("spring", requireAny(name)), {
        process(e) {
          const exact: Equal<typeof e, With<Ent, "spring">> = true;
          const k: number = e.spring.k;
          // @ts-expect-error `name` may hold any component, so `dragged` is unchecked
          const d: boolean = e.dragged;
          void [exact, k, d];
        },
        postProcess() {
          for (const e of this.entities ?? []) {
            const exact: Equal<typeof e, With<Ent, "spring">> = true;
            void exact;
          }
        },
      });
      return [annotated, built];
    };
    expect(build("dragged")).toHaveLength(2);
  });

  test("a filter typed as plain Filter makes no component certain, and a literal name beside it does", () => {
    const loose: Filter = requireAll("spring");
    const alone = processingSystem<Ent>()(loose, {
      process(e) {
        const exact: Equal<typeof e, Ent> = true;
        void exact;
      },
    });
    const beside = processingSystem<Ent>()(requireAll("spring", loose), {
      process(e) {
        const exact: Equal<typeof e, With<Ent, "spring">> = true;
        void exact;
      },
    });
    expect([alone, beside]).toHaveLength(2);
  });
});

describe("definitions that fail to compile", () => {
  test("a misspelled component key, at the top level or nested, and update on a processing system", () => {
    // Never called: the definitions hold what the types reject, and only the compiler reads them.
    const rejected = () => {
      processingSystem<Ent>()(
        // @ts-expect-error `sprng` is not a component of Ent
        requireAll("sprng"),
        { process() {} },
      );
      processingSystem<Ent>()(
        // @ts-expect-error `dragd` is not a component of Ent, even inside rejectAny
        requireAll("spring", rejectAny("dragd")),
        { process() {} },
      );
      processingSystem<Ent>()(requireAll("spring"), {
        // @ts-expect-error a processing system's update is its own
        update() {},
      });
    };
    expect(rejected).toBeTypeOf("function");
  });
});

describe("sorted systems", () => {
  test("compare reads the entity narrowed as process does", () => {
    const processing = sortedProcessingSystem<Ent>()(requireAll("spring"), {
      compare(e1, e2) {
        return e1.spring.k < e2.spring.k;
      },
      process(e) {
        const k: number = e.spring.k;
        void k;
      },
    });
    const plain = sortedSystem<Ent>()(requireAll("spring"), {
      compare(e1, e2) {
        return e1.spring.k < e2.spring.k;
      },
    });
    expect([processing.compare, plain.compare]).toEqual([
      expect.any(Function),
      expect.any(Function),
    ]);
  });

  test("a definition without compare, with onModify, nocache or update, and a later nocache", () => {
    // Never called: the definitions hold what the types reject, and only the compiler reads them.
    const rejected = () => {
      // @ts-expect-error a sorted system needs compare
      sortedSystem<Ent>()({ name: "unordered" });
      sortedProcessingSystem<Ent>()(
        requireAll("spring"),
        // @ts-expect-error a sorted processing system needs compare
        { process() {} },
      );
      sortedSystem<Ent>()({
        compare: () => true,
        // @ts-expect-error a sorted system's onModify is its own
        onModify() {},
      });
      sortedProcessingSystem<Ent>()(requireAll("spring"), {
        compare: () => true,
        // @ts-expect-error a sorted system keeps its entities
        nocache: true,
      });
      sortedProcessingSystem<Ent>()(requireAll("spring"), {
        compare: () => true,
        // @ts-expect-error a processing system's update is its own
        update() {},
      });
      const built = sortedSystem<Ent>()({ compare: () => true });
      // @ts-expect-error a sorted system keeps its entities
      built.nocache = true;
    };
    expect(rejected).toBeTypeOf("function");
  });
});

describe("string filters", () => {
  test("a literal pattern's component names are checked, after ! and inside groups", () => {
    const accepted = processingSystem<Ent>()(filter("(spring|active)&!dragged"), {
      process() {},
    });
    // Never called: the definitions hold what the types reject, and only the compiler reads them.
    const rejected = () => {
      processingSystem<Ent>()(
        // @ts-expect-error `dragd` is not a component of Ent
        filter("spring&!dragd"),
        { process() {} },
      );
      processingSystem<Ent>()(
        // @ts-expect-error `sprng` is not a component of Ent
        filter("(spring|sprng)&active"),
        { process() {} },
      );
    };
    expect([accepted.process, rejected]).toEqual([expect.any(Function), expect.any(Function)]);
  });

  test("a pattern typed as string is not checked", () => {
    const pattern: string = "sprng|actve";
    const built = processingSystem<Ent>()(filter(pattern), { process() {} });
    expect(built.process).toBeTypeOf("function");
  });

  test("tryFilter's filter is reachable once ok narrows, and keeps its names", () => {
    const result = tryFilter("spring|active");
    // @ts-expect-error `filter` is there only once `ok` is checked
    void result.filter;
    const rejected = () => {
      const misspelled = tryFilter("spring|sprng");
      if (misspelled.ok) {
        processingSystem<Ent>()(
          // @ts-expect-error `sprng` is not a component of Ent
          misspelled.filter,
          { process() {} },
        );
      }
    };
    expect(result.ok).toBe(true);
    if (result.ok) {
      const built = processingSystem<Ent>()(result.filter, { process() {} });
      expect([built.process, rejected]).toEqual([expect.any(Function), expect.any(Function)]);
    }
  });
});

describe("this inside a callback", () => {
  test("is the system, custom definition fields included", () => {
    const built = processingSystem<Ent>()(requireAll("spring"), {
      settled: [] as Ent[],
      process(e) {
        if (e.spring.k === 0) {
          this.settled.push(e);
        }
        const index: number | undefined = this.index;
        void index;
      },
      postProcess() {
        while (this.settled.length > 0) {
          this.settled.pop();
        }
      },
    });
    expect(built.settled).toEqual([]);
  });
});

describe("entities takes the filter's narrowing", () => {
  test("this.entities in a processing system's callback holds the required components", () => {
    const built = processingSystem<Ent>()(requireAll("spring", "active"), {
      postProcess() {
        const e = this.entities?.[0];
        if (e !== undefined) {
          const k: number = e.spring.k;
          const active: boolean = e.active;
          void [k, active];
        }
      },
    });
    expect(built.postProcess).toBeTypeOf("function");
  });

  test("this.entities in a plain system's update holds the required components", () => {
    const built = system<Ent>()(requireAll("spring"), {
      update() {
        for (const e of this.entities ?? []) {
          const k: number = e.spring.k;
          void k;
        }
      },
    });
    expect(built.update).toBeTypeOf("function");
  });

  test("the system each filtered factory returns holds the required components", () => {
    const plain = system<Ent>()(requireAll("spring"), {});
    const processing = processingSystem<Ent>()(requireAll("spring"), { process() {} });
    const sorted = sortedSystem<Ent>()(requireAll("spring"), {
      compare: (e1, e2) => e1.spring.k < e2.spring.k,
    });
    const sortedProcessing = sortedProcessingSystem<Ent>()(requireAll("spring"), {
      compare: (e1, e2) => e1.spring.k < e2.spring.k,
      process() {},
    });
    const ks: (number | undefined)[] = [
      plain.entities?.[0]?.spring.k,
      processing.entities?.[0]?.spring.k,
      sorted.entities?.[0]?.spring.k,
      sortedProcessing.entities?.[0]?.spring.k,
    ];
    expect(ks).toEqual([undefined, undefined, undefined, undefined]);
  });

  test("the rejects, a pattern with |, a boolean function filter and no filter narrow nothing", () => {
    const factory = processingSystem<Ent>();
    const rejectsAll = factory(rejectAll("spring"), {
      postProcess() {
        for (const e of this.entities ?? []) {
          // @ts-expect-error rejectAll leaves `spring` optional
          const k: number = e.spring.k;
          void k;
        }
      },
    });
    const rejectsAny = factory(rejectAny("spring"), {
      postProcess() {
        for (const e of this.entities ?? []) {
          // @ts-expect-error rejectAny leaves `spring` optional
          const k: number = e.spring.k;
          void k;
        }
      },
    });
    const pattern = factory(filter("spring|active"), {
      postProcess() {
        for (const e of this.entities ?? []) {
          // @ts-expect-error a pattern with `|` leaves `spring` optional
          const k: number = e.spring.k;
          void k;
        }
      },
    });
    const custom = factory((_system: unknown, e: Ent) => e.spring !== undefined, {
      postProcess() {
        for (const e of this.entities ?? []) {
          // @ts-expect-error a boolean function filter leaves `spring` optional
          const k: number = e.spring.k;
          void k;
        }
      },
    });
    const unfiltered = system<Ent>()({
      update() {
        for (const e of this.entities ?? []) {
          // @ts-expect-error a system with no filter leaves `spring` optional
          const k: number = e.spring.k;
          void k;
        }
      },
    });
    expect([rejectsAll, rejectsAny, pattern, custom, unfiltered]).toHaveLength(5);
  });

  test("this.entities is undefined until the system joins a world", () => {
    const built = system<Ent>()(requireAll("spring"), {
      update() {
        // @ts-expect-error the list is undefined until the system joins a world
        const first = this.entities[0];
        void first;
      },
    });
    expect(built.entities).toBeUndefined();
  });

  test("a narrowed system passes where a plain one is expected", () => {
    const built = processingSystem<Ent>()(requireAll("spring"), { process() {} });
    // Never called: each call needs the system in a different world state, and only the
    // compiler reads them.
    const accepted = () => {
      const w = world<Ent>(built);
      addSystem(w, built);
      add(w, built);
      removeSystem(w, built);
      remove(w, built);
      setSystemIndex(w, built, 1);
      const systemsUnchanged: Equal<(typeof w.systems)[number], SystemFields<Ent>> = true;
      void systemsUnchanged;
    };
    expect(accepted).toBeTypeOf("function");
  });
});
