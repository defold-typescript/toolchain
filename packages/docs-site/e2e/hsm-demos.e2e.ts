import { expect, type Locator, type Page, test } from "@playwright/test";

// The state machines tutorial replaces each `[data-hsm-demo]` placeholder with a
// live diagram running the real hsm library. Pressing the first buddy's POKE lights
// its `awake` box and narrates the step in the log, naming each state by its full path.

test("the first buddy demo wakes up and logs the transition", async ({ page }) => {
  await page.goto("/state-machines-tutorial");
  const demo = page.locator('[data-hsm-demo="buddy-first"] .hsm-demo');
  await expect(demo).toBeVisible();

  const awakeBox = demo.locator(".hsm-state", {
    has: page.locator(".hsm-state-name", { hasText: /^awake$/ }),
  });
  const log = demo.locator(".hsm-log li");
  await expect(awakeBox).not.toHaveClass(/hsm-on/);
  const before = await log.count();

  await demo.getByRole("button", { name: "POKE" }).click();
  await expect(awakeBox).toHaveClass(/hsm-on/);
  await expect(log).toHaveCount(before + 3);
  await expect(log.last()).toHaveText("enter /awake");
});

test("the first buddy's figure follows the machine", async ({ page }) => {
  await page.goto("/state-machines-tutorial");
  const demo = page.locator('[data-hsm-demo="buddy-first"] .hsm-demo');
  await expect(demo).toBeVisible();

  const asleep = demo.getByRole("img", { name: "buddy asleep", exact: true });
  await expect(asleep).toBeVisible();
  await expect(asleep.locator(".hsm-b-eyes-shut")).toHaveCSS("opacity", "1");
  await expect(asleep.locator(".hsm-b-eyes-open")).toHaveCSS("opacity", "0");

  await demo.getByRole("button", { name: "POKE" }).click();
  const awake = demo.getByRole("img", { name: "buddy awake", exact: true });
  await expect(awake).toBeVisible();
  await expect(awake.locator(".hsm-b-eyes-open")).toHaveCSS("opacity", "1");
  await expect(awake.locator(".hsm-b-eyes-shut")).toHaveCSS("opacity", "0");
});

// Each timed demo runs on an animation-frame loop of its own. Rewriting DOM nodes
// on every frame makes WebKit pull the page back while the reader scrolls, so a
// demo whose shown values have not changed must leave its DOM untouched.

function stateBox(page: Page, demo: Locator, name: string): Locator {
  return demo.locator(".hsm-state", {
    has: page.locator(".hsm-state-name", { hasText: new RegExp(`^${name}$`) }),
  });
}

// A state with no children, by name: `stateBox` would match its parent too.
function leafBox(page: Page, demo: Locator, name: string): Locator {
  return demo.locator(".hsm-state:not(.hsm-compound)", {
    has: page.locator(".hsm-state-name", { hasText: new RegExp(`^${name}$`) }),
  });
}

