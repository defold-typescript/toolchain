import { describe, expect, test } from "bun:test";
import {
  processingSystem,
  rejectAll,
  rejectAny,
  requireAll,
  requireAny,
  sortedProcessingSystem,
  sortedSystem,
  system,
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

  test("requireAny, rejectAll, rejectAny and a custom filter narrow nothing", () => {
    const factory = processingSystem<Ent>();
    const any = factory(requireAny("spring", "active"), {
      process(e) {
        // @ts-expect-error requireAny leaves `spring` optional
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
