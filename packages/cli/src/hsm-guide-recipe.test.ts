/**
 * The State machines guide's animation recipe is a whole machine, so this runs the
 * `knight-machine.ts` fence of the excerpt source, over the hsm source, and plays the
 * part of the engine: it records each flipbook and fires the completion callbacks.
 * The save and load recipes, the door requests recipe, the waiting recipes and the several
 * machines recipes are whole machines too, and run the same way.
 * The page shows each machine as `ts excerpt` fences, which the fence gate holds to the
 * excerpt source, and every machine run here has to be quoted by one of them.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { requireHsmSourceDir } from "@defold-typescript/transpiler";
import { loadMachines, type MachineEngine, type MachineLoad } from "./hsm-view-load";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
const GUIDE_PAGE = path.join(REPO_ROOT, "packages", "docs", "guide", "state-machines.md");
const EXCERPT_SOURCE = path.join(REPO_ROOT, "packages/cli/test/fixtures/hsm-guide-excerpts.md");
const RECIPE_FENCE = "knight-machine.ts";
const RECIPE_MACHINE = "knightMachine";

/** The fences of the excerpt source this gate runs; a scenario can name no other. */
const RECIPE_TITLES = [
  "knight-machine.ts",
  "chest-routed.ts",
  "chest-machine.ts",
  "door-requests.ts",
  "wait-chain.ts",
  "wait-chain-parent.ts",
  "wait-fixed.ts",
  "wait-counted.ts",
  "wait-regions.ts",
  "wait-sequence.ts",
  "boss-machine.ts",
  "minion-machine.ts",
  "round-machines.ts",
  "combo-machines.ts",
] as const;

type RecipeTitle = (typeof RECIPE_TITLES)[number];

const TITLED_TS_FENCE = /^```ts[^\n]*\btitle="([^"]+)"[^\n]*\n([\s\S]*?)^```/gm;
const TS_EXCERPT_FENCE = /^```ts[ \t]+excerpt(?=\s)[^\n]*\n([\s\S]*?)^```/gm;

