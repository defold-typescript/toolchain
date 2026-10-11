---
toc-title: Learn state machines
llms-full: false
---
# State machines, one click at a time

A hands-on introduction to the `hsm` (Hierarchical State Machine) library for Defold and TypeScript, with no prior state machine experience needed. Every diagram on this page runs the real `hsm` library in your browser, and only Defold calls like `msg.post` and `go.animate` are imitated. Press the buttons and watch it work.

When you want the full rules, [State machines](./state-machines.md) has them all.

Here is a small robot buddy. Go on, poke it.

<div data-hsm-demo="buddy-first"></div>

What did you just do? You pressed `POKE`, and the buddy woke up. Press it again, and it goes back to sleep.

That's a state machine. The buddy is always in exactly one **state**: `asleep` or `awake`. Pressing `POKE` sends an **event**, and a **transition** rule moves the buddy to the other state. The glowing box is the state it's in right now, and the log shows each step as it happens.

This page grows that buddy one idea at a time. By the end it wanders, follows you, gets tired and wakes up slowly, and it is still one machine in one file.

## 1. Why bother?

Couldn't you build the buddy from a few true/false flags? Let's try, with the two things it will learn later already in: following you, and resting when it's tired.

```ts
let isAwake = false;
let isFollowing = false;
let isResting = false;

export function poke(): void {
  isAwake = !isAwake;
}

export function seePlayer(): void {
  if (isAwake) {
    isFollowing = true;
  }
}

export function runOutOfEnergy(): void {
  isAwake = false;
  isResting = true;
}
```

It looks fine. Now walk up to the buddy so it follows you, and poke it to sleep. `isAwake` turns false. What about `isFollowing`?

It is still true. Your buddy is asleep and following you at the same time.

Three flags can be set eight different ways. How many of them make sense? **Only four:** asleep, wandering, following and resting. The other four are bugs waiting for the right order of button presses, and nothing in the code stops you from getting there.

A state machine fixes this with one rule: **the thing is always in exactly one state.** The buddy is asleep or it is awake, never both. You write down which events move it from one state to another, and nothing else can.

### Try it

1. The buddy runs out of energy while it follows you. Which flags are true afterward?
2. You add a fourth flag, `isWaking`. How many ways can four flags be set?

> [!MORE] Answer
> 1. `isFollowing` and `isResting`: a buddy that rests and follows at once. `runOutOfEnergy` forgot one flag, and nothing warned you.
> 2. Sixteen. Every new flag doubles the count, and almost all of the new ones make no sense.

## 2. Four words to learn

Before any code, you need four words. You met three of them at the top of the page.

| Word | Meaning | In the buddy |
| --- | --- | --- |
| State | A mode the thing can be in. Exactly one is active. | `asleep`, `awake` |
| Event | Something that happens. You send it to the machine. | a poke: `POKE` |
| Transition | A rule: in this state, when this event happens, go to that state. | asleep + POKE goes to awake |
| Context (`ctx`) | Your own data that the machine carries and can change. | how many times it has woken up |

The fourth one is new. Where is it in the diagram? Scroll up and look under the button: `ctx.wakes` is the buddy's context, one number that goes up each time it wakes.

> [!NOTE] **Draw it first.** Before writing code, sketch your states as boxes and your events as arrows on paper. If the drawing is clear, the code will be easy.

### Try it

1. A platform waits at the bottom, rides up when you step on it, and rides back down three seconds later. Name its states and its events.

