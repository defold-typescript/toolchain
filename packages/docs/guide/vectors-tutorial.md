---
toc-title: Vectors & rotations
llms-full: false
---
# Vectors and rotations

Watch a spaceship glide across a [Defold](https://defold.com/) game. It turns, speeds up, drifts, and a little robot buddy follows it around.

It looks complicated, but underneath there are only a few simple questions:

- **Where is it?**
- **Which way is it pointing?**
- **How far should it move, and how much should it turn, before the next frame?**

## Start here

Most movement bugs come from mixing up **six ideas**. Here is the catch: in code, they fit into only **three kinds of value**. Programmers call them *types*. The computer can't tell a position from a velocity, so how do we keep from getting lost?

As you read the table, keep an eye on the “What it is in code” column and note which ideas share a type.

| Idea | The question it answers | What it is in code |
| --- | --- | --- |
| **Position** | “Where am I?” | `Vector3` (a place) |
| **Direction** | “Which way?” | `Vector3` of length one |
| **Speed** | “How fast?” | `number` (pixels per second) |
| **Velocity** | “Which way, and how fast?” | `Vector3` = **Direction** × **Speed** |
| **Rotation** | “How am I turned?” | `Quaternion` (from an angle) |
| **dt** (*delta time*) | “How much time passed?” | `number` (seconds) |

Did you spot them? Several ideas share a type, and **nothing in the type says which idea you're holding**. That's where good variable names come in handy: they keep us from mixing things up in our formulas.

There's more to see in the table. How do these ideas relate to each other? Some of them are made from the others:

- A **Rotation** gives a **Direction**: how the ship is turned tells you which way it points (see the note below).
- A **Direction** times a **Speed** makes a **Velocity**.
- A **Velocity** times **dt** makes this frame's **step**: how far the ship moves before the next frame.
- Each frame, adding the **step** to the **Position** puts the ship in its new place.
- Two **Positions** can give a **Direction** too: take the arrow from one to the other and make it length one.

> [!NOTE] A ship doesn't have to **move the way it points**. Wind can push a boat sideways, and a ship in space keeps drifting wherever it was already headed. So the direction it faces and the direction it moves can be two separate arrows.

### Your setup

You need a `defold-typescript` project. If you don't have one yet, [Getting started](./getting-started.md) walks through it.

## 1. Coordinates

> “I want to put my spaceship somewhere on the screen. How do I tell Defold where?”

Imagine the game sitting on a huge sheet of graph paper. How would you tell a friend where a dot is?

You'd say how far to walk to the right, then how far to walk up. Two numbers. We call them **X** and **Y**.

- **X** goes left and right. Bigger X is farther right.
- **Y** goes down and up. Bigger Y is farther *up*.
- The spot where X and Y are both zero is the **origin**. With Defold's default camera it is the bottom-left corner of the window.
- Negative numbers are fine. X = −50 is 50 pixels left of the origin. The spot is off-screen, but it is still a perfectly good place.

> [!NOTE] There is a third one too, **Z**, for depth. In a 2D game it only decides what is drawn in front of what (a bigger Z is closer to you). Our examples never need that, so we keep Z at 0.

With Z at 0, the origin is **(0, 0, 0)**, and every Defold position holds three numbers: `vmath.vector3(x, y, z)`.

![Figure 1. Every position is two distances from the origin: how far right (X) and how far up (Y).](img/vectors/coordinates.svg#inline)

Find the ship in Figure 1. Walk 100 along the bottom, then 200 up, and there it is.

> [!WARNING] In some engines and on web canvases, Y points *down*. Not in Defold: **+Y is up**, so a jump makes Y bigger.

### Setting a position in Defold

```ts
const position = vmath.vector3(100, 200, 0);
go.set_position(position);
```

- `vmath.vector3(x, y, z)` holds the three numbers together: 100 to the right, 200 up, and Z at 0.
- `go.set_position(position)` puts this script's game object there. Right away, no animation.
- Strictly speaking, a position is measured from the object's **parent**. Our objects have no parent until [Lesson 12](#12-local-vs-world-space), so for now they are measured from the origin.

We can also ask the question the other way around: where is it now?

```ts
const where = go.get_position();
print(where.x, where.y); // 100 200
```

> [!TIP] A **position** answers exactly one question: **“Where am I?”** It is a dot on the graph paper, nothing more.

**Try it**

1. Where on the screen is `vmath.vector3(0, 300, 0)`?
2. Which of these positions is off-screen with the default camera: `(50, 50, 0)`, `(-50, 100, 0)`, `(300, -10, 0)`?

> [!MORE] Answers
> 1. On the left edge, 300 pixels up.
> 2. (−50, 100, 0) is left of the screen and (300, −10, 0) is below it; (50, 50, 0) is visible.

## 2. What is a vector?

> “My ship is at (100, 200, 0). Every frame it should end up a little farther right. How do I describe ‘a little farther right’?”

A position is a place. But “a little farther right” is not a place. It is a *change*. How would you draw a change? With an arrow:

- the way the arrow points is its **direction**;
- its size is its **length** (a mathematician says *magnitude*).

That arrow has a name: a **vector**. It is stored just like a position, as X and Y (and a Z we still keep at 0). But now the numbers mean “how far to go”, not “where to be”.

![Figure 2. A position is a dot (a place). A vector is an arrow (a change) that can be drawn starting anywhere.](img/vectors/position-vs-vector.svg#inline)

On the right of Figure 2, the same arrow is drawn three times. Is that three vectors, or one? **One.** It starts in three different places, but it's the same change every time.

```ts
const movement = vmath.vector3(60, 20, 0); // 60 to the right, 20 up
```

Read it as “go 60 right and 20 up”. Notice what it doesn't say: where to start. The same arrow works for a ship, a coin, or a rock.

> [!WARNING] Defold uses the **same type**, `Vector3`, for positions *and* for arrows. TypeScript can't tell them apart, so the name has to: `shipPosition` and `moveDirection`. Good names prevent many mistakes.

### Three kinds of Vector3 you'll meet

| Meaning | Example | Read it as |
| --- | --- | --- |
| **Position** | `vmath.vector3(100, 200, 0)` | “the spot 100 right, 200 up” |
| **Direction** | `vmath.vector3(1, 0, 0)` | “pointing right” (length exactly one) |
| **Movement** (or **step**) | `vmath.vector3(10, 0, 0)` | “a step of 10 pixels to the right” |

**Try it**

1. Describe `vmath.vector3(0, -5, 0)` in words.
2. Describe `vmath.vector3(-3, 4, 0)`. Bonus: how long is that arrow? (Count squares on graph paper, or wait for [Lesson 4](#4-direction-speed-and-velocity).)

> [!MORE] Answers
> 1. “5 pixels down.”
> 2. “3 left and 4 up.” Its length is 5, the classic 3-4-5 triangle.

## 3. Vector addition

> “I have a position and a movement arrow. How do I actually move the ship?”

[Lesson 2](#2-what-is-a-vector) said a movement arrow means “go this far right and this far up”. So moving the ship is exactly that: start where the ship is, and go.

![Figure 3. position + movement = new position. Tail on the dot, tip is the answer.](img/vectors/addition.svg#inline)

In Figure 3 the ship starts at the blue dot, (100, 100, 0). The orange arrow says “go 150 right and 50 up”. Imagine placing its **tail** (where the arrow starts) right on the blue dot. Where does its **tip** (where it ends) land?

- Across: 100 + 150 = **250**.
- Up: 100 + 50 = **150**.

The tip lands at **(250, 150, 0)**, and so does the ship. X adds to X, Y adds to Y, and they never mix. That is all “adding a vector to a position” means.

The code does the same sum:

```ts
const position = vmath.vector3(100, 100, 0);
const movement = vmath.vector3(150, 50, 0);

const newPosition = position.add(movement); // (250, 150, 0)
go.set_position(newPosition);
```

- `position.add(movement)` makes a **new** vector: (100 + 150, 100 + 50, 0 + 0) = (250, 150, 0).
- `position` itself does not change. To keep the answer, store it, here in `newPosition`.
- `go.set_position(newPosition)` moves the ship to the new spot. As in [Lesson 1](#1-coordinates), it jumps there instantly.

> What if you did that every frame, with a tiny arrow each time? The jumps get so small that the ship seems to glide. Keep that in mind: [Lesson 5](#5-time-and-dt) builds on it.

#### Several moves in a row

Two arrows laid tip to tail make one longer trip. Adding them one after the other lands you in the same place as adding their sum.

#### Going backwards: subtraction

If adding walks along the arrow, subtracting walks back: `newPosition.sub(movement)` gives (100, 100, 0) again. Remember `sub`. In [Lesson 10](#10-following-the-player) it becomes one of the handiest tools in a game.

#### Why `add` and not `+`

TypeScript only lets `+`, `-` and `*` work on numbers, so `position + movement` doesn't compile. Vectors use [methods](./vector-math.md) instead:

| Math | TypeScript |
| --- | --- |
| a + b | `a.add(b)` |
| a − b | `a.sub(b)` |
| v × 2 | `v.mul(2)` |
| v ÷ 2 | `v.div(2)` |
| −v (flip the arrow) | `v.unm()` |

- **They cost nothing.** The toolchain turns them into Defold's own vector math.
- **They never change the original.** Each one hands you back a new vector, just as `add` did above.
- **Chaining is safe.** In `a.add(b).mul(0.5)` (the point halfway between `a` and `b`), the in-between result of `add` is used once and then thrown away.

[Lesson 4](#4-direction-speed-and-velocity) adds two more tools, and they work differently: they are functions in `vmath`, not methods on the vector.

> [!NOTE] `vmath` is a **namespace**: one name that keeps the functions for vectors and rotations together, the same way `go` keeps the ones for game objects. You've been using one of its functions since [Lesson 1](#1-coordinates): `vmath.vector3(x, y, z)` takes three numbers and hands back a vector.

**Try it**

1. What is `vmath.vector3(50, 50, 0).add(vmath.vector3(20, -10, 0))`?
2. A ship at (0, 0, 0) moves by (10, 0, 0) three times. Where is it?

> [!MORE] Answers
> 1. (70, 40, 0).
> 2. (30, 0, 0): three steps of 10 to the right.

## 4. Direction, speed and velocity

> “My ship should fly to the right at 200 pixels per second. How do I separate ‘which way’ from ‘how fast’?”

So far each movement arrow has been a fixed step, like (150, 50, 0). A game wants to choose which way to go and how fast as two separate things. Let's look at how one arrow holds both.

![Figure 4. Length is speed, pointing is direction. A velocity carries both.](img/vectors/direction-speed.svg#inline)

Look at the purple arrows on the left. They all point the same way, but they have different lengths, and a longer arrow stands for faster movement in that same direction.

Now the green arrows on the right. What changed? Not the length: that's the same for all of them. Only the way they point.

One arrow, then, is really two facts in one: **which way** and **how fast**. An arrow like that has a name: a **velocity**.

The good news is that games get much easier when we store these two things: the **Direction** as a vector and the **Speed** as a plain number. Then we make a **Velocity** out of them.

So, each one answers its own question:

- **Direction** answers *which way?* It's an arrow of length exactly **one**, like the green ones. It only points.
- **Speed** answers *how fast?* It's a plain number, like 200 pixels per second. It doesn't point anywhere.
- **Velocity** answers both: *which way, and how fast?* Those purple arrows are easy to make from the other two: **multiply the direction by the speed**. The result, the *product* of the two, is the direction stretched to the length of the speed.

Time to put that into TypeScript:

```ts
const speed = 200;                          // pixels per second
const direction = vmath.vector3(1, 0, 0);   // length one, pointing right
const velocity = direction.mul(speed);      // (200, 0, 0)
```

- `.mul(speed)` multiplies every part by the same number: (1 × 200, 0 × 200, 0 × 200). The arrow gets 200 times longer and keeps pointing the same way.
- `mul` takes a **number**. Try to multiply by anything else, even another vector, and TypeScript will complain.

> Can `mul` make an arrow shorter, too? Yes. Multiply by a number below one, like `0.5`, and the arrow keeps its direction at half the length. You'll need that sooner than you think.

### Why length one?

So that multiplying by the speed gives a velocity of exactly that speed. If the direction arrow secretly had a length of two, the ship would go twice as fast as you asked.

It's an easy mistake to make, and easy to miss. Say the player holds the right arrow key and the up arrow key together. Right is (1, 0, 0), up is (0, 1, 0), and adding them gives (1, 1, 0). That arrow points diagonally, but look how long it is:

![Figure 5. Left: pressing right + up gives an arrow of length 1.41, so diagonal movement is 41% faster. Right: the same direction, brought back to length one.](img/vectors/normalize.svg#inline)

How do we fix it? Keep the direction, and shrink (or stretch) the arrow until its length is exactly one. That's the green arrow on the right, ending on the circle of radius one.

> [!NOTE] This operation has a name. Mathematicians call it **normalizing**, and an arrow of length one is a **unit vector**.

Defold has two tools to help you do just that:

```ts
const input = vmath.vector3(1, 1, 0);        // right + up both held
print(vmath.length(input));                  // 1.414...
const direction = vmath.normalize(input);    // about (0.707, 0.707, 0)
print(vmath.length(direction));              // 1
```

- `vmath.length(v)` measures an arrow. For a velocity, the length *is* the speed.
- `vmath.normalize(v)` returns an arrow pointing the same way with length one: a unit vector.

> [!WARNING] An arrow of length **zero** points nowhere, so it can't be normalized. Check that the length is above zero first; [Lesson 10](#10-following-the-player) shows the pattern.

**Try it**

1. Direction `(0, 1, 0)`, speed 50. What's the velocity? Which way does the ship go?
2. Why is `vmath.vector3(3, 4, 0).mul(100)` a bad velocity if you wanted a speed of 100? What's its real speed?

> [!MORE] Answers
> 1. (0, 50, 0): straight up at 50 pixels per second.
> 2. That arrow has length 5, so times 100 gives length 500, five times too fast. Normalize first: `vmath.normalize(v).mul(100)`.

## 5. Time and dt

> “I want my ship to glide across the screen, a little every frame, at the same speed on every device. How do I do that?”

[Lesson 3](#3-vector-addition) already hinted at the answer: move the ship by a tiny arrow every frame. Let's try it.

A game draws the screen over and over. Each drawing is a **frame**, and before each one Defold calls your script's `update` function. So the natural first try is to add a small velocity there, say 5 pixels to the right, once per frame:

```ts title="first_try.ts"
import { defineScript } from "@defold-typescript/types";

const velocity = vmath.vector3(5, 0, 0); // 5 pixels to the right, every frame

export default defineScript({
  update(self, dt) {
    const position = go.get_position();
    go.set_position(position.add(velocity));
  },
});
```

- `defineScript({ ... })` describes a Defold script; the toolchain writes the setup code Defold expects.
- `update(self, dt)` runs every frame. Defold hands it two values, `self` and `dt`, which this script ignores for now.
- The body reads the position, adds the velocity, and writes it back.

On your computer, the ship glides along nicely. Then a friend tries your game and writes back:

> “On my fast gaming monitor, your ship zooms across the screen. Why?”

Here is the catch: **not every computer draws the same number of frames per second (FPS)**. A fast one might do 144, a slow phone 30, and either one changes from moment to moment.

![Figure 6. Without dt, speed depends on the frame rate. With dt, every machine covers 200 px in one second.](img/vectors/dt.svg#inline)

Look at the top of Figure 6: the same code runs for one second on two computers, and one ship travels twice as far as the other.

### What went wrong?

`position.add(velocity)` works out a new position for the ship, a whole velocity away, **every frame**. At 60 FPS that happens 60 times a second, at 30 FPS only 30. Same code, but now the computer decides how fast your ship goes.

### The fix: measure time

Remember the two values Defold hands `update`? The second one is **dt** (short for *delta time*, “the change in time”). It answers one question: **“How much time passed since the last update?”** It's in seconds, so at 60 FPS it's about 1/60, or 0.0167.

<!-- prelude: let position = vmath.vector3(0, 0, 0); const velocity = vmath.vector3(200, 0, 0); declare const dt: number; -->
```ts
position = position.add(velocity.mul(dt));
```

Now velocity means **pixels per second**, so the old 5 is far too small. Change it to `vmath.vector3(200, 0, 0)` to keep the ship moving quickly.

Multiplying the velocity by the slice of a second that just passed gives you the distance for *this frame*. Many small steps or a few big ones, it adds up to the same distance.

Back to Figure 6, the bottom half this time. The 60, 30 and 144 FPS rows take steps of very different sizes, yet **every row stops at 200 px**. Here is the same thing in numbers:

| Frame rate | dt (seconds) | Step per frame (200 × dt) | Distance after 1 s |
| --- | --- | --- | --- |
| 30 FPS | 0.0333 | 6.67 px | **200 px** |
| 60 FPS | 0.0167 | 3.33 px | **200 px** |
| 144 FPS | 0.0069 | 1.39 px | **200 px** |

### A complete script

Here is the whole idea as a real Defold script. Attach the compiled `dt_demo.ts.script` to a game object and it glides right at 200 pixels per second on every machine:

```ts title="dt_demo.ts"
import { defineScript } from "@defold-typescript/types";

const velocity = vmath.vector3(200, 0, 0); // 200 pixels to the right, every second

export default defineScript({
  update(self, dt) {
    const position = go.get_position();
    go.set_position(position.add(velocity.mul(dt)));
  },
});
```

Put it next to `first_try.ts`. **Only two things changed**: the velocity now counts pixels per second, and `update` multiplies it by `dt` before adding it.

Of the two values `update` receives, `self` is the script's own memory, which we won't need until [Lesson 8](#8-keys-to-a-smooth-turn). `dt` is the time since the last frame, and this time we use it.

> [!TIP] **Rule of thumb.** If something is measured “per second” (pixels per second, radians per second), multiply it by `dt` to get this frame's change.

**Try it**

1. Speed is 300 pixels per second and this frame's dt is 0.02. How far does the ship move this frame?
2. A game freezes for half a second, so one frame has dt = 0.5. How far does a ship going 200 pixels per second jump?

> [!MORE] Answers
> 1. 300 × 0.02 = 6 pixels.
> 2. 200 × 0.5 = 100 pixels in a single jump. Over time that's still correct, but big jumps can carry an object straight through a wall. That's a story for physics.

## 6. Rotation

> “My ship faces right. How do I turn it to face up?”

Up to now the ship has always faced right, the way it is drawn. To face up, it has to turn, and before Defold can turn it, we need a way to say how much.

### Angles first

An **angle** is just an amount of turning. There are two common ways to count it:

- **Degrees**: a full turn is 360°, a half turn 180°, a quarter turn 90°. This is the way people usually count.
- **Radians**: a full turn is about 6.283, a half turn about 3.14, a quarter turn about 1.57. That 3.14159… is π (“pi”), which TypeScript calls `Math.PI`.

Why do programs prefer radians? Mostly habit: almost every math library uses them, so game engines do too. You only need one fact to get around: **π radians is half a turn**. Half of π is a quarter turn, and 2π is all the way around.

![Figure 7. 0 points right. Positive angles turn counter-clockwise. Radians are just a different unit for the same turn.](img/vectors/rotation.svg#inline)

In Figure 7, 0 points right. The pink arc turns counter-clockwise from there (the positive way) and stops at 135°.

| Turn | Degrees | Radians | In TypeScript |
| --- | --- | --- | --- |
| none (facing right) | 0° | 0 | `0` |
| an eighth | 45° | ≈ 0.785 | `Math.PI / 4` |
| a quarter (facing up) | 90° | ≈ 1.571 | `Math.PI / 2` |
| a half (facing left) | 180° | ≈ 3.142 | `Math.PI` |
| a full turn | 360° | ≈ 6.283 | `Math.PI * 2` |

To convert, multiply degrees by π / 180, or let Lua's helper `math.rad` do it:

```ts
const angle = 90 * (Math.PI / 180);   // 90 degrees = 1.5708 radians
const same = math.rad(90);            // exactly the same number
```

> [!NOTE] [`math.rad`](/api/math#mathradx-number-number) turns degrees into radians, and [`math.deg`](/api/math#mathdegx-number-number) turns radians back into degrees.

### Rotating a game object

You might guess that turning a game object works like moving one: `go.set_position` takes a position, so `go.set_rotation` should take an angle. Not quite. It wants a whole turn in 3D, one that could tip the object around X, Y and Z at once.

Why not just an angle? Defold is a 3D engine underneath, so a rotation has to be able to describe any turn in space. That kind of value has its own type, the one from the [start-here table](#start-here): a **Quaternion**.

What's inside a quaternion doesn't matter here. Treat it as a sealed box: let a `vmath` function build it, then hand it to `go.set_rotation`.

A 2D game needs just one kind of turn: around the **Z axis**, the one that points straight out of your screen. Spinning around it turns the object flat on the screen, and `vmath.quat_rotation_z` builds exactly that turn from an angle:

```ts
const angle = math.rad(90);
const rotation = vmath.quat_rotation_z(angle);
go.set_rotation(rotation);
```

- `vmath.quat_rotation_z(angle)` builds a turn of `angle` radians around Z.
- `go.set_rotation(rotation)` applies it. A quarter turn, so our right-facing ship now faces up.
- `go.get_rotation()` reads the current rotation back.

**Try it**

1. What's 180° in radians? And 45°?
2. Which way does a right-facing ship point after `vmath.quat_rotation_z(-Math.PI / 2)`?

> [!MORE] Answers
> 1. π ≈ 3.14 and π/4 ≈ 0.785.
> 2. Down. A negative angle turns clockwise, and a quarter turn clockwise from right is down.

## 7. Direction from rotation

> “If I keep track of my ship's angle, how can I make a vector that faces the same way, so I can fly in that direction?”

We know that to move the ship, we take its current **position** (a vector) and add the **velocity** (also a vector) multiplied by `dt`. The velocity, in turn, is easy to make from a **direction** and a **speed**.

We already have the position and the speed. What's missing is the **direction**, as a vector of **length one**, so the velocity comes out at exactly our speed.

Here's the plan. First, make a **unit vector** that points the way the ship faces with no rotation at all: (1, 0, 0), to the right, since angle 0 points right. Then **rotate it by exactly the same angle as the ship**. Look at Figure 8:

![Figure 8. The same forward arrow, rotated by the ship's rotation. It always points out of the nose.](img/vectors/rotated-forward.svg#inline)

Remember from [Lesson 2](#2-what-is-a-vector) that a vector can be drawn anywhere? Here its tail sits at the ship's center, so you can see what the turn does to it: the faded gray arrow points right before any turning, the pink arc is the ship's rotation, and the green arrow is that same vector turned by the same arc (at 0° it covers the gray one).

As the ship turns, does the green arrow get longer or shorter? Neither: its tip always lands on the same circle, because turning never changes an arrow's length. So the direction comes out exactly as we wanted: **it turns with the ship, and it keeps length one, with no normalizing needed.** Isn't that nice?

Defold has one function for exactly that turn, `vmath.rotate`. Here it is as pure math, with no game object involved:

```ts
const angle = math.rad(90);
const rotation = vmath.quat_rotation_z(angle);
const forward = vmath.vector3(1, 0, 0); // the way the ship faces with no rotation
const direction = vmath.rotate(rotation, forward); // (0, 1, 0): up
```

- The first two lines are [Lesson 6](#6-rotation)'s: a quarter turn around Z.
- `vmath.rotate(rotation, forward)` returns a **new** vector: `forward`, turned by `rotation`. A quarter turn takes right to up.

> [!TIP] If the rotation is already applied to the game object, it can be read back: `vmath.rotate(go.get_rotation(), forward)` gives the same direction.

Notice that nothing has moved yet. We have only **prepared** the direction: for a ship turned 135°, it is about (−0.71, 0.71, 0), up and to the left. Now it can do its job in the movement we already know:

<!-- prelude: const direction = vmath.vector3(-0.71, 0.71, 0); const speed = 200; declare const dt: number; -->
```ts
const velocity = direction.mul(speed);
go.set_position(go.get_position().add(velocity.mul(dt)));
```

### The chain that makes ships fly

Remember how the ideas linked up back in [Start here](#start-here)? At the time, that list was only a promise. Now look: every link in it is a line of code you've already written.

![Figure 9. rotation → rotated forward vector → movement direction → velocity → position.](img/vectors/pipeline.svg#inline)

Follow Figure 9 box by box:

1. **Rotation.** Make it from your angle with `vmath.quat_rotation_z`, and turn the game object with it using `go.set_rotation`.
2. **Direction.** Turn the `forward` vector of length one by that rotation with `vmath.rotate`. Turning keeps the length, so the result is a ready direction.
3. **Velocity.** Multiply the direction by the speed.
4. **Step.** Multiply the velocity by `dt`.
5. **Position.** Add the step to the current position.

This chain takes one thing for granted, the one from the note in [Start here](#start-here): the ship **moves the way it faces**. [Lesson 14](#14-acceleration) meets a ship that doesn't.

### What if your sprite faces another way?

We drew our ship facing right on purpose. Angle 0 points right, so **a sprite drawn facing right already matches `forward`**, (1, 0, 0), and needs no fixing.

If your art faces another way, fix the sprite's facing **once, in the editor**: select the sprite component under the game object in the Outline and set its Rotation (Z = −90 for art drawn facing up).

That turn belongs to the sprite, not to the game object your script rotates, so your code never needs to know about it.

**Try it**

1. The ship is turned 180°, and forward is `(1, 0, 0)`. Which way does `vmath.rotate(rotation, forward)` point?
2. The sprite faces up, so forward is `(0, 1, 0)`. The ship is turned 90°. Which way does it fly?
3. Forward is `(1, 0, 0)`. Which rotation makes it point straight down?

> [!MORE] Answers
> 1. (−1, 0, 0): left, straight out of the nose.
> 2. Left. A quarter turn counter-clockwise takes “up” to “left”.
> 3. −90°: a quarter turn clockwise (or 270°, the same turn the long way around). In code, `vmath.quat_rotation_z(-Math.PI / 2)`.

## 8. Keys to a smooth turn

We're almost ready to put the spaceship's movement together, but one thing is left: the keyboard. A key is either held or not, yet a ship should turn smoothly. So how do we turn a press of the left or right arrow key into a slow change, one that doesn't depend on the FPS?

[Lesson 6](#6-rotation) showed the quickest way to face up: build a rotation from 90° and set it. Try that when a key is pressed and the ship **snaps**. One frame it faces right, the next it faces up. Fine for a teleport. Strange for a spaceship.

A real ship turns **a little every frame**. And the angle is the only thing we have to change slowly: [Lesson 7](#7-direction-from-rotation)'s chain does the rest, so the direction, and with it the path, turn slowly too.

How much is a little? That's the question [Lesson 5](#5-time-and-dt) answered for movement, and the answer is the same here.

Give turning a speed, measured in radians per second:

```ts
const TURN_SPEED = math.rad(180); // that's Math.PI, half a turn per second
```

Then, every frame, grow the angle by that speed times `dt`, and rebuild the rotation from the angle:

<!-- prelude: let angle = 0; declare const dt: number; const TURN_SPEED = Math.PI; -->
```ts
angle = angle + TURN_SPEED * dt;
go.set_rotation(vmath.quat_rotation_z(angle));
```

- `TURN_SPEED * dt` is **this frame's slice** of the turn. At 60 FPS that's about 3°. At 30 FPS the frames are twice as long, so it's about 6°. Either way, after one second the ship has turned half a circle.
- The angle stays a **plain number**. A number is easy to add to, compare and print, so we keep it and rebuild the quaternion from it every frame.

> [!TIP] Notice anything familiar? Movement adds velocity × dt to a position. Turning adds turn speed × dt to an angle. It's **the same trick from [Lesson 5](#5-time-and-dt)**, just aimed at an angle this time.

### Where does the angle live?

Look back at `angle = angle + TURN_SPEED * dt`. For it to work, `angle` has to remember last frame's value. So where do we keep it?

The first idea is a variable at the top of the file, next to `TURN_SPEED`. It works for one ship. But Defold loads a script file once, and every game object running it shares that file's top-level variables. Put two ships in the game and they share one angle: turn one, and both turn.

What we need is memory that belongs to **each game object**. That's `self`, the value [Lesson 5](#5-time-and-dt) said we didn't need yet. Now we do:

```ts title="spin.ts"
import { defineScript } from "@defold-typescript/types";

const TURN_SPEED = math.rad(180); // half a turn per second

export default defineScript({
  init() {
    return { angle: 0 };
  },

  update(self, dt) {
    self.angle = self.angle + TURN_SPEED * dt;
    go.set_rotation(vmath.quat_rotation_z(self.angle));
  },
});
```

- `init()` runs once, when the game object is created. Whatever it **returns** becomes that object's own memory, `self`.
- Defold hands the same `self` to every `update`, so `self.angle` still holds last frame's value. Every ship running this script gets its own.
- `TURN_SPEED` stays at the top of the file: it never changes, so sharing it is exactly right.

This ship just spins at a steady pace. [Where script state lives](./script-state.md#sharing-state-across-instances-of-one-script) has the full story on shared and per-object state.

What about turning the other way? You could subtract. Or keep one line and multiply by a **turn** value: +1 turns left, −1 turns right, 0 doesn't turn at all:

<!-- prelude: declare const self: { angle: number }; declare const dt: number; declare const turn: number; const TURN_SPEED = Math.PI; -->
```ts
self.angle = self.angle + turn * TURN_SPEED * dt;
```

Where does `turn` come from? From the keys. Keep one true-or-false value per key in `self`, `self.left` and `self.right`: true while the key is held, false otherwise. They live in `self` for the same reason the angle does: a key pressed in one frame is still held in the next. Then work `turn` out from them every frame:

<!-- prelude: declare const self: { left: boolean; right: boolean }; -->
```ts
const turn = (self.left ? 1 : 0) - (self.right ? 1 : 0);
```

`self.left ? 1 : 0` reads “1 if `self.left` is true, otherwise 0”. So:

| Keys held | `turn` | The ship |
| --- | --- | --- |
| left | 1 − 0 = **1** | turns left |
| right | 0 − 1 = **−1** | turns right |
| both | 1 − 1 = **0** | doesn't turn |
| neither | 0 − 0 = **0** | doesn't turn |

The two keys never have to argue about who wins.

> [!NOTE] That's one choice, not the only one: you might prefer that the last key pressed wins. For that, also remember in `self` which key went down last, and when both are held, let that one decide `turn`.

That's all the keyboard has to do. [Lesson 9](#9-build-a-spaceship) wires it up, together with everything else.

**Try it**

1. With `TURN_SPEED = math.rad(180)`, how long does a full circle take?
2. You want a heavy ship that takes 4 seconds for a full circle. What should `TURN_SPEED` be?
3. Why does the ship turn at the same pace at 30 FPS and at 144 FPS?
4. Two ships run a script that keeps `let angle = 0` at the top of the file. What happens when one of them turns?

> [!MORE] Answers
> 1. Two seconds. That's 180° per second, and a full circle is 360°.
> 2. `math.rad(90)`. A full circle is 360°, spread over 4 seconds.
> 3. Each frame turns by `TURN_SPEED * dt`. Fewer frames means a bigger `dt`, so every second adds up to the same turn.
> 4. Both turn together, because they share the one `angle`. Keep it in `self`, and each ship turns on its own.

## 9. Build a spaceship

> “The player should turn left and right, and fly forward wherever the ship is pointing.”

Everything is ready. [Lesson 8](#8-keys-to-a-smooth-turn) turns the ship slowly, and [Lesson 7](#7-direction-from-rotation) flies it where it faces. The only new part is listening to the keys, and that part isn't about vectors, so we'll simply show it.

![Figure 10. Thrust alone flies straight. Thrust + turn: the angle grows, the forward arrow swings, and the path curves.](img/vectors/ship-path.svg#inline)

Why does the second path curve, when the ship only ever flies forward? Because forward itself keeps turning.

### The input bindings

Open `input/game.input_binding` in the Defold editor and add these **Key Triggers**. Your code checks the action names, not the keys:

| Key | Action name | Used for |
| --- | --- | --- |
| Left | `turn_left` | turn counter-clockwise |
| Right | `turn_right` | turn clockwise |
| Up | `thrust` | fly forward |
| Down | `brake` | slow down or back up (Try it, final project) |

The `.input_binding` file itself stores these keys as `KEY_LEFT`, `KEY_RIGHT` and so on, in case you open it as text.

### The scene

In `main/main.collection`, add a game object with id **player**, give it a ship sprite **facing right**, and add the compiled `src/ship.ts.script` as a component. Put it near the middle of the screen.

### The script

```ts title="ship.ts"
import { defineScript } from "@defold-typescript/types";

const TURN_LEFT = hash("turn_left");
const TURN_RIGHT = hash("turn_right");
const THRUST = hash("thrust");

const TURN_SPEED = math.rad(180); // half a turn per second
const MOVE_SPEED = 250;           // pixels per second
const FORWARD = vmath.vector3(1, 0, 0); // the sprite faces right

export default defineScript({
  init() {
    msg.post(".", "acquire_input_focus");
    return {
      angle: 0,          // current heading in radians
      left: false,       // is the left key held?
      right: false,      // is the right key held?
      thrusting: false,
    };
  },

  update(self, dt) {
    // 1. ROTATION: change the angle, build a rotation from it
    const turn = (self.left ? 1 : 0) - (self.right ? 1 : 0);
    self.angle = self.angle + turn * TURN_SPEED * dt;
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
      if (action.pressed) self.left = true;
      if (action.released) self.left = false;
    } else if (action_id === TURN_RIGHT) {
      if (action.pressed) self.right = true;
      if (action.released) self.right = false;
    } else if (action_id === THRUST) {
      if (action.pressed) self.thrusting = true;
      if (action.released) self.thrusting = false;
    }
  },
});
```

### Line by line

#### The top of the file

- `hash("turn_left")`: Defold names input actions by **hash**, not by string. We hash each name once and compare against it later. Comparing `action_id` to a plain string would never match.
- `TURN_SPEED = math.rad(180)`: the turning speed from [Lesson 8](#8-keys-to-a-smooth-turn), half a turn per second.
- `MOVE_SPEED = 250`: **pixels per second**, the speed from [Lesson 4](#4-direction-speed-and-velocity).
- `FORWARD`: the unturned forward arrow from [Lesson 7](#7-direction-from-rotation). (1, 0, 0), because the sprite faces right.

#### init: runs once

- `msg.post(".", "acquire_input_focus")` tells Defold to send keyboard input to this object. Without it, `on_input` is never called.
- The returned object is the ship's own memory, `self`, as in [Lesson 8](#8-keys-to-a-smooth-turn). Ours holds the current `angle` in radians, whether each turn key is held (`left`, `right`), and whether we're `thrusting`.

#### on_input: reacts to keys

- Defold calls `on_input` with `action.pressed` when a key goes down and `action.released` when it comes up. We just remember what's held.
- Each key only switches its own value on or off, the same way for turning and for thrust.

#### update: the chain from Lesson 7, every frame

1. **Rotation.** [Lesson 8](#8-keys-to-a-smooth-turn)'s slow turn: work out `turn` from the two keys, grow `self.angle` by `turn * TURN_SPEED * dt`, build the quaternion, apply it.
2. **Direction.** `vmath.rotate(rotation, FORWARD)` turns the forward arrow with the ship. Length one, pointing out of the nose.
3. **Velocity and position.** Direction × speed is the velocity. Velocity × dt is this frame's step. Position + step is the new position.

> [!TIP] **Notice what isn't there.** No “if facing up, add to Y; if facing left, subtract from X”. **One rotated arrow handles every possible angle.** Look at that.

**Try it**

1. Make the ship back up slowly while `brake` is held. (Hint: wire up `brake` the same way as `thrust`, then use `direction.unm()`, which flips an arrow.)
2. Your artist redraws the ship facing up. Which single line must change?
3. Double the turning speed. What number do you change, and what does it mean in degrees per second?

> [!MORE] Answers
> 1. Four small additions, each copying what `thrust` already does: `const BRAKE = hash("brake")` at the top, `braking: false` in `init`, a `BRAKE` branch in `on_input` that sets `self.braking`, and in `update`, while `self.braking` is true, add `direction.unm().mul(MOVE_SPEED * 0.4).mul(dt)` to the position.
> 2. `FORWARD = vmath.vector3(0, 1, 0)`. Or change no code at all: fix the sprite's facing once in the editor, as [Lesson 7](#7-direction-from-rotation) shows.
> 3. Change the 180 in `math.rad(180)` to 360. That's 360° per second: a full turn every second.

## 10. Following the player

> “A little robot buddy should follow the player's ship around. Which way should it move?”

How would you do it? You might reach for a pile of ifs: if the player is to the right, move right; if the player is above, move up. That works for four directions and gets messy for everything in between.

There's a neater way. We know where the buddy is and where the player is: two positions. What we want is the **arrow from the buddy to the player**, and the rule fits in one line:

```text
arrow from A to B  =  B  −  A
```

**Destination minus start.** Why? [Lesson 3](#3-vector-addition) said start + arrow = destination. Move the start to the other side and you get arrow = destination − start. Or check one axis: from X = 100 to X = 400 you walk 300 to the right, and 400 − 100 is 300.

![Figure 11. player − buddy = the arrow from the buddy to the player. Its length is the distance; normalized, it's the direction to walk.](img/vectors/buddy-player.svg#inline)

Check it against Figure 11: 400 − 100 = 300 and 300 − 100 = 200, so the orange arrow is (300, 200, 0).

```ts
const position = go.get_position();
const targetPosition = go.get_position("/player");
const toTarget = targetPosition.sub(position);
```

- `go.get_position("/player")` reads *another* game object's position, found by its id.
- `toTarget` reaches all the way to the player. Its length is how far away the player is, too long to use as a direction.

So we normalize it. But first, check the length isn't zero; the buddy might be sitting right on top of the player:

<!-- prelude: const toTarget = vmath.vector3(300, 200, 0); -->
```ts
const distance = vmath.length(toTarget);
if (distance > 0) {
  const direction = vmath.normalize(toTarget);
}
```

### A buddy that follows

Put it together in a script for the buddy's game object. It uses `properties`, so you can tune the speed and pick who to follow in the Defold editor without touching code:

```ts title="follower.ts"
import { defineScript } from "@defold-typescript/types";

export default defineScript({
  properties: {
    speed: 120,               // editable in the Defold editor
    target: hash("/player"),  // which game object to follow
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

- `properties` declares values you can edit in the editor. They show up on `self`: `self.speed` and `self.target`.
- We compare against `1`, not 0. Within a pixel the buddy simply stops instead of wobbling back and forth over the player, and we never normalize a zero-length arrow.
- `direction.mul(self.speed * dt)` is velocity × dt in one go: direction × (speed × dt).

> [!NOTE] **What about parents?** This works because the buddy and the player are both top-level objects. If either has a parent, compare `go.get_world_position()` values instead. [Lesson 12](#12-local-vs-world-space) shows why.

> [!WARNING] Order matters. `targetPosition.sub(position)` points **toward** the player. `position.sub(targetPosition)` points **away**: perfect for a shy cat, not so good for a loyal buddy.

**Try it**

1. Make the buddy shy: have it move away from the player instead.
2. Make it stop when it's within 50 pixels, instead of 1.
3. Turn the buddy to face the player. (Hint: [Lesson 6](#6-rotation) turns an angle into a rotation, and `math.atan2(y, x)` turns an arrow into an angle.)

> [!MORE] Answers
> 1. Use `position.sub(targetPosition)` (or `direction.unm()`).
> 2. Change `distance > 1` to `distance > 50`.
> 3. `go.set_rotation(vmath.quat_rotation_z(math.atan2(toTarget.y, toTarget.x)))`.

## 11. The dot product

> “My robot faces right. Is the player's ship in front of it, where the robot can see it, or behind its back?”

We already know how to get the robot's forward direction ([Lesson 7](#7-direction-from-rotation)) and the arrow to the player ([Lesson 10](#10-following-the-player)). What we need is a way to ask: **do these two arrows point roughly the same way?** That's what `vmath.dot` measures. Give it two vectors and it gives back **one number**.

![Figure 12. With two arrows of length one, the dot product runs from +1 (same way) through 0 (sideways) to −1 (opposite).](img/vectors/dot.svg#inline)

Walk around the circle in Figure 12, starting straight ahead of the robot. What happens to the number? It starts at +1, drops to 0 when the ship is straight up, and reaches −1 right behind.

So when both arrows have length one, the number is a score for how much they agree:

| Dot product | The arrows… | For our robot |
| --- | --- | --- |
| **+1** | point the same way | the ship is straight ahead |
| **between 0 and +1** | roughly agree | the ship is somewhere in front |
| **0** | are at right angles | the ship is exactly to the side |
| **between 0 and −1** | roughly disagree | the ship is somewhere behind |
| **−1** | point opposite ways | the ship is directly behind |

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

- `forward` is the way the robot faces, [Lesson 7](#7-direction-from-rotation)'s rotated forward arrow.
- `toTarget` is [Lesson 10](#10-following-the-player)'s “destination minus start”.
- We normalize `toTarget` so both arrows have length one, which keeps the answer between −1 and +1.
- **Positive means in front, negative means behind.** That's the whole test.

> [!NOTE] **A shortcut, and its catch.** If you only need front or behind, you can skip normalizing: `vmath.dot(forward, toTarget)` has the same sign either way. But then the number grows with the distance, so the view-cone numbers below would stop meaning anything. Normalizing keeps it readable.

### Bonus: a view cone

A robot doesn't really see everything in front of it. It sees a **cone**. To narrow the view, raise the threshold:

- `alignment > 0.7` is about 45° either side of straight ahead.
- `alignment > 0.9` is a narrow beam of about 25°.

No trigonometry needed. Pick a number, try it, adjust.

**Try it**

1. What threshold gives a cone of about 60° either side? (Hint: try the number halfway between the one for “ahead” and the one for “beside”.)
2. A camera robot should only take a photo when the ship is nearly straight ahead. Pick a threshold.

> [!MORE] Answers
> 1. 0.5, halfway between +1 and 0. Notice it isn't 45°, the halfway angle: the number doesn't change evenly as the angle grows, which is why 0.7 already meant 45°.
> 2. Something like 0.95 or higher.

## 12. Local vs world space

> “I attached a robotic arm to my ship. It flies along nicely, but `go.get_position()` on the arm always says (80, 0, 0), wherever the ship goes. Why?”

So far every object has stood on its own: the ship, the buddy, the robot. Now the ship carries something, and that changes what a position means.

In Defold, one game object can be the **child** of another: drag it onto another object in the collection outline, or call `go.set_parent`. When the parent moves, turns or scales, the child comes along.

How does Defold make that work? It stores the child's position **relative to its parent**. That gives every child two ways to say where it is:

- **Local space**: measured from the **parent**, along the parent's own (maybe turned) X and Y. Like “seat 3 on the bus”.
- **World space**: measured from the **world origin**, along the screen's X and Y. Like GPS coordinates.

When the bus drives off, your seat number doesn't change, but your GPS coordinates do. The arm is the same: its local position stays (80, 0, 0) forever, while its world position changes every time the ship moves or turns.

![Figure 13. The arm's local position is measured along the ship's own axes. Its world position is measured from the world origin.](img/vectors/local-world.svg#inline)

In Figure 13, the arm has two addresses. Measured along the ship's pink axes, it is (80, 0, 0). Measured from the world origin in the corner, it is about (319, 190, 0).

> [!TIP] **So which space have we been using?** `go.get_position()` and `go.set_position()` were **local** all along. Every object in Lessons 1 to 11 had no parent, and then local and world are the same thing, so nothing was wrong. Give an object a parent, though, and its `go.get_position()` no longer compares with other objects' positions.

### Reading world values

```ts
const local = go.get_position();         // relative to my parent
const world = go.get_world_position();   // relative to the world origin
```

| | Local (relative to parent) | World (relative to origin) |
| --- | --- | --- |
| Position | `go.get_position()`, `go.set_position(p)` | `go.get_world_position()` (read only) |
| Rotation | `go.get_rotation()`, `go.set_rotation(q)` | `go.get_world_rotation()` (read only) |
| Everything at once | none | `go.get_world_transform()` (a `Matrix4`) |

Notice there is **no** `go.set_world_position`. To put a child at a world position, you convert it to local first. That's [Lesson 13](#13-moving-between-spaces).

**Try it**

1. A child sits at local (10, 0, 0). Its parent is top-level at (100, 100, 0), not turned. What is the child's world position?
2. Same child, but the parent is turned 90°. Now what?

> [!MORE] Answers
> 1. (110, 100, 0).
> 2. (100, 110, 0). The parent's X axis now points up, so “10 along X” means 10 up.

## 13. Moving between spaces

> “Where is the arm's hand in the world, so I can toss a snowball from there?”

[Lesson 12](#12-local-vs-world-space) gave every child two addresses, local and world. We know where the hand is on the arm: its **local** position. A new snowball needs a **world** position. The missing piece is a way to convert between the two.

![Figure 14. Local → world: multiply by the world transform. World → local: convert into the parent's space.](img/vectors/conversions.svg#inline)

Figure 14 is the map for this lesson. The orange arrow takes a point from local to world; the green arrow brings it back.

### Local → world: the arm's hand

Setup: make an **arm** game object a child of the **player** ship. Give it a factory component with id **snowballfactory**, whose prototype is a snowball object running `snowball.ts.script`. Then bind the Space key to the action `toss`.

```ts title="launcher.ts"
import { defineScript } from "@defold-typescript/types";

const TOSS = hash("toss");
const HAND = vmath.vector3(20, 0, 0); // the hand, in the arm's OWN space

export default defineScript({
  init() {
    msg.post(".", "acquire_input_focus");
  },

  on_input(self, action_id, action) {
    if (action_id === TOSS && action.pressed) {
      // LOCAL -> WORLD: run the hand point through our world transform
      const transform = go.get_world_transform();
      const p = transform.mul(vmath.vector4(HAND.x, HAND.y, HAND.z, 1));
      const spawnPosition = vmath.vector3(p.x, p.y, p.z);

      // The snowball should fly the way the arm faces IN THE WORLD
      const spawnRotation = go.get_world_rotation();

      factory.create("#snowballfactory", spawnPosition, spawnRotation);
    }
  },
});
```

- `HAND` is the tip of the arm in the arm's **own** space: 20 pixels along its X. It never changes, however the ship moves.
- `go.get_world_transform()` returns a `Matrix4`, one value that knows exactly where the object sits in the world: position, rotation and scale, including everything inherited from its parents. Like a quaternion, **you don't need to look inside**. Treat it as a box that turns local points into world points.
- A matrix only multiplies a `Vector4` (the types insist), so we add a fourth number, **1**. That 1 says “this is a **point**, so move it too”. A 0 would say “this is a direction: turn and scale it, but don't move it”.
- `factory.create` makes a brand-new, **top-level** object. It has no parent, so its position and rotation are world values, exactly what we just worked out.

```ts title="snowball.ts"
import { defineScript } from "@defold-typescript/types";

const SPEED = 300;
const FORWARD = vmath.vector3(1, 0, 0);

export default defineScript({
  update(self, dt) {
    // A new snowball has no parent, so local space IS world space here
    const direction = vmath.rotate(go.get_rotation(), FORWARD);
    go.set_position(go.get_position().add(direction.mul(SPEED * dt)));
  },
});
```

The snowball is top-level, so plain `go.get_position` and `go.get_rotation` already give world values. It's [Lesson 9](#9-build-a-spaceship)'s “fly where you face” in three lines.

### World → local: placing a child at a world position

Now the other direction. Say the buddy rides on a moving platform (it's the platform's child) and follows the player. Can it reuse [Lesson 10](#10-following-the-player)'s code as it is? Not quite. That code would subtract the buddy's *local* position from the player's position: two numbers measured from different places, so the arrow would point at nonsense.

> [!TIP] **The rule.** Do the math in world space, and convert to local only at the very end. World space is the one place where every object's position can be compared.

```ts title="platform_follower.ts"
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

- `setWorldPosition` is the missing “set world position”. With no parent, local is world, so we set it directly.
- Otherwise `go.world_to_local_position(worldPosition, parent)` converts the world point into the **parent's** space, which is exactly what `go.set_position` expects for a child.
- The update is [Lesson 10](#10-following-the-player) unchanged, except both positions come from `go.get_world_position`.

> [!WARNING] The world functions use the world transforms from the **end of the previous frame**. Usually that one-frame delay is invisible. If you moved a parent earlier in the same frame and need exact numbers now, call `go.update_world_transform(parent)` before converting.

### Directions and rotations

A direction has no place, only a heading, so it only needs turning. To see which way a child faces in the world, rotate forward by its **world** rotation.

Going the other way takes a little more. To make a child face a world angle, first undo the parent's turn; `vmath.conj` gives that opposite turn:

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

- `vmath.conj(parentWorld)` is the parent's turn, backwards. `.mul(wanted)` then adds the turn we want. Defold adds the parent's turn back when it draws the child, so the child lands on exactly `wanted` in the world.
- With rotations, the order of `mul` matters: undo the parent first, then apply the turn you want.

#### Changing parents without a jump

When an object changes parent (say the player steps onto a moving platform), its local numbers suddenly mean something new, and it visibly jumps. Pass `true` as the third argument to keep it where it is in the world: `go.set_parent(undefined, platformId, true)`. The first argument, `undefined`, means “this object”.

**Try it**

1. Why does a snowball from `factory.create` need a world position rather than a local one?
2. What goes wrong if the platform buddy uses `go.get_position()` for itself but `go.get_world_position()` for the player?

> [!MORE] Answers
> 1. A new snowball has no parent, so local and world are the same. The arm's local offset would put it near the world origin instead of at the hand.
> 2. It subtracts two positions measured from different places, so it heads for a point shifted by wherever the platform is.

## 14. Acceleration

> “My ship stops the instant I let go of thrust. A ship in space should keep drifting. How do I make it do that?”

Why does [Lesson 9](#9-build-a-spaceship)'s ship stop? Because it works out its velocity from scratch every frame: direction × speed while thrust is held, and no movement at all otherwise. Nothing carries over from one frame to the next.

A ship in space keeps whatever velocity it already has. Thrust doesn't replace that velocity. It **nudges** it, a little every frame.

![Figure 15. Facing and moving are different arrows. Thrust nudges the velocity toward the nose, frame by frame.](img/vectors/drift.svg#inline)

In Figure 15 the ship faces up, yet it keeps sliding to the right. Which arrow is which? The green one is where the nose points; the purple one is where the ship is actually going. Facing and moving have become two different arrows.

### A nudge every frame

Remember how [Lesson 5](#5-time-and-dt) moved the ship? Velocity times `dt` gave this frame's change in position. Now do the same to the velocity itself: **thrust times `dt` gives this frame's change in velocity**.

<!-- prelude: let velocity = vmath.vector3(0, 0, 0); let position = vmath.vector3(0, 0, 0); const direction = vmath.vector3(1, 0, 0); declare const dt: number; const ACCELERATION = 400; -->
```ts
const acceleration = direction.mul(ACCELERATION);
velocity = velocity.add(acceleration.mul(dt));
position = position.add(velocity.mul(dt));
```

- `direction.mul(ACCELERATION)` is the thrust: toward the nose, 400 pixels per second faster every second. A change in velocity over time has a name: **acceleration**.
- `acceleration.mul(dt)` is this frame's slice of it, and `add` puts it on top of the velocity the ship already had. Hold thrust for one second and the speed grows by 400.
- The last line is [Lesson 5](#5-time-and-dt)'s, unchanged.
- `velocity` is no longer made fresh each frame. It has to be remembered, so a real script keeps it in `self`.

Now read the last two lines together. **Acceleration changes velocity exactly the way velocity changes position.** That's the whole trick.

### Gliding to a stop

Let go of thrust now, and what stops the ship? Nothing. It would drift forever. To make it glide to a stop, keep a little less of the velocity each frame:

<!-- prelude: let velocity = vmath.vector3(100, 0, 0); declare const dt: number; const FRICTION = 0.4; -->
```ts
const keep = Math.max(0, 1 - FRICTION * dt);
velocity = velocity.mul(keep);
```

- Multiplying by a number below one makes an arrow shorter without turning it, just as [Lesson 4](#4-direction-speed-and-velocity) showed.
- `FRICTION * dt` is this frame's share of slowing down: the same “per second times `dt`” rule as always. With friction 0.4 at 60 FPS, `keep` is about 0.993, so the ship keeps 99.3% of its velocity each frame. That's a slow glide.
- A bigger friction number stops the ship sooner.
- `Math.max(0, ...)` makes sure a huge `dt` can never flip the velocity backwards.

**Try it**

1. A ship at rest holds thrust for half a second, with `ACCELERATION = 400` and no friction. How fast is it going?
2. What does a ship with `FRICTION = 0` do after you let go of thrust?
3. The ship drifts right while its nose points up. You hold thrust. Which way does the path start to bend?

> [!MORE] Answers
> 1. 200 pixels per second: 400 every second, for half a second.
> 2. It keeps drifting at the same velocity until it thrusts again.
> 3. Up. Each nudge adds a small upward arrow to the velocity, so the path curves from rightward toward up.

## Final project: drifting through space

> “I want my ship to feel like it's really in space: thrust pushes it, it keeps drifting when I let go, and it slowly glides to a stop.”

Every piece is already on the page. [Lesson 9](#9-build-a-spaceship) gives the turning ship, and [Lesson 14](#14-acceleration) gives the drift. All that's left is putting them in one script, with two small extras that need nothing new:

- a **speed limit**, built from [Lesson 4](#4-direction-speed-and-velocity)'s normalize and multiply;
- a **screen wrap**, so a ship that leaves on the right comes back on the left.

| | Lesson 9 ship | Drifting ship |
| --- | --- | --- |
| Thrust does… | velocity = direction × speed | velocity += direction × acceleration × dt |
| Let go of thrust | stops instantly | keeps drifting |
| Turn while moving | path turns immediately | ship turns, but slides the old way until thrust corrects it |
| Also has | none | friction and braking ([Lesson 14](#14-acceleration)), a speed limit, screen wrap |

### The complete script

Use the same scene and input bindings as [Lesson 9](#9-build-a-spaceship) (including `brake` on the down arrow), and attach `src/drift_ship.ts.script` instead of the old ship script.

```ts title="drift_ship.ts"
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
      left: false,
      right: false,
      thrusting: false,
      braking: false,
      screenWidth: sys.get_config_int("display.width", 960),
      screenHeight: sys.get_config_int("display.height", 640),
    };
  },

  update(self, dt) {
    // 1. ROTATION
    const turn = (self.left ? 1 : 0) - (self.right ? 1 : 0);
    self.angle = self.angle + turn * TURN_SPEED * dt;
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
      if (action.pressed) self.left = true;
      if (action.released) self.left = false;
    } else if (action_id === TURN_RIGHT) {
      if (action.pressed) self.right = true;
      if (action.released) self.right = false;
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

### The important parts

- **Tuning.** Everything is “per second”: `TURN_SPEED` (radians per second; `math.rad(200)` is 200° per second), `ACCELERATION` (pixels per second gained each second) and `MAX_SPEED`. When the ship feels wrong, change these first.
- **init.** Velocity now lives in `self`, because it has to survive from one frame to the next. That memory is what makes drifting possible. We also read the window size from `game.project` with `sys.get_config_int`, for screen wrapping.
- **1. Rotation** and **2. Direction** are exactly [Lesson 9](#9-build-a-spaceship).
- **3. Acceleration** and **4. Friction** are [Lesson 14](#14-acceleration). Braking is the same friction with a much bigger number.
- **5. Speed limit.** `vmath.length(self.velocity)` is the current speed. If it's too high, normalize (keep the direction) and multiply by `MAX_SPEED`. Normalizing is safe here: the length is above `MAX_SPEED`, so it can't be zero.
- **6. Position.** The same line as always: position + velocity × dt.
- **7. Screen wrap.** Leave on the right, come back on the left. Each part of a vector is an ordinary number, so we change `x` and `y` directly.

> [!TIP] **Look how much of this you already knew.** Position, direction, speed, velocity, dt and rotation do exactly the jobs they did before. Acceleration just adds one more link to [Lesson 7](#7-direction-from-rotation)'s chain, between direction and velocity.

**Try it**

1. Show a thrust particle effect only while thrusting. Where in `update` would the check go?
2. Add a “hyperspace” key that jumps the ship to a random position (and keeps its velocity).
3. Toss snowballs from the drifting ship: give each one velocity = direction × 300 **plus** the ship's own velocity. Why add the ship's velocity?
4. Make a robot that uses [Lesson 11](#11-the-dot-product)'s dot product to wave only when the ship is inside its view cone.

> [!MORE] Answers
> 1. In step 3, inside `if (self.thrusting)`: that's the one place that already knows thrust is on.
> 2. On the key press in `on_input`, set a new position with `math.random(0, self.screenWidth)` and `math.random(0, self.screenHeight)`. Leave `self.velocity` alone, and the ship keeps drifting the same way.
> 3. A snowball tossed from a moving ship carries the ship's motion too. Without it, a fast ship would catch up with its own snowballs.
> 4. Work out `alignment` as in [Lesson 11](#11-the-dot-product), and wave only when it is above your threshold, such as 0.7.

## Cheat sheet

### The six ideas

| Idea | Question | In code |
| --- | --- | --- |
| **Position** | Where am I? | `go.get_position()` |
| **Direction** | Which way? Length one. | `vmath.normalize(v)` |
| **Speed** | How fast? A number. | `vmath.length(velocity)` |
| **Velocity** | Which way, and how fast? | `direction.mul(speed)` |
| **Rotation** | How am I turned? | `vmath.quat_rotation_z(a)` |
| **dt** | How much time passed? Seconds. | `update(self, dt)` |

### API

| Task | Code |
| --- | --- |
| Create a vector | `vmath.vector3(x, y, z)` |
| Add / subtract | `a.add(b)`, `a.sub(b)` |
| Scale by a number | `v.mul(n)`, `v.div(n)` |
| Flip an arrow | `v.unm()` (not `-v`) |
| Length / distance | `vmath.length(v)` |
| Make length one | `vmath.normalize(v)` (length must be above zero) |
| Agreement (−1 to +1) | `vmath.dot(a, b)` |
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
| Follow | `vmath.normalize(b.sub(a)).mul(speed * dt)` |
| In front? | `vmath.dot(forward, dirToTarget) > 0` |
| Accelerate | `vel = vel.add(dir.mul(accel * dt))` |
| Friction | `vel = vel.mul(Math.max(0, 1 - f * dt))` |
| Speed limit | `vmath.normalize(vel).mul(MAX)` |
| Turn from two keys | `turn = (self.left ? 1 : 0) - (self.right ? 1 : 0)` |
| Turn | `self.angle += turn * TURN_SPEED * dt` |

### Local ↔ world

`go.get_position`, `go.set_position`, `go.get_rotation` and `go.set_rotation` are **local**: relative to the parent.

| Task | Code |
| --- | --- |
| Where am I in the world? | `go.get_world_position()`, `go.get_world_rotation()` |
| Local point → world | `go.get_world_transform().mul(vmath.vector4(x, y, z, 1))` |
| Local direction → world | `vmath.rotate(go.get_world_rotation(), dir)` |
| Put a child at a world position | `go.set_position(go.world_to_local_position(p, parent))` |
| Give a child a world rotation | `go.set_rotation(vmath.conj(parentWorldRot).mul(q))` |
| Change parent, no jump | `go.set_parent(undefined, parentId, true)` |
| Need this frame's values | `go.update_world_transform(id)` |

### Gotchas

- `v.normalize()` doesn't compile. Write `vmath.normalize(v)`.
- `a + b` doesn't compile. Write `a.add(b)`.
- `-v` is not a vector. Write `v.unm()`.
- Anything “per second” gets multiplied by `dt`.
- Angles are radians, and positive turns counter-clockwise.
- Compare `action_id` to `hash("...")`, not to a string.
- Draw sprites facing right (or fix their facing once in the editor), and `FORWARD` stays (1, 0, 0).
- Keep each object's changing values in `self`. A `let` at the top of the file is shared by every object running the script.
- There is no `go.set_world_position`. Convert with `go.world_to_local_position`.
- When parents are involved, compare positions in **world** space.

### The chain

```text
rotation  →  vmath.rotate(rot, FORWARD)  →  × speed  →  × dt  →  + position
```