function titledFence(source: string, title: string): string {
  for (const match of source.matchAll(TITLED_TS_FENCE)) {
    if (match[1] === title) {
      return match[2] as string;
    }
  }
  throw new Error(`hsm-guide-excerpts.md has no ts fence titled ${title}`);
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * The recipes no `ts excerpt` fence of `page` quotes. An excerpt quotes a recipe when that
 * recipe's fence in `source` holds it, whitespace aside, and no other recipe's does: lines
 * two recipes share show the reader neither one.
 */
function unquotedRecipes(page: string, source: string): RecipeTitle[] {
  const bodies = RECIPE_TITLES.map((title) => collapseWhitespace(titledFence(source, title)));
  const quoted = new Set<RecipeTitle>();
  for (const match of page.matchAll(TS_EXCERPT_FENCE)) {
    const excerpt = collapseWhitespace(match[1] as string);
    if (excerpt.length === 0) {
      continue;
    }
    const holders = RECIPE_TITLES.filter((_, index) => bodies[index]?.includes(excerpt));
    if (holders.length === 1) {
      quoted.add(holders[0] as RecipeTitle);
    }
  }
  return RECIPE_TITLES.filter((title) => !quoted.has(title));
}

interface LoadedFence {
  readonly machine: unknown;
  readonly engine: MachineEngine;
}

const dirs: string[] = [];
const loadedFences = new Map<string, MachineLoad>();

/**
 * The machine named `name` of the fence titled `title`, with its engine; a fence loads once, so
 * the machines of one fence share one hsm runtime and one engine.
 */
function fenceMachine(title: RecipeTitle, name: string): LoadedFence {
  let loaded = loadedFences.get(title);
  if (loaded === undefined) {
    const body = titledFence(readFileSync(EXCERPT_SOURCE, "utf8"), title);
    const dir = mkdtempSync(path.join(os.tmpdir(), "hsm-guide-recipe-"));
    dirs.push(dir);
    const file = path.join(dir, title);
    writeFileSync(file, body);
    loaded = loadMachines(file, { hsmSourceDir: requireHsmSourceDir() });
    loadedFences.set(title, loaded);
  }
  const machine = loaded.machines.find((entry) => entry.name === name);
  if (machine === undefined) {
    throw new Error(`${title} defines no machine named ${name}`);
  }
  return { machine: machine.machine, engine: loaded.engine };
}

interface KnightCtx {
  run: boolean;
  crouch: boolean;
  jump: boolean;
}

interface Knight {
  readonly path: string | undefined;
  readonly ctx: KnightCtx;
  readonly send: (event: { type: string }) => void;
}

interface Startable {
  readonly start: (ctx: KnightCtx) => Knight;
}

const JUMP = { type: "JUMP" };

let recipe: Startable | undefined;
let played: unknown[] = [];
let pending: (() => void) | undefined;
let knight: Knight;

function knightMachine(): Startable {
  if (recipe !== undefined) {
    return recipe;
  }
  const fence = fenceMachine(RECIPE_FENCE, RECIPE_MACHINE);
  fence.engine.setSink((entry) => {
    if (entry.kind !== "engine" || entry.api !== "sprite.play_flipbook") {
      return;
    }
    played.push(entry.args[1]);
    const callback = entry.args[2];
    if (typeof callback === "function") {
      pending = callback as () => void;
    }
  });
  recipe = fence.machine as Startable;
  return recipe;
}

function start(): void {
  knight = knightMachine().start({ run: false, crouch: false, jump: false });
}

function intent(fields: Partial<KnightCtx>): void {
  Object.assign(knight.ctx, fields);
  knight.send({ type: "INTENT" });
}

function finish(): void {
  const done = pending;
  if (done === undefined) {
    throw new Error("no flipbook is waiting on its completion callback");
  }
  pending = undefined;
  done();
}

beforeEach(() => {
  played = [];
  pending = undefined;
});

afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("the knight recipe", () => {
  test("starts standing idle and plays idle once", () => {
    start();
    expect(knight.path).toBe("/standing/free/idle");
    expect(played).toEqual(["idle"]);
  });

  test("crouching plays the in-between animation before the crouched one", () => {
    start();
    intent({ crouch: true, run: true });
    expect(knight.path).toBe("/to_crouch");
    finish();
    expect(knight.path).toBe("/crouching/run");
    expect(played).toEqual(["idle", "to_crouch", "crouch_walk"]);
  });

  test("standing up plays the in-between animation before idle", () => {
    start();
    intent({ crouch: true, run: true });
    finish();
    intent({ crouch: false, run: false });
    expect(knight.path).toBe("/to_standing");
    finish();
    expect(knight.path).toBe("/standing/free/idle");
    expect(played.slice(-2)).toEqual(["from_crouch", "idle"]);
  });

  test("an unchanged request replays nothing", () => {
    start();
    intent({});
    intent({ run: false });
    expect(played).toEqual(["idle"]);
  });

  test("a jump finishes before the run requested during it starts", () => {
    start();
    knight.send(JUMP);
    expect(knight.path).toBe("/standing/jump");
    intent({ run: true });
    expect(knight.path).toBe("/standing/jump");
    finish();
    expect(knight.path).toBe("/standing/free/run");
    expect(played).toEqual(["idle", "jump", "run"]);
  });

  test("a jump pressed during a jump plays after it", () => {
    start();
    knight.send(JUMP);
    knight.send(JUMP);
    finish();
    expect(knight.path).toBe("/standing/jump");
    expect(played).toEqual(["idle", "jump", "jump"]);
    finish();
    expect(knight.path).toBe("/standing/free/idle");
  });

  test("a crouched knight ignores a jump", () => {
    start();
    intent({ crouch: true });
    finish();
    knight.send(JUMP);
    expect(knight.path).toBe("/crouching/idle");
    expect(played).toEqual(["idle", "to_crouch", "crouch_idle"]);
  });

  test("a jump pressed while standing up plays once the knight is up", () => {
    start();
    intent({ crouch: true });
    finish();
    intent({ crouch: false });
    expect(knight.path).toBe("/to_standing");
    knight.send(JUMP);
    finish();
    expect(knight.path).toBe("/standing/jump");
  });

  test("the callback of an earlier jump does not end the next one", () => {
    start();
    knight.send(JUMP);
    const earlier = pending;
    finish();
    expect(knight.path).toBe("/standing/free/idle");
    knight.send(JUMP);
    earlier?.();
    expect(knight.path).toBe("/standing/jump");
  });

  test("a waiting jump plays before a requested run", () => {
    start();
    knight.send(JUMP);
    knight.send(JUMP);
    intent({ run: true });
    finish();
    expect(knight.path).toBe("/standing/jump");
    finish();
    expect(knight.path).toBe("/standing/free/run");
    expect(played).toEqual(["idle", "jump", "jump", "run"]);
  });

  test("crouching wins over a waiting jump and drops it", () => {
    start();
    knight.send(JUMP);
    knight.send(JUMP);
    intent({ crouch: true });
    finish();
    expect(knight.path).toBe("/to_crouch");
    finish();
    intent({ crouch: false });
    finish();
    expect(knight.path).toBe("/standing/free/idle");
    expect(played).toEqual(["idle", "jump", "to_crouch", "crouch_idle", "from_crouch", "idle"]);
  });

  test("a request to stand made on the way down is taken once the knight is down", () => {
    start();
    intent({ crouch: true });
    expect(knight.path).toBe("/to_crouch");
    intent({ crouch: false, run: true });
    expect(knight.path).toBe("/to_crouch");
    finish();
    expect(knight.path).toBe("/to_standing");
    finish();
    expect(knight.path).toBe("/standing/free/run");
    expect(played).toEqual(["idle", "to_crouch", "from_crouch", "run"]);
  });
});

interface Chest {
  readonly path: string | undefined;
  readonly leaves: readonly string[];
  readonly send: (event: { type: string }) => void;
  readonly stop: () => void;
}

interface ChestMachine<Ctx> {
  readonly start: (ctx: Ctx, at?: readonly string[]) => Chest;
}

const SPRITE = "#sprite";

describe("the save and load recipes", () => {
  const routed = () =>
    fenceMachine("chest-routed.ts", "routedChestMachine").machine as ChestMachine<{
      opened: boolean;
    }>;
  const positioned = () => fenceMachine("chest-machine.ts", "chestMachine");
  const chestMachine = () => positioned().machine as ChestMachine<{ sprite: string }>;

  test("the routed chest starts in the state its saved flag tells", () => {
    expect(routed().start({ opened: true }).path).toBe("/open");
    expect(routed().start({ opened: false }).path).toBe("/closed");
  });

  test("the chest started with no list is at its initial", () => {
    expect(chestMachine().start({ sprite: SPRITE }).path).toBe("/locked");
  });

  test("a chest started with a copy of saved leaves is in the states it was saved in", () => {
    const first = chestMachine().start({ sprite: SPRITE });
    first.send({ type: "UNLOCK" });
    first.send({ type: "OPEN" });
    const saved = [...first.leaves];
    first.stop();
    expect(saved).toEqual(["/open"]);
    expect([...chestMachine().start({ sprite: SPRITE }, saved).leaves]).toEqual(saved);
  });

  test("a chest started at the open state plays the animation of its enter hook", () => {
    const machine = chestMachine();
    const sprites: unknown[] = [];
    positioned().engine.setSink((entry) => {
      if (entry.kind === "engine" && entry.api === "sprite.play_flipbook") {
        sprites.push(entry.args[0]);
      }
    });
    try {
      machine.start({ sprite: SPRITE }, ["/open"]);
    } finally {
      positioned().engine.setSink(undefined);
    }
    expect(sprites).toEqual([SPRITE]);
  });
});

interface DoorRequest {
  readonly type: string;
  readonly sender: string;
}

interface Door {
  readonly path: string | undefined;
  readonly can: (event: DoorRequest) => boolean;
  readonly send: (event: DoorRequest) => void;
}

interface DoorMachine {
  readonly start: (ctx: { sprite: string }) => Door;
}

const CALLER = "main:/player#script";
const OTHER = "main:/guard#script";

describe("the door requests recipe", () => {
  const fence = () => fenceMachine("door-requests.ts", "doorMachine");
  let calls: unknown[] = [];
  let door: Door;

  beforeEach(() => {
    calls = [];
    fence().engine.setSink((entry) => {
      if (entry.kind === "engine") {
        calls.push([entry.api, entry.args]);
      }
    });
    door = (fence().machine as DoorMachine).start({ sprite: SPRITE });
  });

  afterEach(() => {
    fence().engine.setSink(undefined);
  });

  test("a request no state took is refused by name and stays unhandled", () => {
    const request = { type: "close_door", sender: CALLER };
    expect(door.can(request)).toBe(false);
    door.send(request);
    expect(door.path).toBe("/closed");
    expect(calls).toEqual([["msg.post", [CALLER, "door_refused", { request: "close_door" }]]]);
  });

  test("a locked door rattles before the refusal and still takes nothing", () => {
    door.send({ type: "lock_door", sender: CALLER });
    expect(door.path).toBe("/locked");
    expect(calls).toEqual([]);
    const request = { type: "open_door", sender: OTHER };
    expect(door.can(request)).toBe(false);
    door.send(request);
    expect(door.path).toBe("/locked");
    expect(door.can(request)).toBe(false);
    expect(calls).toEqual([
      ["sprite.play_flipbook", [SPRITE, "rattle"]],
      ["msg.post", [OTHER, "door_refused", { request: "open_door" }]],
    ]);
  });

  test("the requests the door takes run no hook", () => {
    door.send({ type: "lock_door", sender: CALLER });
    door.send({ type: "unlock_door", sender: CALLER });
    door.send({ type: "open_door", sender: CALLER });
    expect(door.path).toBe("/open");
    expect(calls).toEqual([]);
  });
});

interface Running<Ctx> {
  readonly path: string | undefined;
  readonly leaves: readonly string[];
  readonly ctx: Ctx;
  readonly send: (event: { readonly type: string; readonly sender?: string }) => void;
  readonly update: (dt: number) => void;
}

interface RecipeMachine<Ctx> {
  readonly start: (ctx: Ctx) => Running<Ctx>;
}

let calls: [string, readonly unknown[]][] = [];
let watched: MachineEngine | undefined;

/** The machine of a fence, with every engine call it makes from here on kept in `calls`. */
function recipeMachine<Ctx>(title: RecipeTitle, name: string): RecipeMachine<Ctx> {
  const fence = fenceMachine(title, name);
  watched = fence.engine;
  fence.engine.setSink((entry) => {
    if (entry.kind === "engine") {
      calls.push([entry.api, entry.args]);
    }
  });
  return fence.machine as RecipeMachine<Ctx>;
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  watched?.setSink(undefined);
  watched = undefined;
});

