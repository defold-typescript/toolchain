import { expect, type Locator, type Page, test } from "@playwright/test";

// The state machines tutorial replaces each `[data-hsm-demo]` placeholder with a
// live diagram running the real hsm library. Pressing the first diagram's POKE lights
// its `awake` box and narrates the step in the log, naming each state by its full path.

test("the first diagram's buddy wakes up and logs the transition", async ({ page }) => {
  await page.goto("/state-machines-tutorial");
  const demo = page.locator('[data-hsm-demo="buddy-nested"] .hsm-demo');
  await expect(demo).toBeVisible();

  const awakeBox = demo.locator(".hsm-state", {
    has: page.locator(".hsm-state-name", { hasText: /^awake$/ }),
  });
  const log = demo.locator(".hsm-log li");
  await expect(awakeBox).not.toHaveClass(/hsm-on/);
  const before = await log.count();

  await send(demo, "POKE");
  await expect(awakeBox).toHaveClass(/hsm-on/);
  await expect(log).toHaveCount(before + 4);
  await expect(log.last()).toHaveText("enter /awake/wander (initial child)");
});

test("the first diagram's figure follows the machine", async ({ page }) => {
  await page.goto("/state-machines-tutorial");
  const demo = page.locator('[data-hsm-demo="buddy-nested"] .hsm-demo');
  await expect(demo).toBeVisible();

  const asleep = demo.getByRole("img", { name: "buddy asleep", exact: true });
  await expect(asleep).toBeVisible();
  await expect(asleep.locator(".hsm-b-eyes-shut")).toHaveCSS("opacity", "1");
  await expect(asleep.locator(".hsm-b-eyes-open")).toHaveCSS("opacity", "0");

  await send(demo, "POKE");
  const awake = demo.getByRole("img", { name: "buddy awake", exact: true });
  await expect(awake).toBeVisible();
  await expect(awake.locator(".hsm-b-eyes-open")).toHaveCSS("opacity", "1");
  await expect(awake.locator(".hsm-b-eyes-shut")).toHaveCSS("opacity", "0");
});

// Each demo runs on an animation-frame loop of its own. Rewriting DOM nodes
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

// A region, by its own name: its name element also holds the word "region".
function regionBox(page: Page, demo: Locator, name: string): Locator {
  return demo.locator(".hsm-region", {
    has: page.locator(".hsm-state-name", { hasText: new RegExp(`^${name} region$`) }),
  });
}

