/**
 * The slide manifest. Each entry becomes one slide in the generated HTML.
 * The body of a slide is a flat list of elements — paragraphs, bullet lists,
 * numbered lists, images, code snippets, and side-notes — that the build
 * script renders in order, top to bottom. This keeps the manifest readable
 * as a single narrative and gives build.ts a single, uniform loop to walk.
 */
export type SnippetRef = {
  /** Filename under docs/tutorial/snippets/ (with extension). */
  file: string;
  /** Optional caption shown below the snippet. Plain text, no markdown. */
  caption?: string;
};

export type SlideElement =
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "numbered"; items: string[] }
  | { kind: "image"; src: string; alt: string }
  | { kind: "snippet"; file: string; caption?: string }
  | { kind: "sidenote"; text: string };

export type Slide = {
  /** Section anchor matching the original Defold tutorial. */
  id: string;
  /** Slide title. */
  title: string;
  /** Optional tagline shown under the title (used only on the title slide). */
  tagline?: string;
  /** Rendered in order, top to bottom. */
  elements: SlideElement[];
};

export const slides: Slide[] = [
  {
    id: "platformer",
    title: "Platformer",
    tagline: "A 2D platformer in Defold, written in TypeScript",
    elements: [
      {
        kind: "paragraph",
        text: "In this article, we go through the implementation of a basic tile-based 2D platformer in Defold. The mechanics we will learn are moving left/right, jumping and falling.",
      },
      {
        kind: "paragraph",
        text: "There are many different ways to go about creating a platformer. Rodrigo Monteiro has written an exhaustive analysis on the subject and more [here](http://higherorderfun.com/blog/2012/05/20/the-guide-to-implementing-2d-platformers/). We highly recommend you read it if you are new to making platformers, as it contains plenty of valuable information. We will go into a bit more detail on a few of the methods described and how to implement them in Defold. Everything should however be easy to port to other platforms and languages — the project we'll build is written in TypeScript with `@defold-typescript/types`.",
      },
      {
        kind: "paragraph",
        text: "We assume that you're familiar with a bit of vector mathematics (linear algebra). If you're not, it's a good idea to read up on it since it's insanely useful for game development. David Rosen at Wolfire has written a very good series about it [here](http://blog.wolfire.com/2009/07/linear-algebra-for-game-developers-part-1/).",
      },
      {
        kind: "paragraph",
        text: "If you are already using Defold, you can create a new project based on the *Platformer* template-project and play around with that while reading this article.",
      },
    ],
  },
  {
    id: "setup",
    title: "Setup",
    elements: [
      {
        kind: "paragraph",
        text: "Before we dive into the mechanics, here is the toolchain loop the rest of the deck assumes. Scaffold a project, open it in the Defold editor, then iterate with `build` / `watch` while you follow the slides — every snippet below is a slice of a real `src/player.ts` that runs end-to-end in the same flow.",
      },
      {
        kind: "bullets",
        items: [
          "`mkdir my-game && cd my-game`",
          "`bunx @defold-typescript/cli@latest init`",
          "`bun install` (the `init` install reminder tells you to run it)",
          "`bunx @defold-typescript/cli build` (one-shot transpile to Lua)",
          "`bunx @defold-typescript/cli watch` (rebuild on save while you iterate)",
        ],
      },
      {
        kind: "paragraph",
        text: "The assets in this deck's `player.atlas`, `level.tilesource`, and the screenshots used in the mechanics slides come from [`defold/template-platformer`](https://github.com/defold/template-platformer) (MIT), copied into `docs/examples/platformer/assets/`. Pull a fresh copy from the upstream repo if you need them for your own project.",
      },
      {
        kind: "sidenote",
        text: "This slide is a one-page on-ramp. The full toolchain loop (Defold editor install, code editor setup, debug launch) lives in [docs/guide/getting-started.md](https://github.com/defold-typescript/toolchain/blob/main/docs/guide/getting-started.md).",
      },
    ],
  },
  {
    id: "collision-detection",
    title: "Collision Detection",
    elements: [
      {
        kind: "paragraph",
        text: "Collision detection is needed to keep the player from moving through the level geometry. There are a number of ways to deal with this depending on your game and its specific requirements. One of the easiest ways, if possible, is to let a physics engine take care of it. In Defold we use the physics engine [Box2D](http://box2d.org/) for 2D games.",
      },
      {
        kind: "paragraph",
        text: "A physics engine stores the states of the physics objects along with their shapes in order to simulate physical behaviour. It also reports collisions while simulating, so the game can react as they happen. In most physics engines there are three types of objects: *static*, *dynamic* and *kinematic* objects (these names might be different in other physics engines). There are other types of objects too, but let's ignore them for now.",
      },
      {
        kind: "bullets",
        items: [
          "A *static* object will never move (e.g. level geometry).",
          "A *dynamic* object is influenced by forces and torques which are transformed into velocities during the simulation.",
          "A *kinematic* object is controlled by the application logic, but still affects other dynamic objects.",
        ],
      },
      {
        kind: "paragraph",
        text: "In a game like this, we are looking for something that resembles physical real-world behaviour, but having responsive controls and balanced mechanics is far more important. A jump that feels good does not need to be physically accurate or act under real-world gravity. [This](http://hypertextbook.com/facts/2007/mariogravity.shtml) analysis shows however that the gravity in Mario games gets closer to a gravity of 9.8 m/s² for each version. :-)",
      },
      {
        kind: "paragraph",
        text: "It's important that we have full control of what's going on so we can design and tweak the mechanics to achieve the intended experience. This is why we choose to model the player character by a kinematic object. Then we can move the player character around as we please, without having to deal with physical forces. This means that we will have to solve separation between the character and level geometry ourselves (more about this later), but that's a drawback we are willing to accept. We will represent the player character by a box shape in the physics world.",
      },
    ],
  },
  {
    id: "movement",
    title: "Movement",
    elements: [
      {
        kind: "paragraph",
        text: "Now that we have decided that the player character will be represented by a kinematic object, we can move it around freely by setting the position. Let's start with moving left/right.",
      },
      {
        kind: "paragraph",
        text: "The movement will be acceleration-based, to give a sense of weight to the character. Like for a regular vehicle, the acceleration defines how fast the player character can reach the max speed and change direction. The acceleration is acting over the frame time-step — usually provided in a parameter `dt` (delta-*t*) — and then added to the velocity. Similarly, the velocity acts over the frame and the resulting translation is added to the position. In maths, this is called [integration over time](http://en.wikipedia.org/wiki/Integral).",
      },
      {
        kind: "image",
        src: "https://defold.com/tutorials/images/platformer/integration.png",
        alt: "Approximative velocity integration",
      },
      {
        kind: "paragraph",
        text: "The two vertical lines marks the beginning and end of the frame. The height of the lines is the velocity the player character has at these two points in time. Let us call these velocities `v0` and `v1`. `v1` is given by applying the acceleration (the slope of the curve) for the time-step `dt`:",
      },
      {
        kind: "image",
        src: "https://defold.com/tutorials/images/platformer/equationofvelocity.png",
        alt: "Equation of velocity",
      },
      {
        kind: "paragraph",
        text: "The orange area is the translation we are supposed to apply to the player character during the current frame. Geometrically, we can approximate the area as:",
      },
      {
        kind: "image",
        src: "https://defold.com/tutorials/images/platformer/equationoftranslation.png",
        alt: "Equation of translation",
      },
      {
        kind: "paragraph",
        text: "This is how we integrate the acceleration and velocity to move the character in the update-loop. We keep the five tweakable numbers as module-level constants — easy to scan at the top of the file, easy to retune for a different feel.",
      },
      { kind: "snippet", file: "01-tweaks.ts_" },
      {
        kind: "paragraph",
        text: "Then in `fixed_update` (which runs on the fixed physics step) we integrate horizontal velocity from the stored `input_direction` (clamped to `±max_speed`), apply gravity, move the player by `velocity × dt`, and add the editor-tunable `adj` offset property so the position can be nudged in the editor:",
      },
      { kind: "snippet", file: "08-define-script.ts_" },
    ],
  },
  {
    id: "collision-response",
    title: "Collision Response",
    elements: [
      {
        kind: "paragraph",
        text: "Now our player character can move and fall, so it's time to look at collision responses. We obviously need to land and move along the level geometry. We will use the contact points provided by the physics engine to make sure we never overlap anything.",
      },
      {
        kind: "paragraph",
        text: "A contact point carries a *normal* of the contact (pointing out from the object we collide with, but might be different in other engines) as well as a *distance*, which measures how far we have penetrated the other object. This is all we need to separate the player from the level geometry. Since we are using a box, we might get multiple contact points during a frame. This happens for example when two corners of the box intersect the horizontal ground, or the player is moving into a corner.",
      },
      {
        kind: "image",
        src: "https://defold.com/tutorials/images/platformer/collision.png",
        alt: "Contact normals acting on the player character",
      },
      {
        kind: "paragraph",
        text: "To avoid making the same correction multiple times, we accumulate the corrections in a vector to make sure we don't over-compensate. This would make us end up too far away from the object we collided with. In the image above, you can see that we currently have two contact points, visualized by the two arrows (normals). The penetration distance is the same for both contacts, if we would use that blindly each time we would end up moving the player twice the intended amount.",
      },
      {
        kind: "sidenote",
        text: "It's important to reset the accumulated corrections each frame to the 0-vector. Put something like this at the end of `fixed_update()`:\n`self.correction = vmath.vector3()`",
      },
      {
        kind: "paragraph",
        text: "All the contact handling lives in one function. It is called from `on_message` for every `contact_point_response` message:",
      },
      { kind: "snippet", file: "06-handle-obstacle-contact.ts_" },
      {
        kind: "paragraph",
        text: "A few TypeScript-specific notes about the conversion:",
      },
      {
        kind: "bullets",
        items: [
          "`vmath.project(a, b)` becomes a typed function call — the same name and semantics as the Lua form.",
          "Vector math is method-based, not operator-based: `normal.mul(distance)` is `normal * distance` in Lua, `self.correction.add(comp)` is `self.correction + comp`.",
          "`Math.abs` lowers to Lua's `math.abs` automatically; no Defold-specific shim is needed.",
        ],
      },
    ],
  },
  {
    id: "jumping",
    title: "Jumping",
    elements: [
      {
        kind: "paragraph",
        text: "Now that we can run on the level geometry and fall down, it's time to jump! Platformer-jumping can be done in many different ways. In this game we are aiming for something similar to Super Mario Bros and Super Meat Boy. When jumping, the player character is thrusted upwards by an impulse, which is basically a fixed speed.",
      },
      {
        kind: "paragraph",
        text: "Gravity will continuously pull the character down again, resulting in a nice jump arc. While in the air, the player can still control the character. If the player lets go of the jump button before the peak of the jump arc, the upwards speed is scaled down to halt the jump prematurely.",
      },
      {
        kind: "paragraph",
        text: "The `jump` and `abort_jump` helpers are tiny — they only run on a `pressed` or `released` edge from `on_input`, never on each frame the key is held:",
      },
      { kind: "snippet", file: "07-jump.ts_" },
    ],
  },
  {
    id: "level-geometry",
    title: "Level Geometry",
    elements: [
      {
        kind: "paragraph",
        text: "The level geometry is the collision shapes of the environment that the player character (and possibly other things) collide with. In Defold, there are two ways to create this geometry.",
      },
      {
        kind: "paragraph",
        text: "Either you create separate collision shapes on top of the levels you build. This method is very flexible and allows fine positioning of graphics. It is especially useful if you want soft slopes. The game [Braid](http://braid-game.com/) used this method of building levels, and it is the method the example level in this tutorial is built too. Here is how it looks in the Defold editor:",
      },
      {
        kind: "image",
        src: "https://defold.com/tutorials/images/platformer/editor.png",
        alt: "The Defold Editor with the level geometry and player placed into the world",
      },
      {
        kind: "paragraph",
        text: "Another option is to build levels out of tiles and have the editor automatically generate the physics shapes, based on tile graphics. This means that the level geometry will be automatically updated when you change the levels which can be extremely useful.",
      },
      {
        kind: "paragraph",
        text: "The placed tiles will get their physics shapes automatically merged into one if they align. This eliminates the gaps that can make your player character stop or bump when sliding across several horizontal tiles. This is done by replacing the tile polygons with edge shapes in Box2D at load-time.",
      },
      {
        kind: "image",
        src: "https://defold.com/tutorials/images/platformer/stitching.png",
        alt: "Multiple tile-based polygons stitched into one",
      },
      {
        kind: "paragraph",
        text: "Above is an example where we created five neighboring tiles out of a piece of the platformer graphics. In the image you can see how the placed tiles (top) correspond to one single shape that has been stitched together into one (bottom grey contour).",
      },
      {
        kind: "paragraph",
        text: "Check out our guides about [physics](https://defold.com/manuals/physics) and [2D graphics](https://defold.com/manuals/2dgraphics) for more info.",
      },
    ],
  },
  {
    id: "final-words",
    title: "Final Words",
    elements: [
      {
        kind: "paragraph",
        text: "If you want more information about platformer mechanics, here is an impressively huge amount of info about the physics in [Sonic](http://info.sonicretro.org/Sonic_Physics_Guide).",
      },
      {
        kind: "paragraph",
        text: "If you try our template project on an iOS device or with a mouse, the jump can feel really awkward. That's just our feeble attempt at platforming with one-touch-input. :-)",
      },
      {
        kind: "paragraph",
        text: "We did not talk about how we handled the animations in this game. The `update_animations()` and `play_animation()` helpers at the top of `player.ts` are short — they look at `self.facing_direction` and `self.ground_contact` to pick the right animation and set the sprite's horizontal flip.",
      },
      {
        kind: "paragraph",
        text: "We hope you found this information useful! Please make a great platformer so we all can play it! ❤",
      },
    ],
  },
  {
    id: "code",
    title: "Code",
    elements: [
      {
        kind: "paragraph",
        text: "Here is the full TypeScript player in one block.",
      },
      {
        kind: "paragraph",
        text: "The conversion highlights we'll revisit after this slide:",
      },
      {
        kind: "bullets",
        items: [
          "Module-level constants for tweaks, replacing Lua's `local` at chunk scope.",
          "`defineScript({...})` replaces bare `function init(self)` / `function on_input(self, ...)` globals.",
          "Vector math uses methods: `v.add(other)`, `v.mul(scalar)`, `v.unm()` — see the [vector math guide](https://github.com/defold-typescript/toolchain/blob/main/docs/guide/vector-math.md).",
          '`isMessage(message_id, message, "contact_point_response")` narrows `message` to the typed payload — no manual cast.',
          "`init` returns the initial state; the transpiler merges it onto the engine-owned `self`.",
        ],
      },
      { kind: "snippet", file: "09-full-player.ts_", caption: "src/player.ts" },
    ],
  },
  {
    id: "debugging",
    title: "Debugging",
    elements: [
      {
        kind: "paragraph",
        text: "You can step through the `.ts` source with breakpoints even though Defold runs the transpiled Lua — every build emits a source map the [Local Lua Debugger](https://marketplace.visualstudio.com/items?itemName=tomblind.local-lua-debugger-vscode) reads. Run `setup-debug` once to wire the `lldebugger.start()` bootstrap into your entry script and write the `.vscode` launch config, then drive a session from a stock engine through the Bun launcher — no editor required.",
      },
      {
        kind: "bullets",
        items: [
          "`bunx @defold-typescript/cli defold setup-debug` (wire the debug bootstrap + `.vscode` config, once per project)",
          "`bunx @defold-typescript/cli build` (or keep `watch` running) so the `.ts.script.map` files are current",
          "`bunx @defold-typescript/cli defold build` so `build/default/game.projectc` exists",
          "In VS Code, pick **Defold: Debug (TypeScript)** and press F5 — set breakpoints in your `.ts` files",
        ],
      },
      {
        kind: "sidenote",
        text: "Full walkthrough — `setup-debug`, the source-map wiring, and the Windows OpenAL step — in [docs/guide/debugging.md](https://github.com/defold-typescript/toolchain/blob/main/docs/guide/debugging.md).",
      },
    ],
  },
  {
    id: "headless-builds",
    title: "Headless Builds",
    elements: [
      {
        kind: "paragraph",
        text: "On CI, or any time you want to build without opening the editor, drive Defold's headless `bob` tool through the `defold` subcommand. The first run downloads a version-matched `bob.jar` into a cache dir and reuses it afterward; `bob` needs a JVM on your `PATH`. The exit code propagates, so a failed build fails the command.",
      },
      {
        kind: "bullets",
        items: [
          "`bunx @defold-typescript/cli defold resolve` (fetch library dependencies)",
          "`bunx @defold-typescript/cli defold build` (debug build into `build/default`)",
          "`bunx @defold-typescript/cli defold bundle` (bundle a platform target)",
        ],
      },
      {
        kind: "sidenote",
        text: "JVM, cache, and `--build-server` details in the [Headless builds section of the getting-started guide](https://github.com/defold-typescript/toolchain/blob/main/docs/guide/getting-started.md#headless-builds-no-editor).",
      },
    ],
  },
  {
    id: "deployment",
    title: "Deployment",
    elements: [
      {
        kind: "paragraph",
        text: "When the game is ready to ship, `defold bundle` turns the same TypeScript-authored project into a distributable for your chosen platform target — the transpiled Lua, assets, and a platform-matched engine, packaged headlessly. The build loop above runs unchanged from a CI job, so a tagged release can produce its bundle without a human ever opening the editor.",
      },
      {
        kind: "sidenote",
        text: "Bundle targets and the `bob` toolchain are documented in the [Headless builds section of the getting-started guide](https://github.com/defold-typescript/toolchain/blob/main/docs/guide/getting-started.md#headless-builds-no-editor).",
      },
    ],
  },
];