function mutationsOver(host: Locator, ms: number): Promise<number> {
  return host.evaluate(
    (node, duration) =>
      new Promise<number>((resolve) => {
        let count = 0;
        const observer = new MutationObserver((records) => {
          count += records.length;
        });
        observer.observe(node, {
          childList: true,
          attributes: true,
          characterData: true,
          subtree: true,
        });
        const start = performance.now();
        const tick = (now: number) => {
          if (now - start < duration) {
            requestAnimationFrame(tick);
            return;
          }
          const pending = observer.takeRecords().length;
          observer.disconnect();
          resolve(count + pending);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

test("an idle timed demo writes nothing between frames", async ({ page }) => {
  await page.goto("/state-machines-tutorial");
  for (const id of ["buddy-time", "buddy-waking", "buddy-queue"]) {
    const host = page.locator(`[data-hsm-demo="${id}"]`);
    await host.scrollIntoViewIfNeeded();
    await expect(host.locator(".hsm-demo")).toBeVisible();
    expect(await mutationsOver(host, 1000), `${id} mutations while idle`).toBe(0);
  }

  // The 1 s fade runs at half speed, so the heartbeat takes two seconds to wake the buddy.
  const waking = page.locator('[data-hsm-demo="buddy-waking"] .hsm-demo');
  await waking.scrollIntoViewIfNeeded();
  await waking.getByRole("button", { name: "POKE" }).click();
  await expect(stateBox(page, waking, "awake")).toHaveClass(/hsm-on/, { timeout: 4000 });
});

test("the queue demo's clock starts paused", async ({ page }) => {
  await page.goto("/state-machines-tutorial");
  const demo = page.locator('[data-hsm-demo="buddy-queue"] .hsm-demo');
  await demo.scrollIntoViewIfNeeded();
  await expect(stateBox(page, demo, "waking")).toHaveClass(/hsm-on/);
  const resume = demo.getByRole("button", { name: "Resume time" });
  await expect(resume).toBeVisible();

  await resume.click();
  await expect(stateBox(page, demo, "awake")).toHaveClass(/hsm-on/, { timeout: 4000 });
  await expect(demo.getByRole("button", { name: "Pause time" })).toBeVisible();
});

// A filled button sends an event an active state takes now, and the rules of a
// state that is not active are dimmed.

test("a filled button is one the machine takes", async ({ page }) => {
  await page.goto("/state-machines-tutorial");
  const demo = page.locator('[data-hsm-demo="buddy-nested"] .hsm-demo');
  await demo.scrollIntoViewIfNeeded();
  const poke = demo.getByRole("button", { name: "POKE", exact: true });
  const see = demo.getByRole("button", { name: "SEE_PLAYER", exact: true });
  const lose = demo.getByRole("button", { name: "LOSE_PLAYER", exact: true });
  const transparent = "rgba(0, 0, 0, 0)";

  await expect(poke).toHaveClass(/hsm-can/);
  await expect(poke).not.toHaveCSS("background-color", transparent);
  await expect(see).not.toHaveClass(/hsm-can/);
  await expect(see).toHaveCSS("background-color", transparent);

  await poke.click();
  await expect(see).toHaveClass(/hsm-can/);
  await expect(lose).not.toHaveClass(/hsm-can/);
  // Found by their text: `stateBox` matches a parent box too, and the name of
  // `wander` carries "starts here".
  await expect(demo.locator("li.hsm-rule", { hasText: "SEE_PLAYER" })).toHaveCSS("opacity", "1");
  await expect(demo.locator("li.hsm-rule", { hasText: "LOSE_PLAYER" })).toHaveCSS(
    "opacity",
    "0.55",
  );
});

// Only demos the reader can see advance, so a running demo scrolled out of view
// stops writing until it is back on screen.

test("an off-screen demo pauses", async ({ page }) => {
  await page.goto("/state-machines-tutorial");
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
  });
  const host = page.locator('[data-hsm-demo="buddy-time"]');
  await host.scrollIntoViewIfNeeded();
  // An awake buddy's 30 s timer bar moves on every frame.
  await host.getByRole("button", { name: "POKE", exact: true }).click();

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(host).not.toBeInViewport();
  // A rule chip's highlight clears on a 650 ms timer that runs even while paused.
  await page.waitForTimeout(700);
  expect(await mutationsOver(host, 1000), "mutations while off-screen").toBe(0);

  await host.scrollIntoViewIfNeeded();
  expect(await mutationsOver(host, 1000), "mutations after scrolling back").toBeGreaterThan(0);
});

// A press that sends an event shows on the figure for a moment: a jolt for a
// bump the machine takes, a hop for any other event it takes, and a question
// mark for one no active state takes.

function energyDemo(page: Page) {
  const demo = page.locator('[data-hsm-demo="buddy-energy"] .hsm-demo');
  return {
    demo,
    visual: demo.locator(".hsm-visual"),
    press: (name: string) => demo.getByRole("button", { name, exact: true }).click(),
  };
}

test("the buddy answers each press", async ({ page }) => {
  await page.goto("/state-machines-tutorial");
  const { demo, visual, press } = energyDemo(page);
  const robot = visual.locator(".hsm-b-robot");
  await demo.scrollIntoViewIfNeeded();

  await press("BUMP (cost 1)");
  await expect(visual).toHaveClass(/hsm-react-ignored/);
  await expect(robot).toHaveCSS("animation-name", "hsm-shake");
  await expect(visual).not.toHaveClass(/hsm-react-/);

  await press("POKE");
  await expect(visual).toHaveClass(/hsm-react-hop/);
  await expect(robot).toHaveCSS("animation-name", "hsm-hop");

  await press("BUMP (cost 1)");
  await expect(visual).toHaveClass(/hsm-react-bump/);
  await expect(robot).toHaveCSS("animation-name", "hsm-bump");

  // The answer is the one from before the press: this bump is taken, and the
  // resting buddy it leaves behind would take none.
  await expect(visual).not.toHaveClass(/hsm-react-/);
  await press("BUMP (cost 3)");
  await expect(visual).toHaveClass(/hsm-react-bump/);
});

// Read in one go: a value polled for could be the one left after the reaction is over.
function reactionNow(visual: Locator) {
  return visual.evaluate((node) => {
    const style = (selector: string) => getComputedStyle(node.querySelector(selector) as Element);
    return {
      reaction: [...node.classList].filter((name) => name.startsWith("hsm-react-")),
      hit: style(".hsm-b-hit").opacity,
      huh: style(".hsm-b-huh").opacity,
      robot: style(".hsm-b-robot").animationName,
    };
  });
}

test("with reduced motion the marks show and the buddy stays still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/state-machines-tutorial");
  const { demo, visual, press } = energyDemo(page);
  await demo.scrollIntoViewIfNeeded();

  await press("BUMP (cost 1)");
  expect(await reactionNow(visual)).toEqual({
    reaction: ["hsm-react-ignored"],
    hit: "0",
    huh: "1",
    robot: "none",
  });

  await press("POKE");
  await press("BUMP (cost 1)");
  expect(await reactionNow(visual)).toEqual({
    reaction: ["hsm-react-bump"],
    hit: "1",
    huh: "0",
    robot: "none",
  });
});

// An always rule has no event to name, so its chip reads "at once", and a state
// with restoreDepth says that it remembers.

test("the checkup's rules read at once, and only the remembering awake says so", async ({
  page,
}) => {
  await page.goto("/state-machines-tutorial");
  const checkup = page.locator('[data-hsm-demo="buddy-checkup"] .hsm-demo');
  await checkup.scrollIntoViewIfNeeded();
  await expect(
    stateBox(page, checkup, "checkup").locator("li.hsm-rule", { hasText: "at once" }),
  ).toHaveCount(2);
  await expect(stateBox(page, checkup, "awake")).not.toContainText("remembers its last child");

  const memory = page.locator('[data-hsm-demo="buddy-memory"] .hsm-demo');
  await memory.scrollIntoViewIfNeeded();
  await expect(stateBox(page, memory, "awake")).toContainText("remembers its last child");
});

// An every entry is a rule line with a bar. A delay that is a function shows its
// words until its state is entered and the seconds it read from then on, and a due
// timer that its when holds back is marked as waiting.

test("the drain is a line with a bar, and the nap shows the delay it read and waits", async ({
  page,
}) => {
  await page.goto("/state-machines-tutorial");
  const drain = page.locator('[data-hsm-demo="buddy-drain"] .hsm-demo');
  await drain.scrollIntoViewIfNeeded();
  const every = stateBox(page, drain, "awake").locator("li.hsm-rule", { hasText: "every 1 s" });
  await expect(every).toHaveCount(1);
  await expect(every.locator(".hsm-bar")).toHaveCount(1);

  const nap = page.locator('[data-hsm-demo="buddy-nap"] .hsm-demo');
  await nap.scrollIntoViewIfNeeded();
  const resting = stateBox(page, nap, "resting");
  await expect(resting.locator("li.hsm-rule", { hasText: "after napSeconds" })).toHaveCount(1);
  await expect(resting.locator("li.hsm-rule", { hasText: "every frame" })).toHaveCount(0);

  await expect(stateBox(page, nap, "awake")).toHaveClass(/hsm-on/, { timeout: 4000 });
  await nap.getByRole("button", { name: "BUMP (cost 3)", exact: true }).click();
  // The battery is full a second after the two seconds are over, so the line waits for one second.
  const timer = resting.locator("li.hsm-rule", { hasText: "after 2 s" });
  await expect(timer).toHaveCount(1);
  await expect(timer).toHaveClass(/hsm-wait/, { timeout: 4000 });
});

// A routine's steps are a numbered list in its state's box. The step it is in is
// marked, and pausing the diagram's clock holds the routine where it is.

test("the greeting marks the step it is in and clears the mark when it ends", async ({ page }) => {
  await page.goto("/state-machines-tutorial");
  const demo = page.locator('[data-hsm-demo="buddy-greeting"] .hsm-demo');
  await demo.scrollIntoViewIfNeeded();
  const steps = leafBox(page, demo, "greeting").locator("ol.hsm-steps li");
  const marked = demo.locator("ol.hsm-steps li.hsm-step-on");
  await expect(steps).toHaveCount(5);
  await expect(marked).toHaveCount(0);

  await expect(stateBox(page, demo, "awake")).toHaveClass(/hsm-on/, { timeout: 4000 });
  await demo.getByRole("button", { name: "trigger_response (enter true)", exact: true }).click();
  await expect(steps.first()).toHaveClass(/hsm-step-on/);

  // The chirp is the first step, and the blinks after it run for 1.6 s at half speed.
  const chirp = demo
    .locator(".hsm-readout div", { has: page.locator(".hsm-k", { hasText: /^chirp$/ }) })
    .locator(".hsm-v");
  await expect(chirp).toHaveText("silent", { timeout: 4000 });
  await demo.getByRole("button", { name: "Pause time" }).click();
  await expect(marked).toHaveCount(1);
  await expect(steps.first()).not.toHaveClass(/hsm-step-on/);

  await demo.getByRole("button", { name: "Resume time" }).click();
  await expect(leafBox(page, demo, "follow")).toHaveClass(/hsm-on/, { timeout: 4000 });
  await expect(marked).toHaveCount(0);
});
