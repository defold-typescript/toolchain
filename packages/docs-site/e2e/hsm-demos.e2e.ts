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

// The timed demos share one animation-frame heartbeat. Rewriting DOM nodes on
// every frame makes WebKit pull the page back while the reader scrolls, so a
// demo whose shown values have not changed must leave its DOM untouched.

function stateBox(page: Page, demo: Locator, name: string): Locator {
  return demo.locator(".hsm-state", {
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
  for (const id of ["buddy-time", "buddy-waking"]) {
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
