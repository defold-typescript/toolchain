import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sequence } from "@defold-typescript/hsm/async";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { Demo } from "./demos";
import { mountDemos } from "./view";

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

// The spec is not on the tutorial page, and every DEMOS entry must be placed there, so it stays
// local to this file. Its wait is filed while the diagram is mounted.
const waiter: Demo = {
  title: "Waiter",
  subtitle: "A routine that waits.",
  config: {
    initial: "/hello",
    states: {
      hello: {
        task: sequence(async (_ctx, signal) => {
          await signal.wait(1);
        }),
      },
    },
  },
  ctx: () => ({}),
  buttons: [],
  readout: () => [],
};

// Happy DOM's observer reports no host on screen, so no frame steps the run.
function mount() {
  const host = document.createElement("div");
  host.dataset.hsmDemo = "waiter";
  document.body.append(host);
  const dispose = mountDemos([host], { waiter });
  const log = host.querySelector(".hsm-log") as HTMLElement;
  return { host, log, dispose };
}

function added(log: HTMLElement, from: number): (string | null)[] {
  return Array.from(log.children)
    .slice(from)
    .map((entry) => entry.textContent);
}

describe("the function mountDemos returns", () => {
  test("it discards a run that waits in a routine", () => {
    const { host, log, dispose } = mount();
    const mark = log.childElementCount;
    dispose();
    const lines = added(log, mark);
    expect(lines).toContain("/hello: task cleanup ran");
    expect(lines).toContain("timer.cancel: the 1 s wait was cancelled");
    expect(host.childElementCount).toBe(0);
    expect(() => timer.delay(1, false, () => {})).toThrow(
      "timer.delay was called with no demo running",
    );
  });

  test("a restarted diagram discards the run it has now", () => {
    const { host, log, dispose } = mount();
    const restart = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Restart machine",
    ) as HTMLButtonElement;
    restart.click();
    const mark = log.childElementCount;
    dispose();
    expect(added(log, mark)).toContain("timer.cancel: the 1 s wait was cancelled");
  });
});
