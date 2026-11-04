import { describe, expect, test } from "bun:test";
import { processingSystem, rejectAll, rejectAny, requireAll, requireAny, system } from "./index";

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
  test("requireAll makes its components present in process, onAdd and onRemove", () => {
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
      onRemove(e) {
        const k: number = e.spring.k;
        const active: boolean = e.active;
        void [k, active];
      },
    });
    expect(built.process).toBeTypeOf("function");
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