const CONFIG_URL = "https://example.com/config.json";

describe("the waiting recipes", () => {
  function callbackOf(api: string, slot: number, nth: number): (...args: unknown[]) => void {
    const call = calls.filter(([name]) => name === api)[nth];
    const callback = call?.[1][slot];
    if (typeof callback !== "function") {
      throw new Error(`call ${nth} of ${api} has no callback in argument ${slot}`);
    }
    return callback as (...args: unknown[]) => void;
  }

  function animationEnds(nth = 0): void {
    callbackOf("go.animate", 7, nth)();
  }

  function responseArrives(status: number): void {
    callbackOf("http.request", 2, 0)(undefined, undefined, { status });
  }

  const promisesSettle = () => new Promise((resolve) => setTimeout(resolve, 0));

  const posted = () => calls.filter(([api]) => api === "msg.post").map(([, args]) => args[1]);

  test("the last child of a chain names the next state", () => {
    const intro = recipeMachine<object>("wait-chain.ts", "introMachine").start({});
    intro.update(2);
    intro.update(2);
    expect(intro.path).toBe("/intro/credits");
    intro.update(2);
    expect(intro.path).toBe("/menu");
  });

  test("the parent of a chain decides where to go once the chain has ended", () => {
    const machine = recipeMachine<{ firstRun: boolean }>(
      "wait-chain-parent.ts",
      "gatedIntroMachine",
    );
    const pathAfterIntro = (firstRun: boolean) => {
      const intro = machine.start({ firstRun });
      intro.update(2);
      intro.update(2);
      intro.update(2);
      return intro.path;
    };
    expect(pathAfterIntro(true)).toBe("/tutorial");
    expect(pathAfterIntro(false)).toBe("/menu");
  });

  const startLevel = () =>
    recipeMachine<{ url: string; curtain: string }>("wait-fixed.ts", "levelMachine").start({
      url: CONFIG_URL,
      curtain: SPRITE,
    });

  test("a group of two pieces waits for both", () => {
    const level = startLevel();
    animationEnds();
    expect(level.path).toBe("/loading");
    responseArrives(200);
    expect(level.path).toBe("/playing");
  });

  test("a piece that fails ends the wait itself", () => {
    const level = startLevel();
    responseArrives(500);
    expect(level.path).toBe("/failed");
    animationEnds();
    expect(level.path).toBe("/failed");
  });

  const waveMachine = () => recipeMachine<{ enemies: string[] }>("wait-counted.ts", "waveMachine");

  test("a group counted while the game runs waits for every piece", () => {
    const wave = waveMachine().start({ enemies: ["/grunt1", "/grunt2", "/grunt3"] });
    animationEnds(0);
    animationEnds(1);
    expect(wave.path).toBe("/entering");
    animationEnds(2);
    expect(wave.path).toBe("/fighting");
  });

  test("a group with nothing to count has moved on when start returns", () => {
    expect(waveMachine().start({ enemies: [] }).path).toBe("/fighting");
  });

  test("regions join once each has reached its last state, in either order", () => {
    const machine = recipeMachine<object>("wait-regions.ts", "raidMachine");
    const raid = machine.start({});
    raid.send({ type: "FADED" });
    expect([...raid.leaves]).toEqual(["/setup/doors/opening", "/setup/music/ready"]);
    raid.send({ type: "OPENED" });
    expect(raid.path).toBe("/fight");

    const reversed = machine.start({});
    reversed.send({ type: "OPENED" });
    reversed.send({ type: "FADED" });
    expect(reversed.path).toBe("/fight");
  });

  const startBoot = () =>
    recipeMachine<{ url: string; logo: string }>("wait-sequence.ts", "bootMachine").start({
      url: CONFIG_URL,
      logo: SPRITE,
    });

  test("a sequence goes on after its group has finished", async () => {
    const boot = startBoot();
    responseArrives(200);
    animationEnds();
    await promisesSettle();
    expect(boot.path).toBe("/playing");
    expect(posted()).toEqual(["disable"]);
  });

  test("a sequence whose state was left does no work once its group finishes", async () => {
    const boot = startBoot();
    boot.send({ type: "SKIP" });
    expect(boot.path).toBe("/menu");
    responseArrives(200);
    animationEnds();
    await promisesSettle();
    expect(boot.path).toBe("/menu");
    expect(posted()).toEqual([]);
  });
});