> [!MORE] Answer
> 1. States: `waiting` and `raised`. Events: you step on it, and three seconds pass. Time running out counts as something that happens. [Lesson 8](#8-time-and-every-frame-checks) shows how a machine keeps time.

## 3. Your first machine

You have poked the buddy, and you have the words for what you saw. So what does it look like in code?

Make a file named `buddy-machine.ts`:

```ts step title="buddy-machine.ts"
import { defineMachine } from "@defold-typescript/types/hsm";

interface BuddyCtx {
  wakes: number;
}

type BuddyEvent = { type: "POKE" };

export const buddyMachine = defineMachine<BuddyCtx, BuddyEvent>()({
  initial: "/asleep",
  states: {
    asleep: {
      on: { POKE: "/awake" },
    },
    awake: {
      enter: (ctx) => {
        ctx.wakes += 1;
      },
      on: { POKE: "/asleep" },
    },
  },
});

const buddy = buddyMachine.start({ wakes: 0 });
buddy.send({ type: "POKE" });
print(buddy.path);
```

All four words are in there:

- **`interface BuddyCtx`** is the context: the data the buddy carries.
- **`type BuddyEvent`** lists every event the buddy understands. There is one so far.
- **`states`** holds one block per state, and **`initial`** says which one to start in.
- **`on: { POKE: "/awake" }`** is a transition. Read it as "on a `POKE`, go to `/awake`".
- **`enter`** is a function the machine calls each time the buddy arrives in `awake`. Here it counts the wake-ups.

Wherever you point at a state, you write its **path**: a `/`, then its name, like `"/awake"`. It works like a file path, and the next lesson shows why that matters.

### Using the machine

The last three lines put the buddy to work, and they are the whole loop:

- **`buddyMachine.start({ wakes: 0 })`** makes a running buddy and hands it its starting data.
- **`buddy.send({ type: "POKE" })`** sends it an event.
- **`buddy.path`** is the state it's in now. Here it prints `/awake`.

You **define** the machine once, **start** it to get a running copy, **send** events, and read `path` to see where it is. That's all there is to it.

> [!NOTE] **Why two sets of parentheses?** In `defineMachine<BuddyCtx, BuddyEvent>()({ ... })` the first call is where you name your data and event types. The second takes your states, and TypeScript works out the state names from it. It's a TypeScript limitation, so always write it this way.

### Try it

1. Poke the buddy in the diagram at the top five times. What does `ctx.wakes` show, and why isn't it five?
2. Add a second `buddy.send({ type: "POKE" })` above the `print` line. What does it print now?

> [!MORE] Answer
> 1. Three. `enter` runs when the buddy arrives in `awake`, and only the first, third and fifth pokes take it there.
> 2. `/asleep`. The second poke uses the rule on `awake`, which goes back to `/asleep`.

## 4. States inside states

The buddy can sleep and wake. An awake buddy should do something, though: **wander** around, and **follow** you when it sees you.

Is following a third state, next to `asleep` and `awake`? You could write it that way. But a poke should put the buddy to sleep whether it wanders or follows, and you'd have to write that rule twice.

Here's the trick: put `wander` and `follow` *inside* `awake`, like files in a folder.

<div data-hsm-demo="buddy-nested"></div>

Wake the buddy, then press `SEE_PLAYER`. How many boxes glow now?

Two: `follow`, and `awake` around it. Now add them to your file. This is the first change to it, so here is how to read one:

- A line on **green** is new. Add it.
- A line on **red** goes away.
- Every other line is already in your file and shows you the place. A `// ...` line stands for the lines left out.

```ts step title="buddy-machine.ts"
type BuddyEvent = { type: "POKE" }; // [!code --]
type BuddyEvent = // [!code ++]
  | { type: "POKE" } // [!code ++]
  | { type: "SEE_PLAYER" } // [!code ++]
  | { type: "LOSE_PLAYER" }; // [!code ++]
// ...
    awake: {
      initial: "/awake/wander", // [!code ++]
      enter: (ctx) => {
        ctx.wakes += 1;
      },
      on: { POKE: "/asleep" },
      states: { // [!code ++]
        wander: { // [!code ++]
          on: { SEE_PLAYER: "/awake/follow" }, // [!code ++]
        }, // [!code ++]
        follow: { // [!code ++]
          on: { LOSE_PLAYER: "/awake/wander" }, // [!code ++]
        }, // [!code ++]
      }, // [!code ++]
    },
// ...
buddy.send({ type: "POKE" });
print(buddy.path);
print(buddy.matches("/awake")); // [!code ++]
```

- **`states: { ... }`** inside `awake` holds its children. A child's path continues its parent's, like a file in a folder: `"/awake/follow"`.
- **`initial: "/awake/wander"`**: a state with children must say which one to start in. Entering `awake` always continues into `wander`.
- **`on: { POKE: "/asleep" }`** didn't move. It's written once, on `awake`, and it works in both children.
- **`buddy.matches("/awake")`** asks "is `awake` active at all?" It is true in both children, while `buddy.path` is the innermost state: `"/awake/wander"`.

When the buddy is in `follow` it is also in `awake`. Both glow. So the rule from [lesson 1](#1-why-bother) grows up a little: **one active state at each level**.

### Who handles the poke?

Put the buddy in `follow` and press `POKE`, with an eye on the log. `follow` has no rule for `POKE`. What happens to the event?

It **climbs up** to the parent. `awake` does have a rule, so the buddy goes to sleep. An event that no state handles is simply ignored.

> [!NOTE] **What the "h" in `hsm` means.** It stands for *hierarchical*: states can sit inside other states, forming a tree, like folders. A plain state machine is flat, so every state that shares a rule has to repeat it. In a hierarchical one the parent holds the shared rule once, and its children get it for free.

### Try it

1. Press `SEE_PLAYER` while the buddy is asleep. What does the log say?
2. Follow, poke the buddy to sleep, and poke it awake again. Is it wandering or following?

> [!MORE] Answer
> 1. Nobody handles it, so it is ignored. `asleep` has no rule for `SEE_PLAYER` and no parent to ask.
> 2. Wandering. Entering `awake` always starts at its `initial`, whatever the buddy was doing before.

## 5. Conditions and side effects

Now the buddy wanders and follows. A robot that bumps into things should lose a little energy with each bump, and stop to rest when it runs out.

That's new. One event, a bump, now has **two** possible outcomes. How does the machine pick one?

Two tools handle "it depends":

- **`when`** is a yes/no question. If the answer is no, that rule is skipped.
- **`run`** is code that runs when a rule is used, such as changing your data.

<div data-hsm-demo="buddy-energy"></div>

Wake the buddy and give it a small bump. Which rule lights up, and what happens to `ctx.energy`?

First the buddy needs a battery, and two new events:

```ts step title="buddy-machine.ts"
interface BuddyCtx {
  wakes: number;
  energy: number; // [!code ++]
}

type BuddyEvent =
  | { type: "POKE" }
  | { type: "BUMP"; cost: number } // [!code ++]
  | { type: "RECHARGE" } // [!code ++]
  | { type: "SEE_PLAYER" }
  | { type: "LOSE_PLAYER" };
// ...
const buddy = buddyMachine.start({ wakes: 0 }); // [!code --]
const buddy = buddyMachine.start({ wakes: 0, energy: 3 }); // [!code ++]
buddy.send({ type: "POKE" });
```

- **`energy: number`** joins the context, and `start` hands every buddy a full battery of 3.
- **`{ type: "BUMP"; cost: number }`**: an event can carry data. A bump says how much energy it costs.

Then the rules:

```ts step title="buddy-machine.ts"
    awake: {
      initial: "/awake/wander",
      enter: (ctx) => {
        ctx.wakes += 1;
      },
      on: { POKE: "/asleep" }, // [!code --]
      on: { // [!code ++]
        POKE: "/asleep", // [!code ++]
        BUMP: [ // [!code ++]
          { // [!code ++]
            to: "/resting", // [!code ++]
            when: (ctx, event) => ctx.energy <= event.cost, // [!code ++]
            run: (ctx) => { // [!code ++]
              ctx.energy = 0; // [!code ++]
            }, // [!code ++]
          }, // [!code ++]
          { // [!code ++]
            run: (ctx, event) => { // [!code ++]
              ctx.energy -= event.cost; // [!code ++]
            }, // [!code ++]
          }, // [!code ++]
        ], // [!code ++]
      }, // [!code ++]
      states: {
        // ...
      },
    },
    resting: { // [!code ++]
      on: { // [!code ++]
        RECHARGE: { // [!code ++]
          to: "/awake", // [!code ++]
          run: (ctx) => { // [!code ++]
            ctx.energy = 3; // [!code ++]
          }, // [!code ++]
        }, // [!code ++]
      }, // [!code ++]
    }, // [!code ++]
  },
});
```

- **`BUMP: [ ... ]`** is a list of rules. The machine tries them from top to bottom and uses the first one that passes, like an if/else.
- **`when: (ctx, event) => ctx.energy <= event.cost`** asks: does this bump use up the energy that's left? If so, the buddy goes to `/resting` and `run` empties the battery.
- **The second rule has no `when`**, so it always passes. It has no `to` either, so the buddy stays exactly where it is: nothing exits or enters, and only `run` runs.
- **`resting`** is a new state next to `asleep` and `awake`. `RECHARGE` fills the battery and wakes the buddy.

A rule can be written three ways, and you have now seen all of them:

| Write a rule as | Example | Use it when |
| --- | --- | --- |
| A state path | `POKE: "/asleep"` | You only need to move. Most rules. |
| An object | `{ to, when, run }` | You need a condition or some code. Every field is optional. |
| A list of objects | `[ {...}, {...} ]` | You need if / else-if choices. |

### Try it

1. Give an awake buddy two small bumps, then a big one. Where is it, and what is `ctx.energy`?
2. Bump the buddy while it's asleep. Does it lose energy?
3. The buddy is in `follow` when the big bump lands. Which state handles it?

> [!MORE] Answer
> 1. In `/resting`, with 0. After two small bumps the battery holds 1, a bump of cost 3 uses up what's left, and the first rule's `when` says yes.
> 2. No. `BUMP` is written on `awake`, and a sleeping buddy isn't in `awake`, so the event is ignored.
> 3. `awake`. `follow` has no rule for `BUMP`, so the event climbs to its parent, just like the poke in [lesson 4](#4-states-inside-states).

## 6. enter, exit, and the order of things

The buddy rests when it's tired, but nobody can see that. Let's give it a **light** that is on while it's awake.

You know the hook that turns it on: `enter` runs when the buddy arrives in `awake`. But where do you turn it off? The buddy can leave `awake` by falling asleep or by getting tired, and a third way may come along tomorrow.

One hook covers them all: **`exit`** runs when the buddy leaves the state, wherever it goes next.

```ts step title="buddy-machine.ts"
interface BuddyCtx {
  light: Url; // [!code ++]
  wakes: number;
  energy: number;
}
// ...
    awake: {
      initial: "/awake/wander",
      enter: (ctx) => {
        ctx.wakes += 1;
        msg.post(ctx.light, "enable"); // [!code ++]
      },
      exit: (ctx) => msg.post(ctx.light, "disable"), // [!code ++]
      on: {
        // ...
        follow: {
          on: { LOSE_PLAYER: "/awake/wander" }, // [!code --]
          on: { LOSE_PLAYER: "/awake/wander", SEE_PLAYER: "/awake/follow" }, // [!code ++]
        },
// ...
const buddy = buddyMachine.start({ wakes: 0, energy: 3 }); // [!code --]
const buddy = buddyMachine.start({ light: msg.url("#light"), wakes: 0, energy: 3 }); // [!code ++]
buddy.send({ type: "POKE" });
```

- **`light: Url`** is the address of the buddy's light, a sprite on its game object, and `msg.url("#light")` builds that address. It only means something inside a running game, so don't run the file just yet. The next lesson moves the `start` line to where it belongs.
- **`msg.post(ctx.light, "enable")`** shows the light on the way into `awake`, and the **`exit`** hook hides it on the way out.
- **`SEE_PLAYER: "/awake/follow"`** is a rule on `follow` that names `follow` itself. More about that one in a moment.

### The order of a transition

Every transition does three steps, always in this order:

1. **Exit** the old states, innermost first.
2. Run the rule's **`run`**.
3. **Enter** the new states, outermost first, continuing into each initial child.

You can watch all three in the [lesson 5](#5-conditions-and-side-effects) diagram. Tire the buddy out, press `RECHARGE` and read the log: `resting` exits, the rule's `run` fills the battery, then `awake` is entered, then `wander`.

### Leaving and coming back

A state you're not really leaving stays put. Going from `/awake/follow` to `/awake/wander` never exits `awake`, so the light stays on and `wakes` isn't counted again.

What about the new rule, the one where `follow` points at `follow`? That is the exception: a rule that names its own state **leaves it and comes back**. `follow` exits and enters again, and `awake` around it never notices.

Why would you want that? Because entering a state starts it fresh. In [lesson 8](#8-time-and-every-frame-checks) `follow` gets a timer, and seeing you again will start it over.

### Pointing at the right state

Every target is the full path from the top, wherever the rule is written. A rule inside `/awake/follow` points at its sibling the same way a rule anywhere else would.

| From `/awake/follow`, write | Means | Goes to |
| --- | --- | --- |
| `"/awake/wander"` | A full path | `/awake/wander` |
| `"/resting"` | A full path | `/resting` |
| `"wander"`, `"./wander"` or `"../resting"` | Not a path: no leading `/` | Nothing: the machine refuses to start |

There are no shortcuts relative to the current state. A missing `/` or a misspelled path is usually caught by TypeScript as a compile error, before your game ever runs.

### Try it

1. The buddy is in `/awake/follow` and takes a bump that uses up its energy. What runs, and in what order?
2. The buddy follows you and sees you again. Does the light blink? Does `wakes` go up?

> [!MORE] Answer
> 1. `follow` exits first (it has no hook). Then `awake` exits, and its hook hides the light. Then the rule's `run` empties the battery. Last, `resting` is entered.
> 2. No, and no. Only `follow` exits and enters. `awake` was never left, so neither of its hooks runs.

## 7. Putting it in a Defold game

So far the buddy has lived at the bottom of its own file, started by a few lines that run once. A game has game objects, though, and maybe five buddies in one level.

So where does the machine go, and who starts it?

**Step 1.** `buddy-machine.ts` describes the machine and starts nothing. Take the lines at the bottom out:

```ts step title="buddy-machine.ts"
    },
  },
});

const buddy = buddyMachine.start({ light: msg.url("#light"), wakes: 0, energy: 3 }); // [!code --]
buddy.send({ type: "POKE" }); // [!code --]
print(buddy.path); // [!code --]
print(buddy.matches("/awake")); // [!code --]
```

What is left is a plain module. It compiles to `.lua`, and any script can import it.

**Step 2.** Make a script for the buddy's game object, next to that file:

```ts step title="buddy.ts"
import { defineScript } from "@defold-typescript/types";
import { buddyMachine } from "./buddy-machine";

const TOUCH = hash("touch");

export default defineScript({
  init() {
    msg.post(".", "acquire_input_focus");
    msg.post("#light", "disable");
    return {
      buddy: buddyMachine.start({ light: msg.url("#light"), wakes: 0, energy: 3 }),
    };
  },
  on_input(self, action_id, action) {
    if (action_id === TOUCH && action.pressed) {
      self.buddy.send({ type: "POKE" });
    }
  },
  final(self) {
    self.buddy.stop();
  },
});
```

- **`init`** runs once for every game object that uses the script. It starts a machine for **this** buddy and keeps it on `self`.
- **`msg.post("#light", "disable")`**: the buddy starts asleep, so its light starts hidden.
- **`on_input`** turns a click or a tap into a `POKE`. Posting `acquire_input_focus` asks Defold to send input here at all.
- **`final`** runs when the object is deleted. `stop()` exits every active state, so their `exit` hooks get to tidy up. [Lesson 11](#11-one-thing-at-a-time) comes back to it.

Nothing in the game sends the other events yet. That's fine for now: the diagrams do the sending, and [lesson 10](#10-messages-from-defold) lets Defold report when the player comes near.

> [!WARNING] **Create machines in init.** A machine started at the top of a script file is shared by every object that runs the script, so all your buddies would wake up together.

> [!MORE] The whole file so far
>
> ```ts step title="buddy-machine.ts"
> import { defineMachine } from "@defold-typescript/types/hsm";
>
> interface BuddyCtx {
>   light: Url;
>   wakes: number;
>   energy: number;
> }
>
> type BuddyEvent =
>   | { type: "POKE" }
>   | { type: "BUMP"; cost: number }
>   | { type: "RECHARGE" }
>   | { type: "SEE_PLAYER" }
>   | { type: "LOSE_PLAYER" };
>
> export const buddyMachine = defineMachine<BuddyCtx, BuddyEvent>()({
>   initial: "/asleep",
>   states: {
>     asleep: {
>       on: { POKE: "/awake" },
>     },
>     awake: {
>       initial: "/awake/wander",
>       enter: (ctx) => {
>         ctx.wakes += 1;
>         msg.post(ctx.light, "enable");
>       },
>       exit: (ctx) => msg.post(ctx.light, "disable"),
>       on: {
>         POKE: "/asleep",
>         BUMP: [
>           {
>             to: "/resting",
>             when: (ctx, event) => ctx.energy <= event.cost,
>             run: (ctx) => {
>               ctx.energy = 0;
>             },
>           },
>           {
>             run: (ctx, event) => {
>               ctx.energy -= event.cost;
>             },
>           },
>         ],
>       },
>       states: {
>         wander: {
>           on: { SEE_PLAYER: "/awake/follow" },
>         },
>         follow: {
>           on: { LOSE_PLAYER: "/awake/wander", SEE_PLAYER: "/awake/follow" },
>         },
>       },
>     },
>     resting: {
>       on: {
>         RECHARGE: {
>           to: "/awake",
>           run: (ctx) => {
>             ctx.energy = 3;
>           },
>         },
>       },
>     },
>   },
> });
>
> ```
>
> ```ts step title="buddy.ts"
> import { defineScript } from "@defold-typescript/types";
> import { buddyMachine } from "./buddy-machine";
>
> const TOUCH = hash("touch");
>
> export default defineScript({
>   init() {
>     msg.post(".", "acquire_input_focus");
>     msg.post("#light", "disable");
>     return {
>       buddy: buddyMachine.start({ light: msg.url("#light"), wakes: 0, energy: 3 }),
>     };
>   },
>   on_input(self, action_id, action) {
>     if (action_id === TOUCH && action.pressed) {
>       self.buddy.send({ type: "POKE" });
>     }
>   },
>   final(self) {
>     self.buddy.stop();
>   },
> });
> ```

### Try it

1. You put three buddies in a level. How many machines are running, and how many times is `buddyMachine` defined?
2. Why can't `buddy-machine.ts` export the script as well?

> [!MORE] Answer
> 1. Three machines, one definition. `defineMachine` describes a buddy once, and each `start` in `init` makes a running copy with its own state and its own data.
> 2. A file that exports `defineScript` becomes a script component, and nothing else can import it. The machine stays in a plain module so any script can use it.

## 8. Time and every-frame checks

The buddy is in a game now, and a game runs frame by frame. So far the buddy only moves when something pokes it. What if it should get bored of following after a few seconds, or nod off when nobody plays with it?

It needs a sense of time, and the machine can't feel time on its own. **Somebody has to tell it how much has passed.** That somebody is your script, once per frame:

```ts step title="buddy.ts"
    };
  },
  update(self, dt) { // [!code ++]
    self.buddy.update(dt); // [!code ++]
  }, // [!code ++]
  on_input(self, action_id, action) {
```

Defold calls the script's `update` every frame with `dt`, the seconds since the last one, and the script passes it on. That one call gives every state two new keys:

- **`after`** is a timer: "after this many seconds in this state, go there."
- **`update`** is a function that runs every frame while the state is active. Return a state path to move there, or `undefined` to stay.

<div data-hsm-demo="buddy-time"></div>

Wake the buddy, press `SEE_PLAYER`, and then keep your hands off. What does the bar on `follow` do when it fills up?

```ts step title="buddy-machine.ts"
      exit: (ctx) => msg.post(ctx.light, "disable"),
      after: { 30: "/asleep" }, // [!code ++]
      on: {
        // ...
        follow: {
          after: { 4: "/awake/wander" }, // [!code ++]
          on: { LOSE_PLAYER: "/awake/wander", SEE_PLAYER: "/awake/follow" },
        },
      },
    },
    resting: {
      update: (ctx, dt) => { // [!code ++]
        ctx.energy = math.min(3, ctx.energy + dt); // [!code ++]
        return ctx.energy >= 3 ? "/awake" : undefined; // [!code ++]
      }, // [!code ++]
      on: {
        RECHARGE: {
```

- **`after: { 4: "/awake/wander" }`**: four seconds after it starts to follow, the buddy gives up and wanders.
- **`after: { 30: "/asleep" }`** on `awake`: half a minute awake, and it nods off.
- **`update`** on `resting` adds each frame's `dt` to the battery, and `math.min` keeps it from going past 3. Once it's full the hook returns `"/awake"` and the buddy gets up. Until then it returns `undefined`, and the buddy keeps resting.

A few rules about time are worth knowing:

- Each state's timer starts at zero every time the state is entered.
- Timers count the `dt` you pass in. If you stop calling `update`, time stands still. Pause the diagram to see it.
- `update` hooks get the first chance each frame. Timers only fire if none of them moved the machine.
- At most one timer moves the machine in one `update` call.

### A parent's timer keeps running

Look at the two bars while the buddy follows you: one on `follow`, one on `awake`. Press `SEE_PLAYER` again when `follow`'s bar is nearly full. Which bar starts over?

Only `follow`'s. That is the rule from [lesson 6](#6-enter-exit-and-the-order-of-things) at work: `SEE_PLAYER` names `follow`'s own state, so `follow` exits, enters again, and its clock starts from zero.

`awake` was never left. **Its clock runs straight through**, whatever its children do. Isn't that handy? "Follow for four seconds at a time, and sleep after thirty in total" takes two short lines.

### Try it

1. The buddy follows you, and you press `SEE_PLAYER` every three seconds. Does it ever wander? Does it ever fall asleep?
2. Give an awake buddy a bump of cost 3, then pause time. Does the battery fill?

> [!MORE] Answer
> 1. It never wanders, because `follow`'s four seconds start over each time. It does fall asleep: `awake`'s thirty seconds keep counting through every restart.
> 2. No. The `update` hook only runs when `update(dt)` is called, and a paused clock calls nothing. `RECHARGE` still works, because it is an event.

## 9. Waiting for things to finish

A poke flips the buddy from asleep to awake in an instant, and its light snaps on. A sleepy robot should wake up slowly: fade the light in over a second, and only then count as awake.

So waking up is now a job that takes a while and then **finishes**. Who tells the machine that the fade is done? You could guess with a one-second timer. Better to let the animation say so itself.

Start work like that in a state's **`task`**. The task receives a **`finish`** function, and you call it with an event when the work is done.

<div data-hsm-demo="buddy-waking"></div>

Poke the buddy and watch the light: it glows dimly while `waking` is active. What happens at the end of the fade?

```ts step title="buddy-machine.ts"
type BuddyEvent =
  | { type: "POKE" }
  | { type: "WOKEN" } // [!code ++]
  | { type: "BUMP"; cost: number }
// ...
    asleep: {
      on: { POKE: "/awake" }, // [!code --]
      on: { POKE: "/waking" }, // [!code ++]
    },
    waking: { // [!code ++]
      task: (ctx, finish) => { // [!code ++]
        go.set(ctx.light, "tint.w", 0); // [!code ++]
        msg.post(ctx.light, "enable"); // [!code ++]
        go.animate(ctx.light, "tint.w", go.PLAYBACK_ONCE_FORWARD, 1, go.EASING_LINEAR, 1, 0, () => { // [!code ++]
          finish({ type: "WOKEN" }); // [!code ++]
        }); // [!code ++]
      }, // [!code ++]
      exit: (ctx) => { // [!code ++]
        go.cancel_animations(ctx.light, "tint.w"); // [!code ++]
        msg.post(ctx.light, "disable"); // [!code ++]
      }, // [!code ++]
      on: { WOKEN: "/awake", POKE: "/asleep" }, // [!code ++]
    }, // [!code ++]
    awake: {
```

- **`on: { POKE: "/waking" }`**: a poke no longer wakes the buddy outright. It starts the wake-up.
- **`task`** runs when `waking` is entered. It shows the light fully see-through and asks Defold to fade it in over one second. When the fade ends, Defold calls the function at the end, and `finish` hands the machine a `WOKEN` event.
- **`exit`** stops what the task started: it cancels the fade and hides the light. If the buddy goes on to `awake`, `awake`'s own `enter` shows the light again at once.
- **`on: { WOKEN: "/awake", POKE: "/asleep" }`**: the end of the fade wakes the buddy, and a poke during the fade sends it back to sleep.

### Why the cleanup matters

Poke the buddy, and poke it again halfway through the fade. The light goes off, as it should.

Now turn off "cancel in exit" and do the same. See what happens? The fade keeps running on a buddy that is already asleep, so the light ends up fully on while the machine says `asleep`. That's the bug the cleanup in `exit` prevents.

One more thing is in the log. When the leftover fade ends, it still calls `finish`, and the machine **ignores it**, because `waking` was already left. A late `finish` can never wake a buddy that has moved on.

> [!WARNING] **Always clean up in exit.** `exit` runs however a state ends, including when the machine is stopped, so it's the one reliable place to cancel animations, timers and requests.

### Try it

1. You poke the buddy, change your mind, and poke it again during the fade. Does `ctx.wakes` go up?
2. With "cancel in exit" off, the late `finish` is ignored. So why is the light still wrong?

> [!MORE] Answer
> 1. No. `wakes` is counted in `awake`'s `enter`, and the buddy never got there.
> 2. Ignoring the event protects the machine, not the sprite. The animation itself kept running, and only your `exit` hook can stop it.

## 10. Messages from Defold

Until now `SEE_PLAYER` and `LOSE_PLAYER` were events you made up, and nothing in the game sends them. Defold already knows when the player comes near. Give the buddy a trigger collision object, and Defold posts it a `trigger_response` message each time something walks in or out.

Do you have to turn that message into a `SEE_PLAYER` by hand? No. **A Defold message can be an event just as it is.**

```ts step title="buddy-machine.ts"
import { defineMachine } from "@defold-typescript/types/hsm";
import { type MessageEvent, messageEvents } from "@defold-typescript/types/hsm/defold"; // [!code ++]
// ...
  | { type: "RECHARGE" }
  | { type: "SEE_PLAYER" } // [!code --]
  | { type: "LOSE_PLAYER" }; // [!code --]
  | MessageEvent<"trigger_response">; // [!code ++]
// ...
        wander: {
          on: { SEE_PLAYER: "/awake/follow" }, // [!code --]
          on: { // [!code ++]
            trigger_response: { // [!code ++]
              to: "/awake/follow", // [!code ++]
              when: (_ctx, event) => event.enter, // [!code ++]
            }, // [!code ++]
          }, // [!code ++]
        },
        follow: {
          after: { 4: "/awake/wander" },
          on: { LOSE_PLAYER: "/awake/wander", SEE_PLAYER: "/awake/follow" }, // [!code --]
          on: { // [!code ++]
            trigger_response: [ // [!code ++]
              { to: "/awake/follow", when: (_ctx, event) => event.enter }, // [!code ++]
              { to: "/awake/wander" }, // [!code ++]
            ], // [!code ++]
          }, // [!code ++]
        },
// ...
  },
});

export const buddyEvents = messageEvents(["trigger_response"]); // [!code ++]
```

- **`MessageEvent<"trigger_response">`** is Defold's message as a machine event. Its `type` is the message name, and it carries the message's fields: `event.enter` is `true` when the player walked in and `false` when they walked out.
- **In `wander`**, the `when` skips the rule when the player walks out, so only walking in starts a follow. The rule doesn't read the context, and the underscore in `_ctx` says so.
- **In `follow`**, the list reads like an if/else again: walked in, follow afresh. Otherwise, back to wandering.
- **`messageEvents(["trigger_response"])`** builds the translator the script is about to use. Build it once, at the top of the module.

The script hands its messages over:

```ts step title="buddy.ts"
import { defineScript } from "@defold-typescript/types";
import { buddyMachine } from "./buddy-machine"; // [!code --]
import { buddyEvents, buddyMachine } from "./buddy-machine"; // [!code ++]
// ...
      self.buddy.send({ type: "POKE" });
    }
  },
  on_message(self, message_id, message, sender) { // [!code ++]
    const event = buddyEvents.toEvent(message_id, message, sender); // [!code ++]
    if (event !== undefined) { // [!code ++]
      self.buddy.send(event); // [!code ++]
    } // [!code ++]
  }, // [!code ++]
  final(self) {
```

- **`buddyEvents.toEvent(...)`** turns a message you listed into a typed event. For any other message it returns `undefined`, which is why the script checks before it sends.

For the full rules, see [the message bridge](./state-machines.md#the-message-bridge).

### Try it

1. The player walks out of the trigger while the buddy wanders. What happens?
2. The buddy is asleep and the player walks in. Does it wake up?
3. Your game also posts a `collision_response` to the buddy. Does the machine ever see it?

> [!MORE] Answer
> 1. Nothing. The only rule in `wander` has a `when` that says no, there is no second rule to try, and the event is ignored.
> 2. No. Only the children of `awake` have a rule for `trigger_response`. A poke is still the way to wake it.
> 3. No. `collision_response` isn't in the list given to `messageEvents`, so `toEvent` returns `undefined` and the script sends nothing.

## 11. One thing at a time

A new buddy starts asleep, and somebody has to poke it. Wouldn't it be nicer if it woke itself up the first time?

The buddy knows whether it has ever been awake: that's `ctx.wakes`. So `asleep` could check the number on the way in and send itself a poke.

Here is the catch. `asleep`'s `enter` hook runs in the middle of a transition. Can a machine take a new event while it's still busy with the last one?

It can't, and it doesn't have to. An event sent from inside a hook or a `run` **waits in a queue** until the current transition, every exit and enter included, has finished. Then it gets its turn.

<div data-hsm-demo="buddy-queue"></div>

Press "start() with wakes = 0" and read the log from the top. Can you find the line where the poke has to wait?

```ts step title="buddy-machine.ts"
    asleep: {
      enter: (ctx, machine) => { // [!code ++]
        if (ctx.wakes === 0) machine.send({ type: "POKE" }); // [!code ++]
      }, // [!code ++]
      on: { POKE: "/waking" },
    },
```

- **`enter: (ctx, machine) => ...`**: every hook gets the running machine as its last parameter, so it can send events to it.
- **`if (ctx.wakes === 0)`**: only a buddy that has never been awake pokes itself.

Back to the log. `enter /asleep` comes first, then `POKE queued`, and only after that does `asleep` exit. Every queued event is handled before the outer call returns, so by the time `start()` hands you the buddy it is already in `/waking`.

It stays there, by the way. This diagram has no clock, and [lesson 8](#8-time-and-every-frame-checks) told you what that means: time stands still, and the fade never ends.

### What stop leaves behind

Now press "stop()". That is what the script's `final` does when the buddy's game object is deleted.

Every active state exits, innermost first, so `waking`'s cleanup runs and the light goes off. After that `path` is `undefined`, and events do nothing at all.

### Try it

1. Press "start() with wakes = 1". What is different in the log?
2. Start with `wakes` at 0 again, then poke the buddy while it is waking. Where does it end up, and why?
3. After "stop()", press `POKE`. What does the log say?

> [!MORE] Answer
> 1. No poke is queued. This buddy has been awake before, so it stays in `/asleep` until you poke it.
> 2. In `/waking` again. Your poke sends it to `/asleep`, whose `enter` finds `wakes` still at 0 (the buddy never reached `awake`) and queues another poke.
> 3. That `POKE` is ignored because the machine is stopped. A stopped machine never starts again. To get a buddy back, `start` a new one.

## 12. The machine's own data

Look at what the script hands to `start`: a light, `wakes: 0` and `energy: 3`.

The light makes sense. Only the script knows which sprite it is. But the two numbers? Only the machine ever uses them, and every script that starts a buddy has to get them right.

Shouldn't the machine set up its own data? It can, with one key: **`privateCtx`**.

```ts step title="buddy-machine.ts"
interface BuddyCtx {
  light: Url;
  wakes: number; // [!code --]
  energy: number; // [!code --]
}
// ...
export const buddyMachine = defineMachine<BuddyCtx, BuddyEvent>()({
  privateCtx: () => ({ wakes: 0, energy: 3 }), // [!code ++]
  initial: "/asleep",
```

```ts step title="buddy.ts"
    return {
      buddy: buddyMachine.start({ light: msg.url("#light"), wakes: 0, energy: 3 }), // [!code --]
      buddy: buddyMachine.start({ light: msg.url("#light") }), // [!code ++]
    };
```

- **`privateCtx`** is a function that builds the machine's own fields, fresh for every buddy that starts.
- **`BuddyCtx`** keeps only what a script hands in: the light.
- **`start`** takes the light alone now, and `self.buddy.ctx` shows the light alone.

And the hooks? **Not one of them changed.** They still read `ctx.wakes` and `ctx.energy`, exactly as before.

> [!NOTE] **Hidden, not locked.** The fields are hidden by type only: at run time they sit on the same `ctx` as the light. A machine with no data of its own leaves `privateCtx` out. [Private fields with `privateCtx`](./state-machines.md#private-fields-with-privatectx) has the rules.

> [!MORE] The whole file so far
>
> ```ts step title="buddy-machine.ts"
> import { defineMachine } from "@defold-typescript/types/hsm";
> import { type MessageEvent, messageEvents } from "@defold-typescript/types/hsm/defold";
>
> interface BuddyCtx {
>   light: Url;
> }
>
> type BuddyEvent =
>   | { type: "POKE" }
>   | { type: "WOKEN" }
>   | { type: "BUMP"; cost: number }
>   | { type: "RECHARGE" }
>   | MessageEvent<"trigger_response">;
>
> export const buddyMachine = defineMachine<BuddyCtx, BuddyEvent>()({
>   privateCtx: () => ({ wakes: 0, energy: 3 }),
>   initial: "/asleep",
>   states: {
>     asleep: {
>       enter: (ctx, machine) => {
>         if (ctx.wakes === 0) machine.send({ type: "POKE" });
>       },
>       on: { POKE: "/waking" },
>     },
>     waking: {
>       task: (ctx, finish) => {
>         go.set(ctx.light, "tint.w", 0);
>         msg.post(ctx.light, "enable");
>         go.animate(ctx.light, "tint.w", go.PLAYBACK_ONCE_FORWARD, 1, go.EASING_LINEAR, 1, 0, () => {
>           finish({ type: "WOKEN" });
>         });
>       },
>       exit: (ctx) => {
>         go.cancel_animations(ctx.light, "tint.w");
>         msg.post(ctx.light, "disable");
>       },
>       on: { WOKEN: "/awake", POKE: "/asleep" },
>     },
>     awake: {
>       initial: "/awake/wander",
>       enter: (ctx) => {
>         ctx.wakes += 1;
>         msg.post(ctx.light, "enable");
>       },
>       exit: (ctx) => msg.post(ctx.light, "disable"),
>       after: { 30: "/asleep" },
>       on: {
>         POKE: "/asleep",
>         BUMP: [
>           {
>             to: "/resting",
>             when: (ctx, event) => ctx.energy <= event.cost,
>             run: (ctx) => {
>               ctx.energy = 0;
>             },
>           },
>           {
>             run: (ctx, event) => {
>               ctx.energy -= event.cost;
>             },
>           },
>         ],
>       },
>       states: {
>         wander: {
>           on: {
>             trigger_response: {
>               to: "/awake/follow",
>               when: (_ctx, event) => event.enter,
>             },
>           },
>         },
>         follow: {
>           after: { 4: "/awake/wander" },
>           on: {
>             trigger_response: [
>               { to: "/awake/follow", when: (_ctx, event) => event.enter },
>               { to: "/awake/wander" },
>             ],
>           },
>         },
>       },
>     },
>     resting: {
>       update: (ctx, dt) => {
>         ctx.energy = math.min(3, ctx.energy + dt);
>         return ctx.energy >= 3 ? "/awake" : undefined;
>       },
>       on: {
>         RECHARGE: {
>           to: "/awake",
>           run: (ctx) => {
>             ctx.energy = 3;
>           },
>         },
>       },
>     },
>   },
> });
>
> export const buddyEvents = messageEvents(["trigger_response"]);
> ```
>
> ```ts step title="buddy.ts"
> import { defineScript } from "@defold-typescript/types";
> import { buddyEvents, buddyMachine } from "./buddy-machine";
>
> const TOUCH = hash("touch");
>
> export default defineScript({
>   init() {
>     msg.post(".", "acquire_input_focus");
>     msg.post("#light", "disable");
>     return {
>       buddy: buddyMachine.start({ light: msg.url("#light") }),
>     };
>   },
>   update(self, dt) {
>     self.buddy.update(dt);
>   },
>   on_input(self, action_id, action) {
>     if (action_id === TOUCH && action.pressed) {
>       self.buddy.send({ type: "POKE" });
>     }
>   },
>   on_message(self, message_id, message, sender) {
>     const event = buddyEvents.toEvent(message_id, message, sender);
>     if (event !== undefined) {
>       self.buddy.send(event);
>     }
>   },
>   final(self) {
>     self.buddy.stop();
>   },
> });
> ```

### Try it

1. Two buddies start one after the other, and the first one wakes up twice. What is the second one's `wakes`?
2. Each script should pick a name for its buddy. Does `name` go in `BuddyCtx` or in `privateCtx`?

> [!MORE] Answer
> 1. Zero. `privateCtx` runs once for every `start`, so each buddy gets numbers of its own.
> 2. In `BuddyCtx`. The script hands it in, like the light. `privateCtx` is for what only the machine uses.

## 13. Designing your own

You have built a whole buddy. How would you start on a machine of your own? The same way, in seven steps:

1. **List the modes.** What can this thing be doing? Each one is a state. The buddy has `asleep`, `waking`, `awake` and `resting`.
2. **List what can happen.** Pokes, bumps, messages, timeouts. Each is an event or an `after`.
3. **Draw the arrows.** For each state, which events move it, and where?
4. **Look for groups.** States that share arrows can live inside a parent, the way `wander` and `follow` share `awake`'s poke and bump.
5. **Add conditions last.** `when` and `run` handle the "it depends" cases, like a bump that may or may not tire the buddy out.
6. **Plan cleanup.** Whatever a state starts, its `exit` should stop. `waking` starts a fade, so `waking` cancels it.
7. **Split the data.** What a script hands in goes in the context. What only the machine uses goes in `privateCtx`.

### Common beginner mistakes

- Forgetting to call `update(dt)`, so timers never fire.
- Forgetting `initial` on a state that has children.
- Writing `"resting"` when you meant `"/resting"`. Every path starts with `/`.
- Expecting `send()` inside a hook to happen instantly.
- Cleaning up anywhere other than `exit`.
- Starting the machine at the top of a script file instead of in `init`.

### Try it

1. Design a machine for a coin. It bobs until the player touches it, plays a one-second sparkle, and is then gone. Name its states, its events and its cleanup.

> [!MORE] Answer
> 1. States: `bobbing`, `collected` and `gone`. Events: a `trigger_response` from the player, and a `DONE` that the sparkle's `task` hands to `finish`. Cleanup: `collected` cancels the sparkle in its `exit`, in case the coin is deleted halfway through.