// An event is sent from its name in a rule line, and any box that names it will do. A label
// with a payload, like "BUMP (cost 1)", is picked from the menu its name opens.
async function send(demo: Locator, label: string) {
  const name = label.replace(/ \(.*$/, "");
  await demo.getByRole("button", { name, exact: true }).first().click();
  if (name !== label) await demo.getByRole("menuitem", { name: label, exact: true }).click();
}

// `apartFrom` is a selector for what may change without being counted.
function mutationsOver(host: Locator, ms: number, apartFrom?: string): Promise<number> {
  return host.evaluate(
    (node, [duration, skipped]) =>
      new Promise<number>((resolve) => {
        let count = 0;
        const counted = (records: MutationRecord[]) =>
          records.filter((record) => {
            if (skipped === undefined) return true;
            const target = record.target;
            const element = target instanceof Element ? target : target.parentElement;
            return element?.closest(skipped) == null;
          }).length;
        const observer = new MutationObserver((records) => {
          count += counted(records);
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
          const pending = counted(observer.takeRecords());
          observer.disconnect();
          resolve(count + pending);
        };
        requestAnimationFrame(tick);
      }),
    [ms, apartFrom] as const,
  );
}

test("an idle demo writes nothing between frames", async ({ page }) => {
  await page.goto("/state-machines-tutorial");
  for (const id of ["buddy-nested", "buddy-time", "buddy-waking"]) {
    const host = page.locator(`[data-hsm-demo="${id}"]`);
    await host.scrollIntoViewIfNeeded();
    await expect(host.locator(".hsm-demo")).toBeVisible();
    // The machine's time is the one thing that goes on while nothing happens.
    expect(await mutationsOver(host, 1000, ".hsm-timer"), `${id} mutations while idle`).toBe(0);
  }

  // The 1 s fade runs at half speed, so the heartbeat takes two seconds to wake the buddy.
  const waking = page.locator('[data-hsm-demo="buddy-waking"] .hsm-demo');
  await waking.scrollIntoViewIfNeeded();
  await send(waking, "POKE");
  await expect(stateBox(page, waking, "awake")).toHaveClass(/hsm-on/, { timeout: 4000 });
});

test("the queue demo's buddy wakes itself, and its clock can be held", async ({ page }) => {
  await page.goto("/state-machines-tutorial");
  const demo = page.locator('[data-hsm-demo="buddy-queue"] .hsm-demo');
  await demo.scrollIntoViewIfNeeded();
  await expect(stateBox(page, demo, "awake")).toHaveClass(/hsm-on/, { timeout: 4000 });

  await demo.getByRole("button", { name: "Pause time" }).click();
  await expect(demo.getByRole("button", { name: "Resume time" })).toBeVisible();
  // A rule chip's highlight clears on a 650 ms timer that runs even while paused.
  await page.waitForTimeout(700);
  expect(await mutationsOver(demo, 1000), "mutations while paused").toBe(0);
});

// A filled name is an event an active state takes now. It is filled in an active
// state's box only, and the rules of a state that is not active are dimmed.

test("a filled name is one the machine takes", async ({ page }) => {
  await page.goto("/state-machines-tutorial");
  const demo = page.locator('[data-hsm-demo="buddy-nested"] .hsm-demo');
  await demo.scrollIntoViewIfNeeded();
  const name = (rule: string) => demo.locator("li.hsm-rule", { hasText: rule }).getByRole("button");
  // `asleep` is active at the start, and `awake` names the same event.
  const wake = name("POKE /awake");
  const sleep = name("POKE /asleep");
  const see = name("SEE_PLAYER");
  const lose = name("LOSE_PLAYER");
  const transparent = "rgba(0, 0, 0, 0)";

  await expect(wake).toHaveClass(/hsm-can/);
  await expect(wake).not.toHaveCSS("background-color", transparent);
  await expect(sleep).toHaveClass(/hsm-can/);
  await expect(sleep).toHaveCSS("background-color", transparent);
  await expect(see).not.toHaveClass(/hsm-can/);
  await expect(see).toHaveCSS("background-color", transparent);

  await wake.click();
  await expect(see).toHaveClass(/hsm-can/);
  await expect(see).not.toHaveCSS("background-color", transparent);
  await expect(lose).not.toHaveClass(/hsm-can/);
  // Found by their text: `stateBox` matches a parent box too.
  await expect(demo.locator("li.hsm-rule", { hasText: "SEE_PLAYER" })).toHaveCSS("opacity", "1");
  await expect(demo.locator("li.hsm-rule", { hasText: "LOSE_PLAYER" })).toHaveCSS(
    "opacity",
    "0.55",
  );
});

// Pointing at an event's name marks that name in every box, a parent's included,
// and shows its rule lines in full even in a box that is not active.

test("pointing at a name marks the same event in other boxes", async ({ page }) => {
  await page.goto("/state-machines-tutorial");
  const demo = page.locator('[data-hsm-demo="buddy-nested"] .hsm-demo');
  await demo.scrollIntoViewIfNeeded();
  const line = (rule: string) => demo.locator("li.hsm-rule", { hasText: rule });
  const parent = line("POKE /asleep");
  await expect(parent).toHaveCSS("opacity", "0.55");

  await line("POKE /awake").getByRole("button").hover();
  await expect(demo.locator(".hsm-same")).toHaveCount(2);
  await expect(parent.getByRole("button")).toHaveClass(/hsm-same/);
  await expect(parent).toHaveCSS("opacity", "1");
  await expect(line("SEE_PLAYER")).toHaveCSS("opacity", "0.55");

  await demo.locator(".hsm-readout").hover();
  await expect(demo.locator(".hsm-same")).toHaveCount(0);
  await expect(parent).toHaveCSS("opacity", "0.55");
});

// An event with a payload is picked from the menu its name opens. The menu closes
// on a pick, on Escape, on a press outside it and on a second press of its name,
// and only a pick sends an event.

test("a name with payloads opens a menu, and a pick sends one", async ({ page }) => {
  await page.goto("/state-machines-tutorial");
  const demo = page.locator('[data-hsm-demo="buddy-energy"] .hsm-demo');
  await demo.scrollIntoViewIfNeeded();
  await send(demo, "POKE");
  const name = demo.getByRole("button", { name: "BUMP", exact: true }).first();
  const menu = demo.locator(".hsm-diagram .hsm-menu");
  const log = demo.locator(".hsm-log li");
  await expect(stateBox(page, demo, "awake")).toHaveClass(/hsm-on/);
  const before = await log.count();

  await name.click();
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveText(["BUMP (cost 1)", "BUMP (cost 3)"]);
  const at = await name.boundingBox();
  const under = await menu.boundingBox();
  if (at === null || under === null) throw new Error("the menu has no box");
  expect(under.y).toBeGreaterThanOrEqual(at.y + at.height);
  expect(Math.abs(under.x - at.x)).toBeLessThan(2);

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await name.click();
  await expect(menu).toBeVisible();
  await demo.locator(".hsm-readout").click();
  await expect(menu).toBeHidden();
  await name.click();
  await expect(menu).toBeVisible();
  await name.click();
  await expect(menu).toBeHidden();
  expect(await log.count()).toBe(before);

  await name.click();
  await menu.getByRole("menuitem", { name: "BUMP (cost 3)" }).click();
  await expect(menu).toBeHidden();
  await expect(stateBox(page, demo, "resting")).toHaveClass(/hsm-on/);
});

// The row at the top of a diagram follows the site's toolbar. The restart comes
// first as a glyph alone, named by the page's tooltip, and the speeds are a menu.

test("the restart is a glyph with a tooltip, and the speeds are a menu", async ({ page }) => {
  await page.goto("/state-machines-tutorial");
  const demo = page.locator('[data-hsm-demo="buddy-time"] .hsm-demo');
  await demo.scrollIntoViewIfNeeded();
  const row = demo.locator(".hsm-controls > button, .hsm-controls > div > button");
  const restart = demo.getByRole("button", { name: "Restart machine", exact: true });
  await expect(row.first()).toHaveAccessibleName("Restart machine");
  await expect(restart).toHaveText("");
  await expect(restart.locator("svg")).toBeVisible();

  await restart.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Restart machine");
  // A button lifts under the pointer and sinks while it is pressed. It moves by a whole pixel
  // of its position: a transform would make a button between two pixels jump sideways.
  await expect(restart).toHaveCSS("top", "-1px");
  await expect(restart).toHaveCSS("transform", "none");
  await page.mouse.down();
  await expect(restart).toHaveCSS("top", "1px");
  await page.mouse.up();
  await expect(restart).toHaveCSS("top", "-1px");

  // The header's theme toggle sets the shape and the height of a toolbar button.
  const theme = page.getByRole("button", { name: /^Switch to (dark|light) theme$/ });
  for (const property of ["height", "border-top-left-radius", "border-top-width"]) {
    const expected = await theme.evaluate(
      (node, name) => getComputedStyle(node)[name as never],
      property,
    );
    await expect(restart).toHaveCSS(property, expected as string);
  }

  // The clock's button is a glyph too, and its tooltip follows what the next press does.
  const pause = demo.getByRole("button", { name: "Pause time", exact: true });
  await expect(pause).toHaveText("");
  await pause.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Pause time");
  await pause.click();
  await expect(page.getByRole("tooltip")).toHaveText("Resume time");
  // A press hides the page's tooltip, and it is back when the pointer comes back.
  await demo.getByRole("button", { name: "Resume time", exact: true }).click();
  await restart.hover();
  await pause.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Pause time");

  // A lesson's own button keeps its words, and the tooltip says what a press means.
  const queue = page.locator('[data-hsm-demo="buddy-queue"] .hsm-demo');
  await queue.scrollIntoViewIfNeeded();
  await queue.getByRole("button", { name: "stop()", exact: true }).hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Stop the machine, as deleting its game object does",
  );
  await expect(queue.locator(".hsm-controls")).not.toContainText("Start it or stop it");
  // The rule after the speeds runs the whole height of the row, above its bottom border.
  const set = queue.locator(".hsm-transport");
  await expect(set).toHaveCSS("border-right-width", "1px");
  const band = await queue.locator(".hsm-controls").boundingBox();
  const part = await set.boundingBox();
  if (band === null || part === null) throw new Error("the row has no box");
  expect(Math.abs(band.height - 1 - part.height)).toBeLessThan(1);
  await demo.scrollIntoViewIfNeeded();

  const speed = demo.getByRole("button", { name: "Normal speed", exact: true });
  await speed.click();
  const menu = demo.getByRole("menu", { name: "Speed" });
  await expect(menu.getByRole("menuitemradio")).toHaveText([
    "Normal speed",
    "Half speed",
    "Quarter speed",
    "Very slow",
  ]);
  await expect(menu.getByRole("menuitemradio", { name: "Normal speed" })).toBeChecked();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(demo.getByRole("button", { name: "Half speed", exact: true })).toBeVisible();
});

// The machine's time runs with the clock, stands still while it is held and starts
// over with a new machine. It lies on the row's lower edge, under the restart and
// the clock's button.

test("the machine's time runs, holds and starts over", async ({ page }) => {
  await page.goto("/state-machines-tutorial");
  const demo = page.locator('[data-hsm-demo="buddy-nested"] .hsm-demo');
  await demo.scrollIntoViewIfNeeded();
  const timer = demo.getByRole("timer", { name: "Machine time" });
  await expect(timer).toHaveText(/^00:00:\d\d$/);
  await expect(timer).toHaveClass(/hsm-timer-on/);
  const seconds = async () => Number((await timer.innerText()).slice(6));
  await expect.poll(seconds).toBeGreaterThanOrEqual(1);

  // A held clock dims the time and keeps it where it is.
  await demo.getByRole("button", { name: "Pause time", exact: true }).click();
  await expect(timer).not.toHaveClass(/hsm-timer-on/);
  const held = await seconds();
  await page.waitForTimeout(1300);
  expect(await seconds()).toBe(held);

  await demo.getByRole("button", { name: "Resume time", exact: true }).click();
  await expect(timer).toHaveClass(/hsm-timer-on/);
  await expect.poll(seconds).toBeGreaterThan(held);
  const restart = demo.getByRole("button", { name: "Restart machine", exact: true });
  await restart.click();
  await expect(timer).toHaveText("00:00:00");

  const row = await demo.locator(".hsm-controls").boundingBox();
  const at = await timer.boundingBox();
  const first = await restart.boundingBox();
  const second = await demo.getByRole("button", { name: "Pause time", exact: true }).boundingBox();
  if (row === null || at === null || first === null || second === null) {
    throw new Error("a part of the row has no box");
  }
  const edge = row.y + row.height;
  expect(at.y).toBeLessThan(edge - 2);
  expect(at.y + at.height).toBeGreaterThan(edge + 2);
  // Its ground runs from the restart's left edge to the right edge of the clock's button.
  expect(Math.abs(at.x - first.x)).toBeLessThan(1);
  expect(Math.abs(at.x + at.width - (second.x + second.width))).toBeLessThan(1);
  await expect(timer).toHaveCSS("text-align", "center");
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
  await send(host, "POKE");

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
    press: (label: string) => send(demo, label),
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

// A tip goes when a scroll moves its trigger. A diagram's log follows its last line, which
// scrolls the log and moves nothing else, so a tip elsewhere on the diagram stays up.

test("a tooltip outlasts the log's scrolling, and goes when the page scrolls", async ({ page }) => {
  await page.goto("/state-machines-tutorial");
  const demo = page.locator('[data-hsm-demo="buddy-nested"] .hsm-demo');
  await demo.scrollIntoViewIfNeeded();
  const star = demo.getByRole("img", { name: "initial", exact: true }).first();
  const poke = demo.locator("li.hsm-rule", { hasText: "POKE /awake" }).getByRole("button");

  await star.hover();
  await expect(page.getByRole("tooltip")).toHaveText("initial");
  // Pressed without the pointer, which stays on the glyph.
  for (let press = 0; press < 6; press++) {
    await poke.evaluate((button: HTMLElement) => button.click());
  }
  const log = demo.locator(".hsm-log");
  await expect.poll(() => log.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await expect(page.getByRole("tooltip")).toHaveText("initial");
  await expect(star).toHaveAttribute("aria-describedby", "ui-tooltip");

  await page.mouse.wheel(0, 200);
  await expect(star).not.toHaveAttribute("aria-describedby");
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
  // The words are the name of a glyph by the state's name.
  const remembers = { name: "remembers its last child" };
  await expect(stateBox(page, checkup, "awake").getByRole("img", remembers)).toHaveCount(0);

  const memory = page.locator('[data-hsm-demo="buddy-memory"] .hsm-demo');
  await memory.scrollIntoViewIfNeeded();
  await expect(stateBox(page, memory, "awake").getByRole("img", remembers)).toHaveCount(1);
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
  await send(nap, "BUMP (cost 3)");
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
  await send(demo, "trigger_response (enter true)");
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

// A parallel state keeps every region active, and the diagram draws the regions
// next to each other. The lamp region blinks the light while the battery fills.

test("a resting buddy lights both regions side by side, and its light blinks", async ({ page }) => {
  await page.goto("/state-machines-tutorial");
  const demo = page.locator('[data-hsm-demo="buddy-regions"] .hsm-demo');
  await demo.scrollIntoViewIfNeeded();
  await expect(stateBox(page, demo, "awake")).toHaveClass(/hsm-on/, { timeout: 4000 });
  await send(demo, "BUMP (cost 3)");

  const battery = regionBox(page, demo, "battery");
  const lamp = regionBox(page, demo, "lamp");
  await expect(battery).toHaveClass(/hsm-on/);
  await expect(lamp).toHaveClass(/hsm-on/);
  // `filling` is where its region starts.
  await expect(leafBox(page, demo, "filling")).toHaveClass(/hsm-on/);

  const left = await battery.boundingBox();
  const right = await lamp.boundingBox();
  if (left === null || right === null) throw new Error("a region has no box");
  expect(right.y).toBeLessThan(left.y + left.height);
  expect(left.y).toBeLessThan(right.y + right.height);
  expect(right.x).toBeGreaterThanOrEqual(left.x + left.width);

  await expect(
    demo.getByRole("img", { name: "buddy resting, light off", exact: true }),
  ).toBeVisible({ timeout: 2000 });
  await expect(demo.getByRole("img", { name: "buddy resting, light on", exact: true })).toBeVisible(
    { timeout: 2000 },
  );
});