const BOSS = "main:/boss#script";
const M1 = "main:/minion1";
const M2 = "main:/minion2";

interface BrawlerCtx {
  combo?: Running<unknown>;
  best: number;
}

describe("the several machines recipes", () => {
  /** Every engine call so far, as its api, receiver and message id. */
  const engineCalls = () => calls.map(([api, args]) => [api, args[0], args[1]]);

  const startBoss = () =>
    recipeMachine<{ minions: string[]; alive: number }>("boss-machine.ts", "bossMachine").start({
      minions: [M1, M2],
      alive: 0,
    });

  test("the boss wakes each minion it was started with", () => {
    const boss = startBoss();
    expect(boss.path).toBe("/shielded");
    expect(engineCalls()).toEqual([
      ["msg.post", M1, "minion_wake"],
      ["msg.post", M2, "minion_wake"],
    ]);
  });

  test("the boss stays shielded until its last minion is down", () => {
    const boss = startBoss();
    boss.send({ type: "minion_ready", sender: M1 });
    boss.send({ type: "minion_ready", sender: M2 });
    boss.send({ type: "minion_down", sender: M1 });
    expect(boss.path).toBe("/shielded");
    boss.send({ type: "minion_down", sender: M2 });
    expect(boss.path).toBe("/exposed");
  });

  const wakeMinion = () => {
    const minion = recipeMachine<{ hp: number; owner?: string }>(
      "minion-machine.ts",
      "minionMachine",
    ).start({ hp: 2 });
    minion.send({ type: "minion_wake", sender: BOSS });
    return minion;
  };

  test("a woken minion reports to the object that woke it", () => {
    const minion = wakeMinion();
    expect(minion.path).toBe("/awake");
    expect(engineCalls()).toEqual([["msg.post", BOSS, "minion_ready"]]);
  });

  test("a minion out of hp tells the object that woke it", () => {
    const minion = wakeMinion();
    minion.send({ type: "HIT" });
    expect(minion.path).toBe("/awake");
    minion.send({ type: "HIT" });
    expect(minion.path).toBe("/down");
    expect(engineCalls().at(-1)).toEqual(["msg.post", BOSS, "minion_down"]);
  });

  test("the hero jumps only while the round it reads is playing", () => {
    const round = recipeMachine<object>("round-machines.ts", "roundMachine").start({});
    const hero = recipeMachine<{ round: Running<object> }>(
      "round-machines.ts",
      "heroMachine",
    ).start({ round });
    hero.send(JUMP);
    expect(hero.path).toBe("/grounded");
    round.update(3);
    hero.send(JUMP);
    expect(hero.path).toBe("/airborne");
    hero.send({ type: "LAND" });
    round.send({ type: "FINISH" });
    hero.send(JUMP);
    expect(hero.path).toBe("/grounded");
  });

  const ENGAGE = { type: "ENGAGE" };
  const PUNCH = { type: "PUNCH" };

  const startBrawler = () =>
    recipeMachine<BrawlerCtx>("combo-machines.ts", "brawlerMachine").start({ best: 0 });

  function comboOf(brawler: Running<BrawlerCtx>): Running<unknown> {
    const combo = brawler.ctx.combo;
    if (combo === undefined) {
      throw new Error("the brawler holds no combo");
    }
    return combo;
  }

  test("the combo exists once the brawler is fighting, and not before", () => {
    const brawler = startBrawler();
    expect(brawler.ctx.combo).toBeUndefined();
    brawler.send(ENGAGE);
    expect(brawler.path).toBe("/fighting");
    expect(comboOf(brawler).path).toBe("/open");
  });

  test("a combo that runs out reports its hits, ends the fight and is stopped", () => {
    const brawler = startBrawler();
    brawler.send(ENGAGE);
    brawler.send(PUNCH);
    brawler.send(PUNCH);
    const combo = comboOf(brawler);
    brawler.update(1);
    expect(brawler.path).toBe("/roaming");
    expect(brawler.ctx.best).toBe(2);
    expect(combo.path).toBeUndefined();
    expect(brawler.ctx.combo).toBeUndefined();
  });

  test("a punch gives the combo its whole second again", () => {
    const brawler = startBrawler();
    brawler.send(ENGAGE);
    brawler.update(0.6);
    brawler.send(PUNCH);
    brawler.update(0.6);
    expect(brawler.path).toBe("/fighting");
    brawler.update(0.6);
    expect(brawler.path).toBe("/roaming");
  });

  test("leaving the fight stops the combo, which then reports nothing", () => {
    const brawler = startBrawler();
    brawler.send(ENGAGE);
    const combo = comboOf(brawler);
    brawler.send({ type: "FLEE" });
    expect(brawler.path).toBe("/roaming");
    expect(combo.path).toBeUndefined();
    brawler.update(2);
    expect(brawler.path).toBe("/roaming");
    expect(brawler.ctx.best).toBe(0);
  });
});

describe("the recipes on the page", () => {
  const source = readFileSync(EXCERPT_SOURCE, "utf8");

  /** A page whose excerpts are the whole fences of `titles`. */
  const pageQuoting = (titles: readonly RecipeTitle[]) =>
    titles.map((title) => `\`\`\`ts excerpt\n${titledFence(source, title)}\`\`\`\n`).join("\n");

  test("every machine the gate runs is quoted by the page", () => {
    expect(unquotedRecipes(readFileSync(GUIDE_PAGE, "utf8"), source)).toEqual([]);
  });

  test("the quote check can fail", () => {
    const missing: RecipeTitle = "wait-chain.ts";
    const rest = RECIPE_TITLES.filter((title) => title !== missing);
    expect(unquotedRecipes(pageQuoting(RECIPE_TITLES), source)).toEqual([]);
    expect(unquotedRecipes(pageQuoting(rest), source)).toEqual([missing]);
  });

  test("lines several recipes share quote none of them", () => {
    const shared =
      '```ts excerpt\nimport { defineMachine } from "@defold-typescript/types/hsm";\n```\n';
    expect(unquotedRecipes(shared, source)).toEqual([...RECIPE_TITLES]);
  });
});
