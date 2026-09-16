import { describe, expect, test } from "bun:test";
import { readsBothChannels } from "./self-typing-hook-reads.ts";

const PREAMBLE = `import { defineScript } from "@defold-typescript/types";

type ShipProps = { speed: number };
type ShipState = { phase?: "idle" | "boosting" };
`;

function fence(body: string): string {
  return `${PREAMBLE}
export default defineScript<ShipProps, ShipState>({
  properties: { speed: 120 },
${body}
});
`;
}

describe("hook-spelling recognition", () => {
  test("a method-declaration hook reading both channels answers true", () => {
    const source = fence(`  update(self) {
    if (self.phase !== "boosting") {
      self.speed += 1;
    }
  },`);
    expect(readsBothChannels(source, "speed", "phase")).toBe(true);
  });

  test("the same hook written as an arrow property answers true", () => {
    const source = fence(`  update: (self) => {
    if (self.phase !== "boosting") {
      self.speed += 1;
    }
  },`);
    expect(readsBothChannels(source, "speed", "phase")).toBe(true);
  });

  test("a function-expression property is inspected like the other spellings", () => {
    const source = fence(`  update: function (self) {
    if (self.phase !== "boosting") {
      self.speed += 1;
    }
  },`);
    expect(readsBothChannels(source, "speed", "phase")).toBe(true);
  });
});

describe("the fail-open regression", () => {
  test("an arrow-property hook missing the property-backed read answers false, even when `init` reads it", () => {
    const source = fence(`  init(self) {
    void self.speed;
    return { phase: "idle" } as const;
  },
  update: (self) => {
    if (self.phase !== "boosting") {
      void 0;
    }
  },`);
    expect(readsBothChannels(source, "speed", "phase")).toBe(false);
  });
});

describe("the single-hook requirement", () => {
  test("the two reads split across two non-`init` hooks answer false", () => {
    const source = fence(`  update(self) {
    self.speed += 1;
  },
  on_reload(self) {
    void self.phase;
  },`);
    expect(readsBothChannels(source, "speed", "phase")).toBe(false);
  });
});

describe("fail-closed behavior", () => {
  test("a fence whose only reads are inside `init` throws rather than answering", () => {
    const source = fence(`  init(self) {
    void self.speed;
    void self.phase;
  },`);
    expect(() => readsBothChannels(source, "speed", "phase")).toThrow(
      /no lifecycle hook outside `init`/,
    );
  });

  test("source with no `define*` hook table throws the same named error", () => {
    expect(() => readsBothChannels("const ship = { speed: 1 };\n", "speed", "phase")).toThrow(
      /no lifecycle hook outside `init`/,
    );
  });
});

describe("parameter binding", () => {
  test("reads off a hook's first parameter count whatever it is named", () => {
    const source = fence(`  update(ship) {
    if (ship.phase !== "boosting") {
      ship.speed += 1;
    }
  },`);
    expect(readsBothChannels(source, "speed", "phase")).toBe(true);
  });

  test("reads off an identifier that is not the hook's first parameter do not count", () => {
    const source = fence(`  update(ship) {
    const record = ship.log;
    if (record.phase !== "boosting") {
      ship.speed += 1;
    }
  },`);
    expect(readsBothChannels(source, "speed", "phase")).toBe(false);
  });
});

describe("nested binding shadows", () => {
  test("a nested callback parameter reusing the hook parameter's name does not count", () => {
    const source = fence(`  update(self) {
    entries.forEach((self) => {
      if (self.phase !== "boosting") {
        self.speed += 1;
      }
    });
  },`);
    expect(readsBothChannels(source, "speed", "phase")).toBe(false);
  });

  test("a nested block-scoped `const` reusing the hook parameter's name does not count", () => {
    const source = fence(`  update(self) {
    {
      const self = snapshot;
      if (self.phase !== "boosting") {
        self.speed += 1;
      }
    }
  },`);
    expect(readsBothChannels(source, "speed", "phase")).toBe(false);
  });

  test("reads off the real first parameter inside a nested non-shadowing closure still count", () => {
    const source = fence(`  update(self) {
    timer.delay(0, false, () => {
      if (self.phase !== "boosting") {
        self.speed += 1;
      }
    });
  },`);
    expect(readsBothChannels(source, "speed", "phase")).toBe(true);
  });
});
