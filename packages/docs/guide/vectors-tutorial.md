---
toc-title: Vectors & rotations
llms-full: false
---
# Vectors and rotations

This tutorial teaches the math behind movement in a [Defold](https://defold.com/) game written in TypeScript: positions, vectors, speed, time, rotation, and the space each of them is measured in. Every lesson starts from a **game problem** — something you actually want your game to do — and only then introduces the idea that solves it. Diagrams come first, code second, and every code sample is followed by a plain-English explanation.

> [!TIP] **Colour code.** The same colours mean the same thing in every figure: **blue** is a position, **green** a direction, **amber** a speed, **purple** a velocity, **pink** a rotation, **cyan** is dt, and **orange** is any other arrow (a movement or a difference).

## Start here

Almost every movement bug in a beginner's game comes from mixing up six different ideas. They often look similar in code — several of them are even stored in the same data type — but they answer **different questions**. Keep this table in mind; the whole tutorial is about learning each row and how they connect.

| Idea | The question it answers | What it is in code | Example |
| --- | --- | --- | --- |
| **Position** | “Where am I?” | `Vector3` (a place) | `vmath.vector3(100, 200, 0)` |
| **Direction** | “Which way?” | `Vector3` with length 1 | `vmath.vector3(1, 0, 0)` |
| **Speed** | “How fast?” | a plain number | `250` pixels / second |
| **Velocity** | “Which way + how fast?” | `Vector3` = direction × speed | `vmath.vector3(250, 0, 0)` |
| **Rotation** | “How am I oriented?” | `Quaternion` (from an angle) | `vmath.quat_rotation_z(a)` |
| **dt** | “How much time passed?” | a number of seconds | `0.0167` at 60 FPS |

The spaceship code you'll write in lesson 8 is really just this table read from top to bottom, every frame: turn the **rotation** into a **direction**, multiply by **speed** to get a **velocity**, multiply by **dt** to get this frame's step, and add it to the **position**.

### Your setup

This tutorial assumes a project created with `defold-typescript`. If you don't have one yet, [Getting started](./getting-started.md) walks through it:

- Scaffold a project: `bunx @defold-typescript/cli@latest init my-game`, then `bun install`.
- Keep `bunx @defold-typescript/cli watch` running while you edit. It compiles each `src/name.ts` into `src/name.ts.script`, which is the file you attach to a game object in the Defold editor.
- Scripts are written with `defineScript({ ... })` — you'll see it from lesson 5 onwards. Engine namespaces such as `vmath`, `go` and `msg` are available everywhere without importing.

> [!NOTE] **The one syntax rule to remember.** Vectors use [methods instead of math operators](./vector-math.md), because TypeScript only allows `+` `-` `*` on numbers. You'll write `a.add(b)`, `a.sub(b)`, `v.mul(2)`, `v.div(2)` and `v.unm()` (flip the arrow). They compile to Defold's native vector math, so they cost nothing extra. Length and normalization are **functions in the `vmath` namespace**, not methods: `vmath.length(v)` and `vmath.normalize(v)`. Writing `v.normalize()` is a compile error — some older tutorials show that form.

> [!NOTE] Every TypeScript example on this page is type-checked in strict mode against the shipped declarations. If a newer toolchain changes something, your editor's type errors will tell you where.

## 01 — Coordinates

> *“I want to put my spaceship somewhere on the screen. How do I tell Defold where?”*

Think of the game world as an enormous sheet of graph paper. To describe any spot on it you need exactly two numbers: how far **right** you go, and how far **up** you go. Those two numbers are called **X** and **Y**.

- **X** measures left–right. Bigger X means further right.
- **Y** measures down–up. Bigger Y means further *up*.
- The spot where both numbers are zero, **(0, 0)**, is called the **origin**. With Defold's default camera it is the **bottom-left corner** of the game window.
- Numbers can be negative: X = −50 is 50 pixels *left* of the origin, Y = −20 is 20 pixels below it. Those spots are off-screen at first, but they're perfectly valid places in the world.

![Figure 1 — Every position is two distances from the origin: how far right (X) and how far up (Y).](img/vectors/coordinates.svg#inline)

> [!WARNING] If you've used web canvases or some other engines, Y might have pointed *down* there. In Defold, **+Y is up**. Pressing “jump” should make Y bigger.

### Setting a position in Defold

```ts
const position = vmath.vector3(100, 200, 0);
go.set_position(position);
```

- `vmath.vector3(x, y, z)` bundles three numbers into one value. Here x = **100** (100 pixels right of the origin) and y = **200** (200 pixels up).
- The third number, **z**, is depth — in a 2D game it decides which things are drawn on top of which. For movement we leave it at 0.
- `go.set_position(position)` moves the game object that this script is attached to. Instantly — there's no animation; next frame, it's just there.
- Strictly speaking, positions are measured from the object's **parent**. Objects without a parent — all of them until lesson 11 — are measured from the origin, which is what we want here.

You can also ask where something is right now, and read the individual numbers:

```ts
const where = go.get_position();
print(where.x, where.y); // 100 200
```

> [!TIP] A **position** answers one question: **“Where am I?”** It's a place — a dot on the graph paper.

**Try it**

1. Where on the screen is `vmath.vector3(0, 300, 0)`?
2. Which of these positions is off-screen with the default camera: `(50, 50)`, `(-50, 100)`, `(300, -10)`?

> [!MORE] Answers
> 1. On the left edge, 300 pixels up.
> 2. (−50, 100) is left of the screen and (300, −10) is below it; (50, 50) is visible.

## 02 — What is a vector?

> *“My ship is at (100, 200). Every frame it should end up a little further right. How do I describe ‘a little further right’?”*

A position describes a **place**. But “a little further right” isn't a place — it's a **change**. The natural way to draw a change is an **arrow**:

- The way the arrow points is its **direction**.
- How long the arrow is, is its **length** (mathematicians say *magnitude*).

That arrow is what programmers call a **vector**. Just like a position, it's stored as an X and a Y — but the numbers now mean “how far to go”, not “where to be”.

```ts
const movement = vmath.vector3(10, 0, 0); // 10 to the right, 0 up
```

Read it as: *“go 10 pixels right and 0 pixels up”*. It doesn't say where you start. The same arrow can be applied to a ship at (100, 200), to a coin at (0, 0), to anything.

![Figure 2 — A position is a dot (a place). A vector is an arrow (a change) that can be drawn starting anywhere.](img/vectors/position-vs-vector.svg#inline)

> [!WARNING] Defold uses the **same type**, `Vector3`, for positions *and* for arrows. TypeScript can't tell them apart — only **you** know what a value means. So name variables by meaning: `shipPosition`, `moveDirection`, `velocity`, `toTarget`. Good names prevent half the bugs in this tutorial.

### Three kinds of Vector3 you'll meet

| Meaning | Example | Read it as |
| --- | --- | --- |
| **Position** | `vmath.vector3(100, 200, 0)` | “the spot 100 right, 200 up” |
| **Direction** | `vmath.vector3(1, 0, 0)` | “pointing right” (length exactly 1) |
| **Movement** | `vmath.vector3(10, 0, 0)` | “a step of 10 pixels to the right” |

**Try it**

1. Describe `vmath.vector3(0, -5, 0)` in words.
2. Describe `vmath.vector3(-3, 4, 0)`. Bonus: how long is that arrow? (Hint: count squares on graph paper, or wait for lesson 4.)

> [!MORE] Answers
> 1. “5 pixels down.”
> 2. “3 left and 4 up.” Its length is 5 — the classic 3-4-5 triangle.

## 03 — Vector addition

> *“I have a position and a movement arrow. How do I actually move the ship?”*

Put the **tail** of the movement arrow on the ship's dot. The **tip** of the arrow is where the ship ends up. That's all “adding a vector to a position” means.

With numbers, it's just as simple: add the X parts together, and add the Y parts together. They never mix — X only ever adds to X, Y only to Y.

![Figure 3 — position + movement = new position. Tail on the dot, tip is the answer.](img/vectors/addition.svg#inline)

```ts
const position = vmath.vector3(100, 100, 0);
const movement = vmath.vector3(150, 50, 0);

const newPosition = position.add(movement); // (250, 150, 0)
go.set_position(newPosition);
```

- `position.add(movement)` creates a **brand-new** vector: (100 + 150, 100 + 50, 0 + 0) = (250, 150, 0).
- `position` itself is **not** changed. If you want to keep the result, store it (here in `newPosition`).
- `go.set_position(newPosition)` puts the ship at the new spot.

#### Going backwards: subtraction

Subtraction undoes addition: `newPosition.sub(movement)` gives back (100, 100, 0). Keep `sub` in mind — in lesson 9 it becomes one of the most useful tools in game programming.

> [!NOTE] Why not write `position + movement`? Because TypeScript only allows `+` on numbers and strings, so that line is a compile error (TS2365). The toolchain gives vectors typed methods instead — `add`, `sub`, `mul`, `div`, `unm` — and turns them into Defold's own vector math when it compiles.

#### Several moves in a row

If a ship moves by one arrow and then by another, the total trip is both arrows added together, tip-to-tail. This is exactly what happens in a game: every frame adds one more small arrow, and the ship's path is the chain of all of them.

**Try it**

1. What is `vmath.vector3(50, 50, 0).add(vmath.vector3(20, -10, 0))`?
2. A ship at (0, 0) moves by (10, 0) three times. Where is it?

> [!MORE] Answers
> 1. (70, 40, 0).
> 2. (30, 0) — three steps of 10 to the right.

> [!NOTE] **Recap.** Position + movement = new position. Add X to X and Y to Y. `add` returns a new vector and leaves the original alone.

## 04 — Direction, speed and velocity

> *“My ship should fly to the right at 200 pixels per second. How do I separate ‘which way’ from ‘how fast’?”*

An arrow mixes two pieces of information: which way it points, and how long it is. In games it's extremely useful to keep them apart:

- **Direction** — *“which way?”* An arrow whose length is exactly **1**. It only points.
- **Speed** — *“how fast?”* A plain number, like 200 pixels per second. No direction at all.
- **Velocity** — *“which way + how fast?”* The direction arrow stretched to the length of the speed.

![Figure 4 — Length is speed, pointing is direction. A velocity carries both.](img/vectors/direction-speed.svg#inline)

```text
velocity  =  direction  ×  speed
```

```ts
const speed = 200;                          // pixels per second
const direction = vmath.vector3(1, 0, 0);   // pointing right
const velocity = direction.mul(speed);      // (200, 0, 0)
```

- `.mul(speed)` multiplies every part of the vector by the same number: (1 × 200, 0 × 200, 0 × 200). The arrow gets 200 times longer but keeps pointing the same way.
- `mul` takes a **number**. Multiplying a vector by another vector is not what you want here, and the types won't allow it.

### Why direction arrows should have length 1

Because then “× speed” gives you exactly that speed. If your direction arrow were accidentally 2 long, your ship would fly twice as fast as you asked. The most famous version of this bug happens with keyboard movement:

![Figure 5 — Left: pressing right + up gives an arrow 1.41 long, so diagonal movement is 41% faster. Right: normalizing fixes the length.](img/vectors/normalize.svg#inline)

**Normalizing** means: keep the direction, but shrink or stretch the arrow until its length is exactly 1. Defold does it for you:

```ts
const input = vmath.vector3(1, 1, 0);        // right + up both held
print(vmath.length(input));                  // 1.414...
const direction = vmath.normalize(input);    // about (0.707, 0.707, 0)
print(vmath.length(direction));              // 1
```

- `vmath.length(v)` tells you how long an arrow is. For a velocity, that length *is* the speed. For the difference between two positions, it's the distance between them.
- `vmath.normalize(v)` returns a new arrow pointing the same way with length 1. A vector with length 1 is often called a **unit vector**.

> [!WARNING] An arrow of length **0** has no direction, so it can't be normalized — Defold's documentation warns this is a division by zero. Before calling `vmath.normalize`, make sure the length is above 0 (you'll see this pattern in lesson 9). And remember: it's `vmath.normalize(v)`, not `v.normalize()`.

**Try it**

1. Direction `(0, 1, 0)`, speed 50. What's the velocity? Which way does the ship go?
2. Why is `vmath.vector3(3, 4, 0).mul(100)` a bad velocity if you wanted a speed of 100? What's its real speed?

> [!MORE] Answers
> 1. (0, 50, 0): straight up at 50 px/s.
> 2. That arrow has length 5, so ×100 gives length 500 — five times too fast. Normalize first: `vmath.normalize(v).mul(100)`.

## 05 — Time and dt

> *“My ship moves nicely on my laptop, but on my friend's fast gaming monitor it zooms across the screen. Why?”*

A game redraws the screen many times per second. Each redraw is a **frame**, and before each frame Defold calls your script's `update` function. The problem: **the number of frames per second (FPS) is not the same everywhere**. A fast machine might run at 144 FPS, a slow phone at 30, and even the same computer varies from moment to moment.

### So what's wrong with this?

<!-- prelude: let position = vmath.vector3(0, 0, 0); const velocity = vmath.vector3(5, 0, 0); -->
```ts
position = position.add(velocity);
```

It moves the ship by the *whole* velocity **every frame**. At 60 FPS that happens 60 times a second; at 30 FPS only 30 times. Same code, but the ship's speed depends on how fast the computer is.

### The fix: measure time

Defold hands `update` a second number called **dt** — short for *delta time*, “the change in time”. It answers exactly one question: **“How much time passed since the previous update?”** It's measured in seconds, so at 60 FPS it's about 1/60 = 0.0167.

<!-- prelude: let position = vmath.vector3(0, 0, 0); const velocity = vmath.vector3(200, 0, 0); declare const dt: number; -->
```ts
position = position.add(velocity.mul(dt));
```

Now velocity means **pixels per second**. Multiplying it by the fraction of a second that just passed gives the distance to travel *this frame*. Many small steps or a few big ones — it adds up to the same distance.

![Figure 6 — Without dt, speed depends on the frame rate. With dt, every machine covers 200 px in one second.](img/vectors/dt.svg#inline)

| Frame rate | dt (seconds) | Step per frame (200 × dt) | Frames in 1 s | Distance after 1 s |
| --- | --- | --- | --- | --- |
| 30 FPS | 0.0333 | 6.67 px | 30 | **200 px** |
| 60 FPS | 0.0167 | 3.33 px | 60 | **200 px** |
| 144 FPS | 0.0069 | 1.39 px | 144 | **200 px** |

### A complete script

Here is the idea as a real Defold script. Attach the compiled `dt_demo.ts.script` to a game object and it glides right at 200 pixels per second on every machine:

```ts title="dt_demo.ts"
import { defineScript } from "@defold-typescript/types";

export default defineScript({
  init() {
    return { velocity: vmath.vector3(200, 0, 0) };
  },
  update(self, dt) {
    const position = go.get_position();
    go.set_position(position.add(self.velocity.mul(dt)));
  },
});
```

- `defineScript({ ... })` describes a Defold script. The toolchain generates the Defold boilerplate for you.
- `init()` runs once, when the object is created. Whatever object it **returns** becomes the script's memory, called `self`. Here we store a velocity.
- `update(self, dt)` runs every frame. Defold passes in `self` (our memory) and `dt` (time since last frame).
- Read the current position, add this frame's small step, write the position back.

> [!TIP] Anything measured **“per second”** — speed, turning speed, acceleration — must be multiplied by `dt` before it touches the game world. If you forget, your game runs at different speeds on different machines.

**Try it**

1. Speed is 300 px/s and this frame's dt is 0.02. How far does the ship move this frame?
2. A game freezes for half a second, so one frame has dt = 0.5. How far does a 200 px/s ship jump?

> [!MORE] Answers
> 1. 300 × 0.02 = 6 pixels.
> 2. 200 × 0.5 = 100 pixels in a single jump. That's still correct over time, but large dt values can make objects tunnel through walls — a topic for physics.

## 06 — Rotation

> *“My ship's sprite points right. How do I turn it to face up?”*

### Angles first

An **angle** is simply an amount of turning. There are two common ways to count it:

- **Degrees** — a full turn is 360°, a half turn 180°, a quarter turn 90°. This is what humans usually use.
- **Radians** — a full turn is about 6.283, a half turn about 3.14, a quarter turn about 1.57. That magic 3.14159… is π (“pi”), available in TypeScript as `Math.PI`.

Why do programming APIs prefer radians? Mostly history and convenience: the math libraries in almost every language work in radians, so game APIs follow along. You don't need to know why π shows up. Just remember one sentence: **π radians = half a turn**. Everything else follows.

![Figure 7 — 0 points right. Positive angles turn counter-clockwise. Radians are just a different unit for the same turn.](img/vectors/rotation.svg#inline)

| Turn | Degrees | Radians | In TypeScript |
| --- | --- | --- | --- |
| none (facing right) | 0° | 0 | `0` |
| an eighth | 45° | ≈ 0.785 | `Math.PI / 4` |
| a quarter (facing up) | 90° | ≈ 1.571 | `Math.PI / 2` |
| a half (facing left) | 180° | ≈ 3.142 | `Math.PI` |
| a full turn | 360° | ≈ 6.283 | `Math.PI * 2` |

To convert, multiply degrees by π / 180 — or use Lua's built-in helper `math.rad`, which the toolchain exposes with types:

```ts
const angle = 90 * (Math.PI / 180);   // 90 degrees = 1.5708 radians
const same = math.rad(90);            // exactly the same number
```

### Rotating a game object

<!-- prelude: const angle = Math.PI / 2; -->
```ts
const rotation = vmath.quat_rotation_z(angle);
go.set_rotation(rotation);
```

- `vmath.quat_rotation_z(angle)` builds a rotation of `angle` radians around the **Z axis** — the axis that points straight out of your screen. Spinning around it is exactly the flat 2D turning you want.
- `go.set_rotation(rotation)` applies it. The sprite visually turns; with angle = π/2 our right-facing ship now faces up.
- `go.get_rotation()` reads the current rotation back.

> [!TIP] **About quaternions.** Defold stores rotations as **quaternions** — the `Quaternion` type — because they work well for full 3D rotation. **You do not need to understand quaternion mathematics yet.** Treat one as a sealed box: make it with `vmath.quat_rotation_z(angle)`, hand it to `go.set_rotation` or `vmath.rotate`. That's it.

> [!NOTE] Keep your own angle as a plain number (for example `self.angle`) and rebuild the quaternion from it each frame. Numbers are easy to add to, compare and print; quaternions aren't.

**Try it**

1. What's 180° in radians? And 45°?
2. Which way does a right-facing ship point after `vmath.quat_rotation_z(-Math.PI / 2)`?

> [!MORE] Answers
> 1. π ≈ 3.14 and π/4 ≈ 0.785.
> 2. Down — a negative angle turns clockwise, and a quarter turn clockwise from right is down.

## 07 — Rotation + direction

> *“My ship is rotated 135°. Which way is ‘forward’ now — so I can fly that way?”*

This is the lesson where everything clicks together. Start with the ship's **default forward direction** — the way its artwork points before any rotation. Our ship sprite faces right, so:

```ts
const forward = vmath.vector3(1, 0, 0); // our ship's default forward: right
```

Now the trick. The ship has a rotation. If we turn the forward arrow by **that same rotation**, it will point wherever the ship's nose points. Defold has one function for exactly that — `vmath.rotate`:

<!-- prelude: const forward = vmath.vector3(1, 0, 0); -->
```ts
const rotation = go.get_rotation();
const direction = vmath.rotate(rotation, forward);
```

![Figure 8 — The same forward arrow, rotated by the ship's rotation. It always points out of the nose.](img/vectors/rotated-forward.svg#inline)

- `vmath.rotate(rotation, forward)` returns a **new** arrow: `forward` turned by `rotation`.
- Rotating never changes an arrow's length. Forward had length 1, so the result still has length 1 — it's a ready-made **direction**. No normalizing needed.
- At 0° you get (1, 0). At 90°, (0, 1). At 180°, (−1, 0). At 135°, about (−0.71, 0.71): up and to the left.

### The chain that makes ships fly

Here's the relationship this whole tutorial has been building towards. Each step turns one idea from the [start-here table](#start-here) into the next:

![Figure 9 — rotation → rotated forward vector → movement direction → velocity → position.](img/vectors/pipeline.svg#inline)

> [!TIP] You never have to “calculate which way the ship faces”. You describe forward **once**, in the ship's unrotated space, and let `vmath.rotate` carry it along with the ship's rotation. Turn the ship, and its direction, velocity and path all follow automatically.

> [!WARNING] Match `forward` to your artwork. If your sprite is drawn facing **up**, forward must be `vmath.vector3(0, 1, 0)`, otherwise your ship will fly sideways.

## 08 — Build a spaceship

> *“The player should turn left and right, and fly forward wherever the ship is pointing.”*

### Step 1 — Input bindings

Open `input/game.input_binding` in the Defold editor and add these **Key Triggers**. The action names are what your code will check for:

| Key | Action name | Used for |
| --- | --- | --- |
| `KEY_LEFT` | `turn_left` | rotate counter-clockwise |
| `KEY_RIGHT` | `turn_right` | rotate clockwise |
| `KEY_UP` | `thrust` | fly forward |
| `KEY_DOWN` | `brake` | only used in the final project |

### Step 2 — The scene

In `main/main.collection`, add a game object with id **player**, give it a sprite of a ship **facing right**, and add the compiled script `src/ship.ts.script` as a component. Place it near the middle of the screen.

### Step 3 — The script

```ts title="ship.ts"
import { defineScript } from "@defold-typescript/types";

const TURN_LEFT = hash("turn_left");
const TURN_RIGHT = hash("turn_right");
const THRUST = hash("thrust");

const TURN_SPEED = Math.PI;       // radians per second (half a turn)
const MOVE_SPEED = 250;           // pixels per second
const FORWARD = vmath.vector3(1, 0, 0); // the sprite faces right

export default defineScript({
  init() {
    msg.post(".", "acquire_input_focus");
    return {
      angle: 0,          // current heading in radians
      turn: 0,           // -1 = right, 0 = none, +1 = left
      thrusting: false,
    };
  },

  update(self, dt) {
    // 1. ROTATION: change the angle, build a rotation from it
    self.angle = self.angle + self.turn * TURN_SPEED * dt;
    const rotation = vmath.quat_rotation_z(self.angle);
    go.set_rotation(rotation);

    // 2. DIRECTION: rotate our forward arrow
    const direction = vmath.rotate(rotation, FORWARD);

    // 3. VELOCITY + POSITION
    if (self.thrusting) {
      const velocity = direction.mul(MOVE_SPEED);
      const position = go.get_position().add(velocity.mul(dt));
      go.set_position(position);
    }
  },

  on_input(self, action_id, action) {
    if (action_id === TURN_LEFT) {
      if (action.pressed) self.turn = self.turn + 1;
      if (action.released) self.turn = self.turn - 1;
    } else if (action_id === TURN_RIGHT) {
      if (action.pressed) self.turn = self.turn - 1;
      if (action.released) self.turn = self.turn + 1;
    } else if (action_id === THRUST) {
      if (action.pressed) self.thrusting = true;
      if (action.released) self.thrusting = false;
    }
  },
});
```

### Line by line

#### The setup (top of the file)

- `hash("turn_left")` — Defold identifies input actions by **hash**, not by string. We hash each name once, at the top, and compare against it later. Comparing `action_id` to a plain string would never match.
- `TURN_SPEED = Math.PI` — **radians per second**. π is half a turn, so holding a key turns the ship halfway around in one second.
- `MOVE_SPEED = 250` — **pixels per second**: the **speed** from lesson 4.
- `FORWARD` — the unrotated forward arrow from lesson 7, (1, 0, 0) because the sprite faces right.

#### init — runs once

- `msg.post(".", "acquire_input_focus")` tells Defold “send keyboard input to this object”. Without it, `on_input` is never called.
- The returned object becomes `self`: the current `angle` (radians), a `turn` value (+1 = turning left, −1 = right, 0 = not turning), and whether we're `thrusting`.

#### on_input — reacts to keys

- Defold calls `on_input` with `action.pressed` when a key goes down and `action.released` when it comes up. We just remember what's held.
- Turning adds or subtracts 1, so holding left and right together cancels out to 0 instead of fighting.

#### update — the chain from lesson 7, every frame

1. **Rotation.** `self.angle + self.turn * TURN_SPEED * dt`: turning speed is “per second”, so it's multiplied by `dt` too. Then we build the quaternion and apply it so the sprite visibly turns.
2. **Direction.** `vmath.rotate(rotation, FORWARD)` turns the forward arrow with the ship. Length 1, pointing out of the nose.
3. **Velocity and position.** Direction × speed = velocity. Velocity × dt = this frame's step. Position + step = new position.

![Figure 10 — Thrust alone flies straight. Thrust + turn: the angle grows, the forward arrow swings, and the path curves.](img/vectors/ship-path.svg#inline)

> [!TIP] **Why this works.** Notice what the code **doesn't** do: there's no “if facing up, add to Y; if facing left, subtract from X”. The rotated forward vector handles every possible angle with one line. That's the power of vectors.

**Try it**

1. Make the ship reverse slowly when `brake` is held. (Hint: `direction.unm()` flips an arrow — or multiply by a negative speed.)
2. Your artist redraws the ship facing up. Which single line must change?
3. Double the turning speed. What number do you change, and what does it mean in degrees per second?

> [!MORE] Answers
> 1. When `brake` is held, add `direction.unm().mul(MOVE_SPEED * 0.4)` (or `direction.mul(-100)`) × dt to the position.
> 2. `FORWARD = vmath.vector3(0, 1, 0)`.
> 3. Use `Math.PI * 2`: a full turn (360°) per second.

## 09 — Moving toward a target

> *“An enemy should chase the player. Which way should it move?”*

We know where the enemy is and where the player is — two positions. We want the **arrow from the enemy to the player**. The rule for getting an arrow between two places is short enough to memorise:

```text
arrow from A to B  =  B  −  A
```

**Destination minus start.** Why does that work? Think back to lesson 3: start + arrow = destination. Move the start to the other side and you get arrow = destination − start. Or, per axis: to get from X = 100 to X = 400 you have to go 300 to the right, and 400 − 100 = 300.

![Figure 11 — player − enemy = the arrow from enemy to player. Its length is the distance; normalized, it's the direction to walk.](img/vectors/enemy-player.svg#inline)

```ts
const position = go.get_position();
const targetPosition = go.get_position("/player");
const toTarget = targetPosition.sub(position);
```

- `go.get_position("/player")` reads *another* game object's position, addressed by its id.
- `toTarget` is an arrow all the way to the player. Its length is how far away the player is — too long to use as a direction directly.

So we normalize it — but first check its length isn't 0 (the enemy might be standing exactly on the player):

<!-- prelude: const toTarget = vmath.vector3(300, 200, 0); -->
```ts
const distance = vmath.length(toTarget);
if (distance > 0) {
    const direction = vmath.normalize(toTarget);
}
```

### A chasing enemy

Put it together in a script for an enemy game object. This one uses `properties` so you can tune the speed and choose the target in the Defold editor without touching code:

```ts title="enemy.ts"
import { defineScript } from "@defold-typescript/types";

export default defineScript({
  properties: {
    speed: 120,               // editable in the Defold editor
    target: hash("/player"),  // which game object to chase
  },

  update(self, dt) {
    const position = go.get_position();
    const targetPosition = go.get_position(self.target);

    const toTarget = targetPosition.sub(position);
    const distance = vmath.length(toTarget);

    if (distance > 1) {
      const direction = vmath.normalize(toTarget);
      const step = direction.mul(self.speed * dt);
      go.set_position(position.add(step));
    }
  },
});
```

- `properties` declares editor-tweakable values. They appear on `self` automatically: `self.speed` and `self.target`.
- We compare against `1` rather than 0: when the enemy is within a pixel it simply stops, instead of jittering back and forth over the target — and we never normalize a zero-length arrow.
- `direction.mul(self.speed * dt)` is velocity × dt in one go: direction × (speed × dt).

> [!NOTE] **Parented objects?** This works because the enemy and the player are both top-level objects. If either has a parent, compare `go.get_world_position()` values instead — lesson 11 shows the full fix.

> [!WARNING] Order matters! `targetPosition.sub(position)` points **toward** the target. `position.sub(targetPosition)` points **away** from it — perfect for a fleeing chicken, disastrous for a chasing zombie.

**Try it**

1. Make the enemy run away from the player instead.
2. Make it stop when it's within 50 pixels, instead of 1.
3. Rotate the enemy to face the player. (Hint: lesson 6 turns an angle into a rotation; `math.atan2(y, x)` turns an arrow into an angle.)

> [!MORE] Answers
> 1. Use `position.sub(targetPosition)` (or `direction.unm()`).
> 2. Change `distance > 1` to `distance > 50`.
> 3. `go.set_rotation(vmath.quat_rotation_z(math.atan2(toTarget.y, toTarget.x)))`.

## 10 — The dot product

> *“My guard faces right. Is the player in front of it — or sneaking up from behind?”*

We already know how to get the guard's forward direction (lesson 7) and the arrow to the player (lesson 9). What we need is a way to ask: **do these two arrows point roughly the same way?** That's what `vmath.dot` measures. It takes two vectors and gives back a **single number**.

![Figure 12 — With two length-1 arrows, the dot product runs from +1 (same way) through 0 (sideways) to −1 (opposite).](img/vectors/dot.svg#inline)

When both arrows have length 1, the number reads like a score of how much they agree:

| Dot product | The arrows… | For our guard |
| --- | --- | --- |
| **+1** | point the same way | player is dead ahead |
| **between 0 and +1** | roughly agree | player is somewhere in front |
| **0** | are at right angles (perpendicular) | player is exactly to the side |
| **between 0 and −1** | roughly disagree | player is somewhere behind |
| **−1** | point opposite ways | player is directly behind |

```ts
const forward = vmath.rotate(go.get_rotation(), vmath.vector3(1, 0, 0));
const toTarget = go.get_position("/player").sub(go.get_position());

if (vmath.length(toTarget) > 0) {
    const alignment = vmath.dot(forward, vmath.normalize(toTarget));
    if (alignment > 0) {
        print("in front of me");
    } else {
        print("behind me");
    }
}
```

- `forward` is the guard's facing direction — lesson 7's rotated forward vector.
- `toTarget` is lesson 9's “destination minus start”.
- We normalize `toTarget` so both arrows have length 1, which keeps the answer between −1 and +1.
- Positive means in front, negative means behind. That's the whole test.

> [!NOTE] **Shortcut.** If you only need **front or behind**, you could skip normalizing: `vmath.dot(forward, toTarget)` has the same sign either way. But the number is then scaled by the distance, so thresholds like “0.7” stop meaning anything. Normalizing keeps it readable.

### Bonus: a vision cone

Instead of “anywhere in front”, a guard usually sees a **cone**. Just raise the threshold: `alignment > 0.7` means within about 45° either side of straight ahead; `alignment > 0.9` is a narrow ~25° beam. No trigonometry required — pick a number, test it, adjust.

**Try it**

1. What threshold gives a cone of about 60° either side? (Hint: halfway between “ahead” and “beside”.)
2. A turret should only fire when the player is nearly straight ahead. Pick a threshold.

> [!MORE] Answers
> 1. 0.5 — halfway between +1 (ahead) and 0 (beside) is 60°.
> 2. Something like 0.95 or higher.

## 11 — Local vs world space

> *“My turret is attached to my spaceship, so it flies and turns with it. But where is its barrel in the world — so I can spawn bullets there?”*

In Defold, one game object can be the **child** of another: drag it onto another object in the collection outline, or call `go.set_parent`. A child follows its parent everywhere — when the parent moves, turns or scales, the child comes along. To make that work, the child's position is stored **relative to its parent**.

- **Local space** — positions measured from the **parent**, along the parent's own (possibly rotated) X and Y. Like “seat 3 on the bus”.
- **World space** — positions measured from the **world origin**, along the screen's X and Y. Like GPS coordinates.

When the bus drives off, your seat number doesn't change — but your GPS coordinates do. Same for the turret: its local position stays (80, 0) forever, while its world position changes every time the ship moves or turns.

![Figure 13 — The turret's local position is measured along the ship's own axes. Its world position is measured from the world origin.](img/vectors/local-world.svg#inline)

> [!TIP] **Wait — which space have we been using?** `go.get_position()` and `go.set_position()` have been **local** all along. Every object in lessons 1–10 was top-level (no parent), and for those, local space and world space are the same thing — so everything was correct. The moment you parent an object, its `go.get_position()` stops being comparable with other objects' positions.

### Reading world values

```ts
const local = go.get_position();         // relative to my parent
const world = go.get_world_position();   // relative to the world origin
```

| | Local (relative to parent) | World (relative to origin) |
| --- | --- | --- |
| Position | `go.get_position()`, `go.set_position(p)` | `go.get_world_position()` (read only) |
| Rotation | `go.get_rotation()`, `go.set_rotation(q)` | `go.get_world_rotation()` (read only) |
| Everything at once | — | `go.get_world_transform()` (a `Matrix4`) |

Notice there is **no** `go.set_world_position`. To put an object at a world position you convert it to local first — that's the second half of this lesson.

![Figure 14 — Local → world: multiply by the world transform. World → local: convert into the parent's space.](img/vectors/conversions.svg#inline)

### Local → world: the turret's muzzle

Setup: make a **turret** game object a child of the **player** ship, give it a factory component with id **bulletfactory** (whose prototype is a bullet object running `bullet.ts.script`), and bind `KEY_SPACE` to the action `fire`.

```ts title="turret.ts"
import { defineScript } from "@defold-typescript/types";

const FIRE = hash("fire");
const MUZZLE = vmath.vector3(20, 0, 0); // barrel tip, in the turret's OWN space

export default defineScript({
  init() {
    msg.post(".", "acquire_input_focus");
  },

  on_input(_self, action_id, action) {
    if (action_id === FIRE && action.pressed) {
      // LOCAL -> WORLD: run the muzzle point through our world transform
      const transform = go.get_world_transform();
      const p = transform.mul(vmath.vector4(MUZZLE.x, MUZZLE.y, MUZZLE.z, 1));
      const spawnPosition = vmath.vector3(p.x, p.y, p.z);

      // The bullet should face the way the turret faces IN THE WORLD
      const spawnRotation = go.get_world_rotation();

      factory.create("#bulletfactory", spawnPosition, spawnRotation);
    }
  },
});
```

- `MUZZLE` is the barrel tip in the turret's **own** space: 20 pixels along its X. It never changes, no matter how the ship moves.
- `go.get_world_transform()` returns a `Matrix4`: one value that knows the object's complete placement in the world — position, rotation and scale, including everything inherited from its parents. Like quaternions, **you don't need matrix mathematics**: treat it as a sealed box that converts local points to world points.
- A matrix only multiplies a `Vector4` (the types enforce this), so we add a fourth number, **1**. That 1 means “this is a **point**, so apply the movement too”. (A 0 would mean “this is a direction — rotate it, but don't move it”.)
- `factory.create` spawns a brand-new, **top-level** object. It has no parent, so its position and rotation are in world space — exactly what we just computed.

```ts title="bullet.ts"
import { defineScript } from "@defold-typescript/types";

const SPEED = 600;
const FORWARD = vmath.vector3(1, 0, 0);

export default defineScript({
  update(_self, dt) {
    // Spawned bullets have no parent, so local space IS world space here
    const direction = vmath.rotate(go.get_rotation(), FORWARD);
    go.set_position(go.get_position().add(direction.mul(SPEED * dt)));
  },
});
```

The bullet itself is top-level, so plain `go.get_position` and `go.get_rotation` are already world values. It's lesson 8's “fly where you face” in three lines.

### World → local: applying a world position

Now the opposite problem. An enemy rides on a moving platform (it's the platform's child) and chases the player. Lesson 9's code would subtract the enemy's *local* position from the player's position — two numbers measured from different places. The result points at nonsense.

> [!TIP] **The rule.** Do the math in world space, convert to local only at the very end. World space is the one place where every object's position can be compared.

```ts title="platform_enemy.ts"
import { defineScript } from "@defold-typescript/types";

// Apply a WORLD position to this object, whether or not it has a parent.
function setWorldPosition(worldPosition: Vector3): void {
  const parent = go.get_parent();
  if (parent === undefined) {
    go.set_position(worldPosition); // no parent: local = world
  } else {
    go.set_position(go.world_to_local_position(worldPosition, parent));
  }
}

export default defineScript({
  properties: {
    speed: 120,
    target: hash("/player"),
  },

  update(self, dt) {
    // Do all the math in WORLD space, where both objects can be compared
    const myWorld = go.get_world_position();
    const targetWorld = go.get_world_position(self.target);

    const toTarget = targetWorld.sub(myWorld);
    if (vmath.length(toTarget) > 1) {
      const step = vmath.normalize(toTarget).mul(self.speed * dt);
      setWorldPosition(myWorld.add(step)); // convert back only at the end
    }
  },
});
```

- `setWorldPosition` is the missing “set world position”. If the object has no parent, local = world, so we set it directly.
- Otherwise `go.world_to_local_position(worldPosition, parent)` converts the world point into the **parent's** space — which is exactly the space `go.set_position` expects for a child.
- The update is lesson 9 unchanged, except that both positions are read with `go.get_world_position`.

> [!WARNING] The world functions use the world transforms calculated at the **end of the previous frame**. Normally that one-frame delay is invisible. If you moved a parent earlier in the same frame and need exact numbers right now, call `go.update_world_transform(parent)` before converting.

### Directions and rotations

Directions only need rotating. To know which way a child faces in the world, rotate forward by its **world** rotation. To make a child face a world angle, undo the parent's rotation first — `vmath.conj` gives the opposite turn of a rotation:

```ts
const FORWARD = vmath.vector3(1, 0, 0);
const worldForward = vmath.rotate(go.get_world_rotation(), FORWARD);

// Face straight up in the world, even while a parent is turning
const wanted = vmath.quat_rotation_z(math.rad(90));
const parent = go.get_parent();
if (parent !== undefined) {
    const parentWorld = go.get_world_rotation(parent);
    go.set_rotation(vmath.conj(parentWorld).mul(wanted));
} else {
    go.set_rotation(wanted);
}
```

- `vmath.conj(parentWorld)` is “the parent's turn, backwards”. `.mul(wanted)` then adds the turn we want. The parent's rotation gets added back automatically when Defold draws the child, so it lands on exactly `wanted` in the world.
- Order matters with `mul` on rotations: undo the parent first, then apply the wanted rotation.

#### Re-parenting without a jump

When an object changes parent — the player steps onto a lift — its local numbers suddenly mean something new, and it would visibly jump. Pass `true` as the third argument to keep its world placement: `go.set_parent(undefined, platformId, true)` (the first argument `undefined` means “this object”).

**Try it**

1. A child sits at local (10, 0). Its parent is top-level at (100, 100), not rotated. What is the child's world position?
2. Same child, but the parent is rotated 90°. Now what?
3. Why do bullets from `factory.create` need a world position rather than a local one?
4. What goes wrong if the platform enemy uses `go.get_position()` for itself but `go.get_world_position()` for the player?

> [!MORE] Answers
> 1. (110, 100).
> 2. (100, 110) — the parent's X axis now points up, so “10 along X” means 10 up.
> 3. Spawned objects have no parent, so local and world are the same; a turret's local offset would place them near the world origin instead of at the barrel.
> 4. It subtracts two positions measured from different places, so it aims at a point offset by wherever the platform is.

## Final project — Asteroids-style movement

> *“I want classic space physics: thrust pushes the ship, it keeps drifting when I let go, and it slowly glides to a stop.”*

Lesson 8's ship stops dead the instant you release thrust, because thrust sets its movement directly. Real spaceships (and the arcade classic) work differently: **thrust changes the velocity, and the velocity changes the position**. That one extra link is called **acceleration**.

![Figure 15 — Facing and moving are different arrows. Thrust nudges the velocity toward the nose, frame by frame.](img/vectors/drift.svg#inline)

| | Lesson 8 ship | Asteroids ship |
| --- | --- | --- |
| Thrust does… | velocity = direction × speed | velocity += direction × acceleration × dt |
| Release thrust | stops instantly | keeps drifting |
| Turn while moving | path turns immediately | ship turns, but slides the old way until thrust corrects it |
| New ingredients | — | acceleration, friction, braking, max speed, screen wrap |

### The complete script

Use the same scene and input bindings as lesson 8 (including `brake` on the down arrow), and attach `src/asteroids_ship.ts.script` instead of the old ship script.

```ts title="asteroids_ship.ts"
import { defineScript } from "@defold-typescript/types";

// ---- Input action ids (must match input/game.input_binding) ----
const TURN_LEFT = hash("turn_left");
const TURN_RIGHT = hash("turn_right");
const THRUST = hash("thrust");
const BRAKE = hash("brake");

// ---- Tuning ----
const FORWARD = vmath.vector3(1, 0, 0); // sprite art faces right
const TURN_SPEED = math.rad(200);       // radians per second
const ACCELERATION = 400;               // pixels per second, per second
const MAX_SPEED = 450;                  // pixels per second
const FRICTION = 0.4;                   // how quickly we drift to a stop
const BRAKE_FRICTION = 3.0;             // much stronger when braking

export default defineScript({
  init() {
    msg.post(".", "acquire_input_focus");
    return {
      angle: 0,
      velocity: vmath.vector3(0, 0, 0),
      turn: 0,
      thrusting: false,
      braking: false,
      screenWidth: sys.get_config_int("display.width", 960),
      screenHeight: sys.get_config_int("display.height", 640),
    };
  },

  update(self, dt) {
    // 1. ROTATION
    self.angle = self.angle + self.turn * TURN_SPEED * dt;
    const rotation = vmath.quat_rotation_z(self.angle);
    go.set_rotation(rotation);

    // 2. DIRECTION (where the nose points)
    const direction = vmath.rotate(rotation, FORWARD);

    // 3. ACCELERATION changes VELOCITY
    if (self.thrusting) {
      const acceleration = direction.mul(ACCELERATION);
      self.velocity = self.velocity.add(acceleration.mul(dt));
    }

    // 4. FRICTION / BRAKING shrink VELOCITY
    const friction = self.braking ? BRAKE_FRICTION : FRICTION;
    const keep = Math.max(0, 1 - friction * dt);
    self.velocity = self.velocity.mul(keep);

    // 5. SPEED LIMIT
    const speed = vmath.length(self.velocity);
    if (speed > MAX_SPEED) {
      self.velocity = vmath.normalize(self.velocity).mul(MAX_SPEED);
    }

    // 6. VELOCITY changes POSITION
    const position = go.get_position().add(self.velocity.mul(dt));

    // 7. SCREEN WRAP
    if (position.x < 0) position.x = position.x + self.screenWidth;
    if (position.x > self.screenWidth) position.x = position.x - self.screenWidth;
    if (position.y < 0) position.y = position.y + self.screenHeight;
    if (position.y > self.screenHeight) position.y = position.y - self.screenHeight;

    go.set_position(position);
  },

  on_input(self, action_id, action) {
    if (action_id === TURN_LEFT) {
      if (action.pressed) self.turn = self.turn + 1;
      if (action.released) self.turn = self.turn - 1;
    } else if (action_id === TURN_RIGHT) {
      if (action.pressed) self.turn = self.turn - 1;
      if (action.released) self.turn = self.turn + 1;
    } else if (action_id === THRUST) {
      if (action.pressed) self.thrusting = true;
      if (action.released) self.thrusting = false;
    } else if (action_id === BRAKE) {
      if (action.pressed) self.braking = true;
      if (action.released) self.braking = false;
    }
  },
});
```

### The important sections

- **Tuning constants.** Everything is “per second”: `TURN_SPEED` (radians/s, via `math.rad(200)` = 200°/s), `ACCELERATION` (pixels/s gained each second), `MAX_SPEED`. Change these first when the ship “feels” wrong.
- **init.** Velocity now lives in `self`, because it must survive from one frame to the next — that's what makes drifting possible. We also read the window size from `game.project` with `sys.get_config_int` for screen wrapping.
- **1 · Rotation** and **2 · Direction** are unchanged from lesson 8.
- **3 · Acceleration.** Instead of replacing the velocity, we *add* a small push: direction × acceleration × dt. Ten frames of thrust add ten small pushes.
- **4 · Friction.** Every frame we keep slightly less than all of the velocity. With friction 0.4 and dt 1/60, we keep about 99.3% each frame — a slow glide. Braking uses a much bigger number. `Math.max(0, ...)` makes sure a giant dt can never flip the velocity backwards.
- **5 · Speed limit.** `vmath.length(self.velocity)` is the current speed. If it's too high, normalize (keeping the direction) and multiply by `MAX_SPEED`. It's safe to normalize here: the length is above `MAX_SPEED`, so it's definitely not zero.
- **6 · Position.** The same line as always: position + velocity × dt.
- **7 · Screen wrap.** Leave the right edge, appear at the left. We change the `x` and `y` numbers directly — each part of a vector is an ordinary number you can read and write.

> [!TIP] **What you just built.** Look at how few new ideas this needed. Position, direction, speed, velocity, dt and rotation are all doing exactly the job they did in earlier lessons. Acceleration is just “velocity's own velocity”: it changes velocity over time, the same way velocity changes position over time.

**Try it**

1. Spawn a thrust particle effect only while thrusting. Where in `update` would the check go?
2. Add a “hyperspace” key that teleports the ship to a random position (and keeps its velocity).
3. Fire bullets: spawn them at the ship's position, give them velocity = direction × 600 **plus** the ship's own velocity. Why add the ship's velocity?
4. Make an enemy that uses lesson 10's dot product to fire only when the player is in its cone.

> [!MORE] Answers
> 3. A bullet fired from a moving ship should also carry the ship's motion — otherwise a fast ship could overtake its own bullets.

## Cheat sheet

### The six ideas

| Idea | Question | In code |
| --- | --- | --- |
| **Position** | Where am I? | `go.get_position()` |
| **Direction** | Which way? Length 1. | `vmath.normalize(v)` |
| **Speed** | How fast? A number. | `vmath.length(velocity)` |
| **Velocity** | Which way + how fast? | `direction.mul(speed)` |
| **Rotation** | How am I oriented? | `vmath.quat_rotation_z(a)` |
| **dt** | How much time passed? Seconds. | `update(self, dt)` |

### API

| Task | Code |
| --- | --- |
| Create a vector | `vmath.vector3(x, y, z)` |
| Add / subtract | `a.add(b)`, `a.sub(b)` |
| Scale by a number | `v.mul(n)`, `v.div(n)` |
| Flip an arrow | `v.unm()` — not `-v` |
| Length / distance | `vmath.length(v)` |
| Make length 1 | `vmath.normalize(v)` — length above 0! |
| Agreement (−1…+1) | `vmath.dot(a, b)` |
| Degrees → radians | `deg * (Math.PI / 180)` or `math.rad(deg)` |
| Angle → rotation | `vmath.quat_rotation_z(angle)` |
| Rotate an arrow | `vmath.rotate(rotation, v)` |
| Read / write position | `go.get_position()`, `go.set_position(p)` |
| Read / write rotation | `go.get_rotation()`, `go.set_rotation(q)` |
| Another object | `go.get_position("/player")` |

### Patterns

| Pattern | Code |
| --- | --- |
| Move with velocity | `pos.add(velocity.mul(dt))` |
| Fly where you face | `vmath.rotate(rot, FORWARD).mul(speed)` |
| Arrow from A to B | `b.sub(a)` |
| Distance A to B | `vmath.length(b.sub(a))` |
| Chase | `vmath.normalize(b.sub(a)).mul(speed * dt)` |
| In front? | `vmath.dot(forward, dirToTarget) > 0` |
| Accelerate | `vel = vel.add(dir.mul(accel * dt))` |
| Friction | `vel = vel.mul(Math.max(0, 1 - f * dt))` |
| Speed limit | `vmath.normalize(vel).mul(MAX)` |
| Turn | `angle += turn * TURN_SPEED * dt` |

### Local ↔ world

`go.get_position`, `go.set_position`, `go.get_rotation` and `go.set_rotation` are **local** — relative to the parent.

| Task | Code |
| --- | --- |
| Where am I in the world? | `go.get_world_position()`, `go.get_world_rotation()` |
| Local point → world | `go.get_world_transform().mul(vmath.vector4(x, y, z, 1))` |
| Local direction → world | `vmath.rotate(go.get_world_rotation(), dir)` |
| Apply a world position | `go.set_position(go.world_to_local_position(p, parent))` |
| Apply a world rotation | `go.set_rotation(vmath.conj(parentWorldRot).mul(q))` |
| Change parent, no jump | `go.set_parent(undefined, parentId, true)` |
| Need this frame's values | `go.update_world_transform(id)` |

### Gotchas

- `v.normalize()` does not compile — write `vmath.normalize(v)`.
- `a + b` does not compile (TS2365) — write `a.add(b)`.
- `-v` is not a vector — write `v.unm()`.
- Anything “per second” gets multiplied by `dt`.
- Angles are radians; positive turns counter-clockwise.
- Compare `action_id` to `hash("...")`, not to a string.
- Set `FORWARD` to match your sprite art.
- There is no `go.set_world_position` — convert with `go.world_to_local_position`.
- Compare positions in **world** space when parents are involved.

### The chain

```text
rotation  →  vmath.rotate(rot, FORWARD)  →  × speed  →  × dt  →  + position
```
