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

That's a state machine. The buddy is always in exactly one **state**: `asleep` or `awake`. Pressing `POKE` sends an **event**, and a **transition** rule moves the buddy to the other state. The glowing box is the state it's in right now, the drawing shows the buddy in that state, and the log shows each step as it happens. A filled button is an event the buddy takes right now. An outlined one still sends its event, and the log says what became of it. The buddy hops when it takes an event, or jolts if that event is a bump, and shows a question mark at one nobody takes.

This page grows that buddy one idea at a time. By the end it wanders, greets you, follows you, gets tired and charges at a dock, and it is still one machine in one file.

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
> 1. Nobody handles it, so it is ignored, and the buddy shows a question mark. `asleep` has no rule for `SEE_PLAYER` and no parent to ask.
> 2. Wandering. Entering `awake` starts at its `initial`, whatever the buddy was doing before. [Lesson 15](#15-remember-where-you-were) shows how to change that.

## 5. Conditions and side effects

Now the buddy wanders and follows. A robot that bumps into things should lose a little energy with each bump, and stop to rest when it runs out.

That's new. One event, a bump, now has **two** possible outcomes. How does the machine pick one?

Two tools handle "it depends":

- **`when`** is a yes/no question. If the answer is no, that rule is skipped.
- **`run`** is code that runs when a rule is used, such as changing your data.

<div data-hsm-demo="buddy-energy"></div>

Wake the buddy and give it a small bump. Which rule lights up, what does the buddy do, and what happens to `ctx.energy`?

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

The buddy rests when it's tired, but in the game nothing shows it. Let's give it a **light** that is on while it's awake.

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
        ctx.energy = Math.min(3, ctx.energy + dt); // [!code ++]
        return ctx.energy >= 3 ? "/awake" : undefined; // [!code ++]
      }, // [!code ++]
      on: {
        RECHARGE: {
```

- **`after: { 4: "/awake/wander" }`**: four seconds after it starts to follow, the buddy gives up and wanders.
- **`after: { 30: "/asleep" }`** on `awake`: half a minute awake, and it nods off.
- **`update`** on `resting` adds each frame's `dt` to the battery, and `Math.min` keeps it from going past 3. Once it's full the hook returns `"/awake"` and the buddy gets up. Until then it returns `undefined`, and the buddy keeps resting.

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

> [!WARNING] **Always clean up in exit.** `exit` runs however a state ends, including when the machine is stopped, so it's a reliable place to cancel animations, timers and requests.

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

It stays there, by the way. This diagram starts with its clock paused, and [lesson 8](#8-time-and-every-frame-checks) told you what that means: no `update` runs, so the fade waits. Press "Resume time" when you want the buddy to finish waking.

### What stop leaves behind

Now press "stop()". That is what the script's `final` does when the buddy's game object is deleted.

Every active state exits, innermost first, so the `exit` hooks run and the light goes off. After that `path` is `undefined`, and events do nothing at all.

### Try it

1. Press "start() with wakes = 1". What is different in the log?
2. Pause time, start with `wakes` at 0 again, then poke the buddy while it is waking. Where does it end up, and why?
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
>         ctx.energy = Math.min(3, ctx.energy + dt);
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

## 13. Watch it run

The diagrams have shown you every move the buddy makes. They were drawn for this page, though, and your buddy has outgrown them: it has a script, timers, a fade and messages now.

Wouldn't it be nice to watch **your own file** run like that?

You can. The toolchain has a viewer named `hsm-view`. Point it at the file with the machine in it:

```sh
bunx @defold-typescript/cli hsm-view src/buddy-machine.ts
```

It prints an address. Open that in your browser, and there is your code, exactly as you wrote it, with the buddy's current state tinted.

| On the page | What it does |
| --- | --- |
| **Start** | Starts a buddy. Type its starting data first: `{ light: "#light" }`. |
| The event buttons | One for each event the buddy can take right now. An event with data, like `BUMP`, reads it from the payload field: `{ cost: 1 }`. |
| **Play** and **Step** | Play lets time run. Step moves it forward by one `dt`. |
| The ctx panel | Shows the buddy's data, `wakes` and `energy` included. |
| The log | Lists every event, every move and every Defold call. |

Here is the catch. There is no Defold in your browser, so calls like `msg.post` and `go.animate` are written to the log and do nothing more. Who ends the fade, then? You do: press `WOKEN`, and you are playing the engine's part.

### In the real game

A browser is fine for trying things out. What about the buddy in the running game? One more import lets it report on itself:

```ts step title="buddy.ts"
import { defineScript } from "@defold-typescript/types";
import { inspect } from "@defold-typescript/types/hsm/debug"; // [!code ++]
import { buddyEvents, buddyMachine } from "./buddy-machine";
// ...
    msg.post("#light", "disable");
    return { // [!code --]
      buddy: buddyMachine.start({ light: msg.url("#light") }), // [!code --]
    }; // [!code --]
    const buddy = buddyMachine.start({ light: msg.url("#light") }); // [!code ++]
    return { buddy, inspector: inspect(buddy, "buddy") }; // [!code ++]
  },
  update(self, dt) {
    self.buddy.update(dt);
    self.inspector.draw("."); // [!code ++]
  },
```

- **`inspect(buddy, "buddy")`** prints a line to the console for every move the buddy makes: where it was, where it went, and why.
- **`inspector`** is what `inspect` hands back. The script keeps it on `self`, next to the buddy.
- **`self.inspector.draw(".")`** writes the buddy's current state above its game object, every frame. The `"."` means "this object".

The console then reads something like this:

```text
hsm buddy frame 0: inspecting [/waking]
hsm buddy frame 60: /waking -> /awake/wander (WOKEN: /waking, 0) [/awake/wander]
```

Both calls do nothing in a release build, so you can leave them in. [Debug a machine](./state-machines.md#debug-a-machine) explains every part of a line, and [`hsm-view`](./hsm-view.md) has a page of its own.

Some of the lessons ahead still have a diagram. **Every "Try it" is yours to run in `hsm-view`.**

### Try it

1. Start the buddy in `hsm-view` and keep your hands off. Which state is tinted, and why doesn't it move on?
2. Press `WOKEN`, then Play, and send `BUMP` with `{ cost: 3 }`. What does `energy` do in the ctx panel?

> [!MORE] Answer
> 1. `/waking`. The buddy poked itself on the way into `asleep`, as in [lesson 11](#11-one-thing-at-a-time), and now it waits for a fade that only the log knows about. Press `WOKEN` to finish it.
> 2. It drops to 0 and then climbs back to 3 over three seconds, while `resting`'s `update` hook adds each frame's `dt`. Then the hook returns `"/awake"`, and the buddy is up again.

## 14. Decide at once

Now that you can watch, try something. Wake the buddy, send `BUMP` with `{ cost: 2.5 }`, and poke it to sleep. Then poke it awake again.

It gets up with half a unit left in its battery, and the first small bump sends it straight to rest. Shouldn't a buddy that low on energy skip getting up and go rest instead?

So waking has to end in a **decision**: rest, or get up. Which state makes it? `waking` is there for the fade. In `awake` the light is already on, and that's too late.

Give the decision a state of its own. It needs no event and no timer, because it never waits. A state can hold rules that are tried **the moment it is entered**, and the key for them is **`always`**.

```ts step title="buddy-machine.ts"
      on: { WOKEN: "/awake", POKE: "/asleep" }, // [!code --]
      on: { WOKEN: "/checkup", POKE: "/asleep" }, // [!code ++]
    },
    checkup: { // [!code ++]
      always: [ // [!code ++]
        { to: "/resting", when: (ctx) => ctx.energy < 1 }, // [!code ++]
        { // [!code ++]
          to: "/awake", // [!code ++]
          run: (ctx) => { // [!code ++]
            ctx.wakes += 1; // [!code ++]
          }, // [!code ++]
        }, // [!code ++]
      ], // [!code ++]
    }, // [!code ++]
    awake: {
      initial: "/awake/wander",
      enter: (ctx) => { // [!code --]
        ctx.wakes += 1; // [!code --]
        msg.post(ctx.light, "enable"); // [!code --]
      }, // [!code --]
      enter: (ctx) => msg.post(ctx.light, "enable"), // [!code ++]
      exit: (ctx) => msg.post(ctx.light, "disable"),
// ...
    resting: {
      update: (ctx, dt) => {
        ctx.energy = Math.min(3, ctx.energy + dt);
        return ctx.energy >= 3 ? "/awake" : undefined; // [!code --]
        return ctx.energy >= 3 ? "/checkup" : undefined; // [!code ++]
      },
      on: {
        RECHARGE: {
          to: "/awake", // [!code --]
          to: "/checkup", // [!code ++]
```

- **`WOKEN: "/checkup"`**: the end of the fade no longer leads straight to `awake`. It leads to the new state.
- **`always: [ ... ]`** is a list of rules with no event. The machine tries them as soon as `checkup` is entered, top to bottom, and takes the first that passes. Less than 1 in the battery means `/resting`. Anything else means `/awake`.
- **`run`** on the second rule counts the wake-up, and `awake`'s `enter` is back to one line. A rule's `run` only runs when that rule is taken, so a buddy sent off to rest isn't counted.
- **`"/checkup"`** shows up twice more, in `resting`. A rested buddy passes the same check on its way up.

Here is the buddy with its checkup. Give it a bump of cost 2.5, poke it to sleep and poke it again. Which rule lights up when the fade ends?

<div data-hsm-demo="buddy-checkup"></div>

The buddy never stays in `checkup`. By the time `send` returns, it has gone in and out again. So how do you know it was ever there? Read the log: it shows `checkup` entered and left again in one step.

> [!NOTE] **Checked after a move, not every frame.** The machine looks at `always` when a move has just ended. A number that changes later, in a `run` or an `update` hook, goes unnoticed until the next move. To watch a value every frame, return a path from an `update` hook, as `resting` does.

For the full rules, see [Move on at once with `always`](./state-machines.md#move-on-at-once-with-always).

### Try it

1. In `hsm-view`, wake the buddy, send `BUMP` with `{ cost: 2.5 }`, press `POKE` twice and then `WOKEN`. Where does the buddy end up, and what is `wakes`?
2. Why does the second rule have no `when`?

> [!MORE] Answer
> 1. In `/resting`, with `wakes` still at 1. `checkup` finds 0.5 in the battery, so the first rule passes, and the `run` that counts belongs to the second rule.
> 2. So that one rule always passes. If every rule had a `when` and none of them passed, the buddy would sit in `checkup` with nothing to move it on.

## 15. Remember where you were

The buddy follows you, bumps into a wall and has to rest. A few seconds later it is up again. What is it doing?

Wandering. Entering `awake` starts at its `initial`, as you saw in [lesson 4](#4-states-inside-states). That's a pity, because it was in the middle of following you.

Can a state remember which child it was in? It can, and it takes one line: **`restoreDepth`**.

```ts step title="buddy-machine.ts"
    awake: {
      restoreDepth: 1, // [!code ++]
      initial: "/awake/wander",
      enter: (ctx) => msg.post(ctx.light, "enable"),
```

- **`restoreDepth: 1`** makes `awake` remember which child was active when the buddy left, and go back to that child the next time it is entered.
- **`initial`** stays. The first time the buddy gets up there is nothing to remember yet, so it starts in `wander`.

Make the buddy follow you, give it a bump of cost 3 and wait. Which child is it in when it gets up?

<div data-hsm-demo="buddy-memory"></div>

Why the `1`? It says how many levels down to remember. The children of `awake` have no children of their own, so one level is all there is.

### A place, not a moment

What exactly comes back? Only **which** child. `follow` is entered afresh: its timer starts from zero, and the buddy follows you for a full four seconds.

It doesn't matter how the buddy left, either. Tired out, poked to sleep, nodded off after thirty seconds: `awake` remembers the child in every case.

For the full rules, see [Resume with history](./state-machines.md#resume-with-history).

### Try it

1. In `hsm-view`, wake the buddy and send `trigger_response` with `{ enter: true }`. Then send `BUMP` with `{ cost: 3 }` and press Play. Which state is the buddy in when it gets up?
2. Take `restoreDepth` out, save, and do the same. What changed? Put the line back afterward.
3. A brand-new buddy wakes up for the very first time. Which child does it start in?

> [!MORE] Answer
> 1. `/awake/follow`. It was following when it ran out of energy, and `awake` remembered.
> 2. It gets up in `/awake/wander`. Without the key, every entry of `awake` starts at `initial`.
> 3. `wander`. There is nothing to remember yet, so `initial` decides.

## 16. Something every second

So far the battery only drains when the buddy bumps into something. A real robot uses energy just by being switched on.

How would you take a little energy away every second while the buddy is awake? An `after` timer fires once per stay. An `update` hook runs every frame, and you'd have to count the seconds yourself.

There is a key for exactly this: **`every`**.

```ts step title="buddy-machine.ts"
      exit: (ctx) => msg.post(ctx.light, "disable"),
      after: { 30: "/asleep" },
      every: { // [!code ++]
        1: (_ctx, machine) => machine.send({ type: "BUMP", cost: 1 / 16 }), // [!code ++]
      }, // [!code ++]
      on: {
        POKE: "/asleep",
```

- **`every: { 1: ... }`** runs its function each time another second has passed while `awake` is active. The first run comes one second after the buddy gets up.
- **`machine.send({ type: "BUMP", cost: 1 / 16 })`**: the buddy gives itself a very small bump. Why send an event, when `ctx.energy -= 1 / 16` is shorter? Because the `BUMP` rules from [lesson 5](#5-conditions-and-side-effects) already know what to do when the battery runs out.
- **`(_ctx, machine)`**: the function gets the context and the running machine, like a hook. This one only needs the machine.

A sixteenth each second: a full battery lasts 48 seconds of being awake.

Here is the buddy with its drain. Watch the bar on the `every 1 s` line fill up and start over. What does the log say each time it is full?

<div data-hsm-demo="buddy-drain"></div>

### A run is not a move

Nothing exits and nothing enters when the function runs. The buddy stays exactly where it is, and `awake`'s clock keeps counting toward its thirty seconds.

And the event it sends? It waits its turn, just like the poke in [lesson 11](#11-one-thing-at-a-time).

For the full rules, see [Repeat while a state is active](./state-machines.md#repeat-while-a-state-is-active).

### Try it

1. In `hsm-view`, wake the buddy and press Play. What does `energy` show after four seconds?
2. Pause, set `dt` to 10 and press Step once. How many sixteenths does the buddy lose?
3. The buddy is asleep. Does its battery drain?

> [!MORE] Answer
> 1. 2.75. Four runs, a sixteenth each.
> 2. One. However long a frame was, `every` runs once in it. A game that stalls for a moment doesn't empty the battery all at once.
> 3. No. `every` is written on `awake`, and it only runs while `awake` is active.

## 17. Delays that read the context

Look at the delays in your file: 4 seconds, 30 seconds, 1 second. Every one is a number you typed in.

What if a delay should depend on how the buddy is doing? A buddy that has run after you all afternoon should nap longer than a fresh one.

Can a delay come out of the context? It can. `after` and `every` each have a second way of being written, **a list**, where every entry carries a `delay`. And a `delay` can be a function.

Start with the nap:

```ts step title="buddy-machine.ts"
  privateCtx: () => ({ wakes: 0, energy: 3 }), // [!code --]
  privateCtx: () => ({ wakes: 0, energy: 3, napSeconds: 2 }), // [!code ++]
// ...
        follow: {
          after: { 4: "/awake/wander" }, // [!code --]
          after: { // [!code ++]
            4: { // [!code ++]
              to: "/awake/wander", // [!code ++]
              run: (ctx) => { // [!code ++]
                ctx.napSeconds = Math.min(5, ctx.napSeconds + 1); // [!code ++]
              }, // [!code ++]
            }, // [!code ++]
          }, // [!code ++]
          on: {
// ...
    resting: {
      update: (ctx, dt) => {
        ctx.energy = Math.min(3, ctx.energy + dt);
        return ctx.energy >= 3 ? "/checkup" : undefined; // [!code --]
        return undefined; // [!code ++]
      },
      after: [ // [!code ++]
        { // [!code ++]
          delay: (ctx) => ctx.napSeconds, // [!code ++]
          to: "/checkup", // [!code ++]
          when: (ctx) => ctx.energy >= 3, // [!code ++]
          run: (ctx) => { // [!code ++]
            ctx.napSeconds = 2; // [!code ++]
          }, // [!code ++]
        }, // [!code ++]
      ], // [!code ++]
      on: {
        RECHARGE: {
```

- **`napSeconds: 2`** is how long the next nap lasts. Only the machine uses it, so it lives in `privateCtx`.
- **`4: { to, run }`**: a timer takes a rule object where it took a path, the way an event does. When `follow` gives up after four seconds, its `run` makes the next nap a second longer, up to five.
- **`delay: (ctx) => ctx.napSeconds`**: in the list form the delay sits inside the entry, and here it is a function. The machine calls it when `resting` is entered and waits that long.
- **`when: (ctx) => ctx.energy >= 3`**: a timer can have a condition too. Once the delay has passed, the rule still needs a full battery.

Two smaller things ride along. The nap rule's own `run` sets `napSeconds` back to 2, because a buddy that had its whole nap is fresh again. And the `update` hook of `resting` now returns `undefined` every time: it still fills the battery, but getting up is the timer's job.

### A timer that waits for its condition

What happens when the two seconds are over and the battery isn't full yet? The timer doesn't give up. **The machine asks its `when` again on every `update`**, until the answer is yes or the buddy leaves the state.

So a nap lasts at least `napSeconds`, and as long as the battery needs. Whichever takes longer.

Give this buddy a bump of cost 3 and watch the timer line in `resting`. What does it say between two seconds and three?

<div data-hsm-demo="buddy-nap"></div>

### When the delay is read

The machine reads a delay function **once, each time the state is entered**, right after the state's `enter` hook. That stay keeps its delay, whatever happens to the number meanwhile.

The same goes for `every`. Let's use it to save power:

```ts step title="buddy-machine.ts"
      after: { 30: "/asleep" },
      every: { // [!code --]
        1: (_ctx, machine) => machine.send({ type: "BUMP", cost: 1 / 16 }), // [!code --]
      }, // [!code --]
      every: [ // [!code ++]
        { // [!code ++]
          delay: (ctx) => (ctx.energy < 2 ? 2 : 1), // [!code ++]
          run: (_ctx, machine) => machine.send({ type: "BUMP", cost: 1 / 16 }), // [!code ++]
        }, // [!code ++]
      ], // [!code ++]
      on: {
        POKE: "/asleep",
```

- **`every: [ ... ]`** is the list form again: each entry is a `delay` and the `run` it repeats.
- **`delay: (ctx) => (ctx.energy < 2 ? 2 : 1)`**: a buddy that gets up with less than 2 in its battery takes it easy. It uses energy every two seconds, not every second.

For the full rules, see [A delay that reads the context](./state-machines.md#a-delay-that-reads-the-context) and [Rules on a timer](./state-machines.md#rules-on-a-timer).

### Try it

1. In `hsm-view`, wake the buddy, send `BUMP` with `{ cost: 3 }` and press Play. The nap is two seconds long. When does the buddy get up?
2. Wake a new buddy and let it give up following twice: send `trigger_response` with `{ enter: true }`, wait four seconds, and do it again. Then tire it out. How long is this nap?
3. A buddy gets up with 2.5 in its battery, and ten seconds later it holds less than 2. How often does it use energy now?

> [!MORE] Answer
> 1. After three seconds. At two the timer is due, but the battery holds 2 and `when` says no, so the entry glows dimly in `hsm-view` while it waits. A second later the battery is full and the rule is taken.
> 2. Four seconds. Each time `follow` gave up, `napSeconds` went up by one. The battery is full after three seconds, and this time it is the delay that keeps the buddy down.
> 3. Still every second. The delay was read when `awake` was entered, with 2.5 in the battery, and it holds for the whole stay.

## 18. Wait for several things

A buddy that wakes up should say so. Let's play a chirp while its light fades in.

Now `waking` starts **two** things, and it should move on when **both** are done. But `finish` only counts the first time it is called. Which of the two callbacks gets to call it?

Neither. You count the jobs, and call `finish` when the count is back at zero. The counter is called a **`waitGroup`**.

```ts step title="buddy-machine.ts"
import { defineMachine } from "@defold-typescript/types/hsm"; // [!code --]
import { defineMachine, waitGroup } from "@defold-typescript/types/hsm"; // [!code ++]
// ...
    waking: {
      task: (ctx, finish) => {
        const group = waitGroup(); // [!code ++]
        go.set(ctx.light, "tint.w", 0);
        msg.post(ctx.light, "enable");
        go.animate(ctx.light, "tint.w", go.PLAYBACK_ONCE_FORWARD, 1, go.EASING_LINEAR, 1, 0, () => { // [!code --]
          finish({ type: "WOKEN" }); // [!code --]
        }); // [!code --]
        go.animate(ctx.light, "tint.w", go.PLAYBACK_ONCE_FORWARD, 1, go.EASING_LINEAR, 1, 0, group.add()); // [!code ++]
        sound.play("#chirp", {}, group.add()); // [!code ++]
        group.wait(() => finish({ type: "WOKEN" })); // [!code ++]
        return () => { // [!code ++]
          go.cancel_animations(ctx.light, "tint.w"); // [!code ++]
          sound.stop("#chirp"); // [!code ++]
          msg.post(ctx.light, "disable"); // [!code ++]
        }; // [!code ++]
      },
      exit: (ctx) => { // [!code --]
        go.cancel_animations(ctx.light, "tint.w"); // [!code --]
        msg.post(ctx.light, "disable"); // [!code --]
      }, // [!code --]
      on: { WOKEN: "/checkup", POKE: "/asleep" },
```

- **`waitGroup()`** makes a counter for work that is still going on.
- **`group.add()`** counts one job and hands back the function that reports it done. It goes where the callback used to go: once for the fade, once for the chirp.
- **`group.wait(...)`** runs its function once every job has reported. Only then does `finish` send `WOKEN`.
- **`return () => { ... }`**: a task can hand back its own cleanup. The machine calls it on every way out of the state, just as it called `exit`, so the `exit` hook is gone.

Which one is done first, the fade or the chirp? It doesn't matter. That's the whole point of counting.

Here is the buddy in `waking`. Its clock is paused, and the readout says two jobs are pending. Press "Resume time". Which job reports first, and when does the buddy move on?

<div data-hsm-demo="buddy-chirp"></div>

> [!NOTE] **`wait` goes last.** Call `group.wait` after every `add`. A group with nothing to wait for calls back at once.

### exit, or the function a task returns?

Both run however the state ends, a stopped machine included. Pick the one that reads better.

A task that starts something and stops it again keeps both halves in one place when it returns the cleanup. A state with no task still has `exit`.

For the full rules, see [Wait for something to finish](./state-machines.md#wait-for-something-to-finish).

### Try it

1. In `hsm-view`, start a buddy and read the log. Which two Defold calls is `waking` waiting on, and how do you get past them?
2. In the game, the chirp is shorter than the one-second fade. When does the buddy move on?
3. You poke the buddy halfway through the fade, and the chirp would have ended a moment later. Does the buddy wake up?

> [!MORE] Answer
> 1. `go.animate` and `sound.play`. Neither reports back in the browser, so press `WOKEN` to play the engine's part.
> 2. When the fade ends. The group waits for the slowest job.
> 3. No. The cleanup stops the chirp and cancels the fade. And if a report still came in, `waking` has been left: a late `finish` is ignored, as in [lesson 9](#9-waiting-for-things-to-finish).

## 19. A scripted routine

When the buddy spots you, it starts to follow at once. A friendly robot would say hello first: a chirp, two blinks of its light, and then off it goes.

That's a little script. Do this, wait, do that, wait. You could build it from states and timers, with one state for every step, and two blinks alone would take four of them.

Wouldn't it be easier to write the steps from top to bottom, the way you'd say them out loud? That's what **`sequence`** is for.

```ts step title="buddy-machine.ts"
import { defineMachine, waitGroup } from "@defold-typescript/types/hsm";
import { sequence } from "@defold-typescript/types/hsm/async"; // [!code ++]
import { type MessageEvent, messageEvents } from "@defold-typescript/types/hsm/defold";
// ...
  | { type: "WOKEN" }
  | { type: "GREETED" } // [!code ++]
  | { type: "BUMP"; cost: number }
// ...
            trigger_response: {
              to: "/awake/follow", // [!code --]
              to: "/awake/greeting", // [!code ++]
              when: (_ctx, event) => event.enter,
            },
          },
        },
        greeting: { // [!code ++]
          task: sequence(async (ctx, signal) => { // [!code ++]
            await new Promise<void>((resolve) => sound.play("#chirp", {}, () => resolve())); // [!code ++]
            if (signal.aborted) return; // [!code ++]
            for (let blink = 0; blink < 2; blink++) { // [!code ++]
              msg.post(ctx.light, "disable"); // [!code ++]
              await signal.wait(0.2); // [!code ++]
              msg.post(ctx.light, "enable"); // [!code ++]
              await signal.wait(0.2); // [!code ++]
            } // [!code ++]
            return { type: "GREETED" }; // [!code ++]
          }), // [!code ++]
          exit: () => sound.stop("#chirp"), // [!code ++]
          on: { GREETED: "/awake/follow" }, // [!code ++]
        }, // [!code ++]
        follow: {
```

- **`sequence(async (ctx, signal) => { ... })`** turns a function into a `task`. The steps run in order, and each `await` pauses the routine while the rest of the game carries on.
- **`await signal.wait(0.2)`** pauses for a fifth of a second. If the buddy leaves `greeting` in the meantime, the wait never ends, and the lines after it never run.
- **`if (signal.aborted) return;`**: waiting for the chirp is not a `signal.wait`, so it can end after the buddy has left. By then `signal.aborted` is `true`, and the routine stops before it touches the light.
- **`return { type: "GREETED" }`**: the event a sequence returns is sent to the machine, the way `finish` sends one. Here it leads on to `follow`.

`wander` now goes to `greeting` when you walk in, and `follow` comes after the hello.

Here is the buddy with its hello. Press `trigger_response (enter true)` and watch the list in `greeting`. Which step is marked while the light is off? The diagram plays Defold's timer with its own clock, so pausing it holds the routine too.

<div data-hsm-demo="buddy-greeting"></div>

### Cleanup in a sequence

Leaving the state cancels the wait that is pending. That's the sequence's own cleanup, and you get it for free.

Anything else the routine started is still yours to stop, and the place is `exit`: here it stops the chirp. **Never put cleanup after an `await`.** By the time that line would run, the buddy may be somewhere else entirely.

> [!NOTE] **A clock of its own.** `signal.wait` counts real time with a Defold timer, not the `dt` you pass to `update`. In `hsm-view` there is no such timer, so press `GREETED` to end the routine yourself.

For the full rules, see [Scripted sequences](./state-machines.md#scripted-sequences).

### Try it

1. In `hsm-view`, wake the buddy and send `trigger_response` with `{ enter: true }`. Which state is tinted, and which call does the log show?
2. In the game, you walk in and straight out again while the buddy greets you. Does it still follow?
3. The buddy runs out of energy in the middle of its greeting, rests, and gets up. What does it do first?

> [!MORE] Answer
> 1. `/awake/greeting`, and the log shows `sound.play`. The routine is waiting for the chirp to end, which never happens in the browser. Press `GREETED` to move on.
> 2. Yes. Neither `greeting` nor `awake` has a rule for `trigger_response`, so walking out is ignored. The routine ends, the buddy follows, and four seconds later it gives up.
> 3. It greets you again. `awake` remembers `greeting` as the child it left, and entering a state starts its task from the top.

## 20. Two things at once

A resting buddy fills its battery. It should also *show* that it's resting: blink its light slowly, on and off, until the battery is full.

Blinking takes two states, `shown` and `hidden`. Filling takes two as well: `filling` and `full`. So which of the four is a resting buddy in?

**Two of them at once.** The battery doesn't care what the light is doing, and the light only wants to know when the battery is done.

Remember the rule from [lesson 4](#4-states-inside-states), one active state at each level? It has one exception, and you ask for it by name: a state marked **`parallel`** keeps *all* its children active together.

First the battery:

```ts step title="buddy-machine.ts"
    resting: {
      update: (ctx, dt) => { // [!code --]
        ctx.energy = Math.min(3, ctx.energy + dt); // [!code --]
        return undefined; // [!code --]
      }, // [!code --]
      type: "parallel", // [!code ++]
      after: [
// ...
        RECHARGE: {
          to: "/checkup",
          run: (ctx) => {
            ctx.energy = 3;
          },
        },
      },
      states: { // [!code ++]
        battery: { // [!code ++]
          initial: "/resting/battery/filling", // [!code ++]
          states: { // [!code ++]
            filling: { // [!code ++]
              update: (ctx, dt) => { // [!code ++]
                ctx.energy = Math.min(3, ctx.energy + dt); // [!code ++]
                return ctx.energy >= 3 ? "/resting/battery/full" : undefined; // [!code ++]
              }, // [!code ++]
            }, // [!code ++]
            full: {}, // [!code ++]
          }, // [!code ++]
        }, // [!code ++]
      }, // [!code ++]
    },
  },
});
```

- **`type: "parallel"`** makes every child of `resting` active at the same time. Each child is called a **region**, and each region has a current state of its own.
- **`battery`** is the first region. The refill hook moved into its `filling` state, and when the battery is full it returns `"/resting/battery/full"`: a move inside the region.
- **No `initial` on `resting`**: there is nothing to choose. Every region is entered, and each region's own `initial` says where it starts.

Then the light:

```ts step title="buddy-machine.ts"
            full: {},
          },
        },
        lamp: { // [!code ++]
          initial: "/resting/lamp/shown", // [!code ++]
          exit: (ctx) => msg.post(ctx.light, "disable"), // [!code ++]
          states: { // [!code ++]
            shown: { // [!code ++]
              enter: (ctx) => msg.post(ctx.light, "enable"), // [!code ++]
              after: { // [!code ++]
                0.5: { // [!code ++]
                  to: "/resting/lamp/hidden", // [!code ++]
                  when: (_ctx, machine) => !machine.matches("/resting/battery/full"), // [!code ++]
                }, // [!code ++]
              }, // [!code ++]
            }, // [!code ++]
            hidden: { // [!code ++]
              enter: (ctx) => msg.post(ctx.light, "disable"), // [!code ++]
              after: { 0.5: "/resting/lamp/shown" }, // [!code ++]
            }, // [!code ++]
          }, // [!code ++]
        }, // [!code ++]
      },
    },
  },
});
```

- **`lamp`** is the second region. `shown` and `hidden` hand the light back and forth every half second.
- **`when: (_ctx, machine) => ...`**: a `when` gets the running machine as well, and can ask it which states are active. Once `battery` is in `full`, the timer in `shown` keeps waiting, and the light stays on.
- **`exit`** on `lamp` hides the light when the buddy leaves `resting`, whichever of the two states it was in.

Look at what you didn't have to write. The battery knows nothing about the light. **Each region minds its own business**, and one `when` is the only place where they meet.

### Where is the buddy now?

`path` has room for one state, and a resting buddy is in two. So `path` gives you the first region's state, and regions are ordered by name: `battery` comes before `lamp`.

For the whole picture there is **`leaves`**, a list with one path per region:

```text
/resting/battery/filling
/resting/lamp/shown
```

`matches` says yes for every active state in every region, and `inspect` prints all the leaves between its square brackets.

### Events and regions

An event is offered to every region, and each one may take it. `resting`'s own rules, like `RECHARGE`, only get the event when no region took it.

Here is the buddy with its two regions. Once it's awake, press `BUMP (cost 3)` and count the glowing boxes inside `resting`. Then press `RECHARGE` and read the log: who is asked before `resting`? For a nap that outlasts the battery, press `start() with napSeconds = 5` and tire the buddy out again.

<div data-hsm-demo="buddy-regions"></div>

For the full rules, see [Run regions side by side with `parallel`](./state-machines.md#run-regions-side-by-side-with-parallel).

> [!MORE] The whole file so far
>
> ```ts step title="buddy-machine.ts"
> import { defineMachine, waitGroup } from "@defold-typescript/types/hsm";
> import { sequence } from "@defold-typescript/types/hsm/async";
> import { type MessageEvent, messageEvents } from "@defold-typescript/types/hsm/defold";
>
> interface BuddyCtx {
>   light: Url;
> }
>
> type BuddyEvent =
>   | { type: "POKE" }
>   | { type: "WOKEN" }
>   | { type: "GREETED" }
>   | { type: "BUMP"; cost: number }
>   | { type: "RECHARGE" }
>   | MessageEvent<"trigger_response">;
>
> export const buddyMachine = defineMachine<BuddyCtx, BuddyEvent>()({
>   privateCtx: () => ({ wakes: 0, energy: 3, napSeconds: 2 }),
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
>         const group = waitGroup();
>         go.set(ctx.light, "tint.w", 0);
>         msg.post(ctx.light, "enable");
>         go.animate(ctx.light, "tint.w", go.PLAYBACK_ONCE_FORWARD, 1, go.EASING_LINEAR, 1, 0, group.add());
>         sound.play("#chirp", {}, group.add());
>         group.wait(() => finish({ type: "WOKEN" }));
>         return () => {
>           go.cancel_animations(ctx.light, "tint.w");
>           sound.stop("#chirp");
>           msg.post(ctx.light, "disable");
>         };
>       },
>       on: { WOKEN: "/checkup", POKE: "/asleep" },
>     },
>     checkup: {
>       always: [
>         { to: "/resting", when: (ctx) => ctx.energy < 1 },
>         {
>           to: "/awake",
>           run: (ctx) => {
>             ctx.wakes += 1;
>           },
>         },
>       ],
>     },
>     awake: {
>       restoreDepth: 1,
>       initial: "/awake/wander",
>       enter: (ctx) => msg.post(ctx.light, "enable"),
>       exit: (ctx) => msg.post(ctx.light, "disable"),
>       after: { 30: "/asleep" },
>       every: [
>         {
>           delay: (ctx) => (ctx.energy < 2 ? 2 : 1),
>           run: (_ctx, machine) => machine.send({ type: "BUMP", cost: 1 / 16 }),
>         },
>       ],
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
>               to: "/awake/greeting",
>               when: (_ctx, event) => event.enter,
>             },
>           },
>         },
>         greeting: {
>           task: sequence(async (ctx, signal) => {
>             await new Promise<void>((resolve) => sound.play("#chirp", {}, () => resolve()));
>             if (signal.aborted) return;
>             for (let blink = 0; blink < 2; blink++) {
>               msg.post(ctx.light, "disable");
>               await signal.wait(0.2);
>               msg.post(ctx.light, "enable");
>               await signal.wait(0.2);
>             }
>             return { type: "GREETED" };
>           }),
>           exit: () => sound.stop("#chirp"),
>           on: { GREETED: "/awake/follow" },
>         },
>         follow: {
>           after: {
>             4: {
>               to: "/awake/wander",
>               run: (ctx) => {
>                 ctx.napSeconds = Math.min(5, ctx.napSeconds + 1);
>               },
>             },
>           },
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
>       type: "parallel",
>       after: [
>         {
>           delay: (ctx) => ctx.napSeconds,
>           to: "/checkup",
>           when: (ctx) => ctx.energy >= 3,
>           run: (ctx) => {
>             ctx.napSeconds = 2;
>           },
>         },
>       ],
>       on: {
>         RECHARGE: {
>           to: "/checkup",
>           run: (ctx) => {
>             ctx.energy = 3;
>           },
>         },
>       },
>       states: {
>         battery: {
>           initial: "/resting/battery/filling",
>           states: {
>             filling: {
>               update: (ctx, dt) => {
>                 ctx.energy = Math.min(3, ctx.energy + dt);
>                 return ctx.energy >= 3 ? "/resting/battery/full" : undefined;
>               },
>             },
>             full: {},
>           },
>         },
>         lamp: {
>           initial: "/resting/lamp/shown",
>           exit: (ctx) => msg.post(ctx.light, "disable"),
>           states: {
>             shown: {
>               enter: (ctx) => msg.post(ctx.light, "enable"),
>               after: {
>                 0.5: {
>                   to: "/resting/lamp/hidden",
>                   when: (_ctx, machine) => !machine.matches("/resting/battery/full"),
>                 },
>               },
>             },
>             hidden: {
>               enter: (ctx) => msg.post(ctx.light, "disable"),
>               after: { 0.5: "/resting/lamp/shown" },
>             },
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
> import { inspect } from "@defold-typescript/types/hsm/debug";
> import { buddyEvents, buddyMachine } from "./buddy-machine";
>
> const TOUCH = hash("touch");
>
> export default defineScript({
>   init() {
>     msg.post(".", "acquire_input_focus");
>     msg.post("#light", "disable");
>     const buddy = buddyMachine.start({ light: msg.url("#light") });
>     return { buddy, inspector: inspect(buddy, "buddy") };
>   },
>   update(self, dt) {
>     self.buddy.update(dt);
>     self.inspector.draw(".");
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

1. In `hsm-view`, wake the buddy, send `BUMP` with `{ cost: 3 }` and press Play. Which states are tinted?
2. Wake a new buddy and change `napSeconds` to 5 in the ctx panel before you tire it out. What does the light do in the last second of the nap?

> [!MORE] Answer
> 1. `resting`, both regions, and one state inside each: `filling`, and `shown` or `hidden` taking turns.
> 2. It stays on. The battery is full after three seconds, so `battery` sits in `full` and the `when` in `shown` says no. The nap rule on `resting` gets the buddy up at five.

## 21. Name a group of states

Give the buddy's game object a small label named `hint` that says "poke me". When should it show?

Not while the buddy is waking up, because it's in the middle of something. Not while it rests, because a poke does nothing there. So the script would ask `matches("/waking")`, and then `matches("/resting")`, and one day you'd add a third state and have to find every place that asks.

`waking` and `resting` have something in common, and yet they share no parent. Can a group of states have a name without living in the same folder? It can. The name is called a **tag**.

```ts step title="buddy-machine.ts"
export const buddyMachine = defineMachine<BuddyCtx, BuddyEvent>()({ // [!code --]
export const buddyMachine = defineMachine<BuddyCtx, BuddyEvent, "busy">()({ // [!code ++]
// ...
    waking: {
      tags: ["busy"], // [!code ++]
      task: (ctx, finish) => {
// ...
    resting: {
      type: "parallel",
      tags: ["busy"], // [!code ++]
      after: [
```

```ts step title="buddy.ts"
    self.buddy.update(dt);
    self.inspector.draw(".");
    label.set_text("#hint", self.buddy.hasTag("busy") ? "" : "poke me"); // [!code ++]
  },
```

- **`"busy"`**, the third type in `defineMachine<...>`, lists the tag names this machine may use. For more than one, write `"busy" | "sleepy"`.
- **`tags: ["busy"]`** hangs the name on a state. It holds while that state is active, children included: all of `resting`, in both regions.
- **`self.buddy.hasTag("busy")`** asks whether any active state carries the tag. The script names no state at all.

Here is the buddy with its tag. Time starts paused and the buddy is in `waking`: what does `hasTag("busy")` say? Press "Resume time" and watch the answer change when the buddy gets up. Then tire it out with `BUMP (cost 3)`.

<div data-hsm-demo="buddy-busy"></div>

Why not a flag? You could set `ctx.busy = true` in every `enter` and back to `false` in every `exit`. And you'd be right back in [lesson 1](#1-why-bother), with a flag that can disagree with the state. **A tag can't disagree. It is read straight off the active states.**

A tag is only a name. It has no rules and no hooks, so behavior that states share still goes on a parent.

For the full rules, see [Name a group of states with tags](./state-machines.md#name-a-group-of-states-with-tags).

### Try it

1. Start the buddy in `hsm-view` and look at the tinted state in your code. Is the buddy busy? Press `WOKEN`: and now?
2. You add a state named `charging`, and the hint should hide there too. What do you change in `buddy.ts`?
3. You type `hasTag("bussy")` by mistake. What happens?

> [!MORE] Answer
> 1. Yes, then no. The buddy starts in `/waking`, which carries the tag. `checkup`, `awake` and `wander` don't.
> 2. Nothing. Give the new state `tags: ["busy"]`, and the script's question already covers it.
> 3. It doesn't compile. Only the names listed in `defineMachine<...>` are accepted, in `tags` and in `hasTag` alike.

## 22. Events nobody took

Walk past a resting buddy and nothing happens. Its trigger tells it you're there, the buddy has no rule for that while it rests, and the event is ignored, as you saw in [lesson 4](#4-states-inside-states).

From the outside, though, "the buddy ignored you" looks exactly like "the game is broken". Wouldn't a little beep be friendlier?

You could add a rule for every event the buddy doesn't want. There is a shorter way: one hook that runs for **any** event nobody took.

```ts step title="buddy-machine.ts"
    resting: {
      type: "parallel",
      tags: ["busy"],
      unhandled: () => sound.play("#beep"), // [!code ++]
      after: [
```

- **`unhandled`** runs each time the machine ignores an event while `resting` is active, whatever the event is.

The beep changes nothing else. The event is still ignored, and the buddy stays where it is. **The hook reacts. It doesn't take the event.**

### Asking first

A tap is different. Your script decides to send that poke, so it can ask before it sends:

```ts step title="buddy.ts"
  on_input(self, action_id, action) {
    if (action_id === TOUCH && action.pressed) { // [!code --]
    if (action_id === TOUCH && action.pressed && self.buddy.can({ type: "POKE" })) { // [!code ++]
      self.buddy.send({ type: "POKE" });
```

- **`self.buddy.can({ type: "POKE" })`** answers a question: is there a rule, in some active state, that would take this event right now? Any `when` is checked too.

Asking is free. No hook runs, no `run` runs, and nothing moves. A resting buddy says no, so the tap sends nothing, and there is nothing to beep about.

So the two work as a pair. `can` is for the events **you** choose to send. `unhandled` is for the ones that simply arrive.

Here is the buddy with its beep. Tire it out with `BUMP (cost 3)`, then press `trigger_response (enter true)`: the log names the hook, and `beeps` goes up. The readout asks `can` for you. A button sends its event either way, so the buddy also beeps at a `POKE` that your script would have held back.

<div data-hsm-demo="buddy-beep"></div>

For the full rules, see [React to an unhandled event](./state-machines.md#react-to-an-unhandled-event) and [Ask whether an event would be taken](./state-machines.md#ask-whether-an-event-would-be-taken).

### Try it

1. In `hsm-view`, tire the buddy out and look at the event buttons. Is there a `POKE`? What would `can({ type: "POKE" })` say?
2. In the game, you walk up to a resting buddy. What do you hear, and does the buddy move?
3. An awake buddy has 1 left in its battery. What does `can({ type: "BUMP", cost: 0.5 })` say? The rule that would take it has no `to`.

> [!MORE] Answer
> 1. No button, and `can` says `false`. `hsm-view` offers one button for each event that an active state has a rule for, and nothing in `resting` has a rule for `POKE`.
> 2. A beep, and no. The `trigger_response` is ignored, so `unhandled` runs, and nothing exits or enters.
> 3. `true`. The first `BUMP` rule's `when` says no, but the second rule always passes. A rule with no `to` still takes its event.

## 23. Listen from outside

`inspect` prints a line for every move. How does it know? It isn't part of the buddy's machine, and no state calls it.

It **listens**. A running machine tells anyone who asks about each move and each ignored event, and your script can ask the same way. You might play a sound on every move, count moves for an award, or keep a log of your own.

Let's keep a log:

```ts step title="buddy.ts"
    const buddy = buddyMachine.start({ light: msg.url("#light") });
    buddy.onMove((from, to, cause) => { // [!code ++]
      print(`buddy: ${from} -> ${to} (${cause}), now in ${buddy.path}`); // [!code ++]
    }); // [!code ++]
    buddy.onUnhandled((event) => { // [!code ++]
      print(`buddy dropped ${event.type} in ${buddy.path}`); // [!code ++]
      pprint(buddy.ctx); // [!code ++]
    }); // [!code ++]
    return { buddy, inspector: inspect(buddy, "buddy") };
```

- **`buddy.onMove(...)`** calls your function after every move, with the state the buddy left, the state it entered, and the cause: an event, a timer, an `update` hook or an `always` rule.
- **`buddy.path`** is where the buddy is by the time you're called.
- **`buddy.onUnhandled(...)`** calls your function with each event the machine ignored, after the buddy's own `unhandled` hooks.
- **`pprint(buddy.ctx)`** prints the buddy's data next to it.

Remember "hidden, not locked" from [lesson 12](#12-the-machines-own-data)? Here you can see it. `pprint` prints `wakes`, `energy` and `napSeconds` along with the light, because at run time they all sit in one table. Type `buddy.ctx.energy`, though, and it doesn't compile.

### What a listener hears

- **Not the first entry.** A new buddy's way into its first state is not a move.
- **Not a rule with no `to`.** A small bump changes the battery and moves nothing.
- **Each region on its own.** While the buddy rests, every blink of `lamp` is a move from `shown` to `hidden` or back. `to` is the lamp's new state, and `path` still names the battery's.

Each `onMove` and `onUnhandled` call hands back a function. Call it, and that listener is removed.

Here is the buddy with both listeners. The second list holds what they printed, without the `pprint`. Tire the buddy out with `BUMP (cost 3)` and watch the lamp: every blink is a move, and `path` keeps naming the battery's state. Then press `trigger_response (enter true)`: the buddy beeps first, and your listener hears the drop after it.

<div data-hsm-demo="buddy-listen"></div>

For everything a running machine offers, see [`MachineInstance`](./state-machines.md#machineinstance).

### Try it

1. In `hsm-view`, wake the buddy and send `BUMP` with `{ cost: 1 }`. How many moves does the log show?
2. Your listener prints `to` and `buddy.path`. When are the two different?
3. In the game, the buddy has just nodded off after its thirty seconds, and your log says it dropped a `BUMP`. Where did that come from?

> [!MORE] Answer
> 1. None. The small bump uses the rule with no `to`: the log shows the event, and no move follows it.
> 2. While the buddy rests. A blink moves the `lamp` region, so `to` is `/resting/lamp/hidden` or `/resting/lamp/shown`, and `path` stays with `battery`, the first region.
> 3. From `awake`'s own `every`. Its thirtieth run sent a `BUMP` in the same `update` that put the buddy to sleep. The event waited its turn, and by then nobody was awake to take it.

## 24. Keep going after a hot reload

You change a number in `buddy-machine.ts` and save. With [hot reload](./watch.md#hot-reload) on, Defold runs the changed file again while the game keeps going. That builds a new machine.

But your buddy is already running, and it was started from the **old** one. How does a buddy that is halfway across the room get the new rules?

Give the machine a name:

```ts step title="buddy-machine.ts"
export const buddyMachine = defineMachine<BuddyCtx, BuddyEvent, "busy">()({ // [!code --]
export const buddyMachine = defineMachine<BuddyCtx, BuddyEvent, "busy">("buddy")({ // [!code ++]
  privateCtx: () => ({ wakes: 0, energy: 3, napSeconds: 2 }),
```

- **`("buddy")`** is a key: a name for this definition. It goes in the first pair of parentheses, the one that has been empty since [lesson 3](#3-your-first-machine).

When the file runs again, `defineMachine` finds the machine it built under that key the first time and puts the new states into it. Every running buddy picks them up on its next `update`.

And the buddy itself? **It stays where it is.** It keeps its `ctx`, and it keeps its state, as long as that state still exists in the new file.

Two things to remember:

- **One key per machine.** Two machines with the same key would overwrite each other on every reload.
- **Define it at the top of a module**, never inside `init`, so it runs once each time the file loads.

`hsm-view` reloads the same way when you save, so you can try it right now.

For the full rules, see [Hot reload](./state-machines.md#hot-reload).

### Try it

1. In `hsm-view`, wake the buddy and get it to `follow`. Now change `follow`'s `4` to `10` in your editor and save. Where is the buddy after the reload?
2. Take the key out and do the same. What is different?
3. With the key back in, rename `follow` to `chase`, in its name and in every path that points at it, and save while the buddy follows. Where does it go?

> [!MORE] Answer
> 1. Still in `/awake/follow`, with its data untouched. The new delay holds from now on.
> 2. The buddy starts over, as a new buddy would. Without a key, the saved file builds a machine that no running buddy belongs to.
> 3. To `/awake/wander`. Its state is gone, so it moves to the closest parent that still exists, `awake`, and enters from that parent's `initial`.

## 25. Save and load

The player quits while the buddy is resting. The next day the game starts, and the buddy is asleep, pokes itself and wakes up as if nothing had happened.

Shouldn't it come back where it was? What would you have to write down to make that work?

Where it is. And you already know the word for that: **`leaves`**.

```ts step title="buddy.ts"
const TOUCH = hash("touch");
const SAVE_FILE = sys.get_save_file("my_game", "buddy"); // [!code ++]
type BuddyPath = NonNullable<ReturnType<typeof buddyMachine.start>["path"]>; // [!code ++]
// ...
    msg.post("#light", "disable");
    const buddy = buddyMachine.start({ light: msg.url("#light") }); // [!code --]
    const save = sys.load(SAVE_FILE) as { at?: BuddyPath[] }; // [!code ++]
    const buddy = buddyMachine.start({ light: msg.url("#light") }, save.at); // [!code ++]
    buddy.onMove((from, to, cause) => {
// ...
  final(self) {
    sys.save(SAVE_FILE, { at: [...self.buddy.leaves] }); // [!code ++]
    self.buddy.stop();
```

- **`sys.save(SAVE_FILE, { at: [...self.buddy.leaves] })`** writes the active states to a file as the buddy's object goes away. The `[...]` makes a copy: `leaves` is one list that the machine keeps changing, and `stop()` on the next line empties it.
- **`sys.load(SAVE_FILE)`** reads the file back. No save yet? Then `save.at` is `undefined`, and the buddy starts the way it always did.
- **`start(..., save.at)`**: the second thing `start` takes is a list of paths to start at.
- **`BuddyPath`** means "any path of this machine". The line reads that off the machine, so you never list the paths by hand.

### What comes back

Starting at saved paths is an ordinary start. `enter` hooks run from the outside in, tasks start, and every timer begins at zero. A buddy saved in `resting` starts a new nap.

Only the **states** were saved. `privateCtx` runs as it does for any new buddy, so the battery is full and `wakes` is 0 again. That data is yours to save too, if your game needs it.

And an old save? If a path names a state you have since removed, the buddy starts in the closest parent that still exists.

For the full rules, see [Start at saved paths](./state-machines.md#start-at-saved-paths).

### Try it

1. In `hsm-view`, tire the buddy out. Which paths would `leaves` hold right now?
2. A save holds `/resting/battery/full` and `/resting/lamp/hidden`. What does the loaded buddy do in its first three seconds?
3. A save holds `/awake/follow`. The loaded buddy runs out of energy and rests. Which child of `awake` is it in when it gets up?

> [!MORE] Answer
> 1. Two: `/resting/battery/filling`, and `/resting/lamp/shown` or `/resting/lamp/hidden`. One path per region, the innermost tinted state of each.
> 2. Its light comes on after half a second and stays on, because `battery` is in `full`. Two seconds in, the nap rule finds the battery full and gets the buddy up.
> 3. `follow`. It started there, so that is the child `awake` was left from, and `restoreDepth` brings it back.

## 26. A second machine

The buddy fills its own battery, slowly. Let's build it a **charging dock**: the buddy asks for a charge, the dock takes two seconds, and then it tells the buddy the battery is full.

The dock is a game object of its own, with states of its own: `idle` and `charging`. Do they go into the buddy's machine, as one more region?

No. A region is a part of the buddy. The dock is a different thing, on a different object, and tomorrow it might serve three buddies. **A second thing gets a second machine.**

How do two machines talk? The way any two game objects do, and you know it from [lesson 10](#10-messages-from-defold): with messages.

### The dock

Make a file named `dock-machine.ts`:

```ts step title="dock-machine.ts"
import { defineMachine } from "@defold-typescript/types/hsm";
import { type MessageEvent, messageEvents } from "@defold-typescript/types/hsm/defold";

declare global {
  interface CustomMessages {
    charge_me: {};
    charged: {};
  }
}

interface DockCtx {
  customer?: Url;
}

type DockEvent = MessageEvent<"charge_me">;

export const dockMachine = defineMachine<DockCtx, DockEvent>("dock")({
  initial: "/idle",
  states: {
    idle: {
      on: {
        charge_me: {
          to: "/charging",
          run: (ctx, event) => {
            ctx.customer = event.sender;
          },
        },
      },
    },
    charging: {
      after: {
        2: {
          to: "/idle",
          run: (ctx) => {
            if (ctx.customer !== undefined) msg.post(ctx.customer, "charged");
          },
        },
      },
    },
  },
});

export const dockEvents = messageEvents(["charge_me"]);
```

- **`declare global { ... }`** tells TypeScript about two messages of your own, `charge_me` and `charged`. Neither carries any data, so each is `{}`.
- **`MessageEvent<"charge_me">`** makes the first one an event, just like the buddy's `trigger_response`.
- **`event.sender`**: every message event knows who sent it. The dock keeps that address in `ctx.customer`.
- **`2: { to, run }`**: two seconds later the dock goes back to `idle`, and the rule's `run` posts `charged` to whoever asked.

Its script, `dock.ts`, has the same shape as the buddy's:

```ts step title="dock.ts"
import { defineScript } from "@defold-typescript/types";
import { inspect } from "@defold-typescript/types/hsm/debug";
import { dockEvents, dockMachine } from "./dock-machine";

export default defineScript({
  init() {
    const dock = dockMachine.start({});
    return { dock, inspector: inspect(dock, "dock") };
  },
  update(self, dt) {
    self.dock.update(dt);
    self.inspector.draw(".");
  },
  on_message(self, message_id, message, sender) {
    const event = dockEvents.toEvent(message_id, message, sender);
    if (event !== undefined) {
      self.dock.send(event);
    }
  },
  final(self) {
    self.dock.stop();
  },
});
```

### The buddy asks

```ts step title="buddy-machine.ts"
interface BuddyCtx {
  light: Url;
  dock: Url; // [!code ++]
}
// ...
  | { type: "BUMP"; cost: number }
  | { type: "RECHARGE" } // [!code --]
  | MessageEvent<"trigger_response">; // [!code --]
  | MessageEvent<"trigger_response" | "charged">; // [!code ++]
// ...
      tags: ["busy"],
      enter: (ctx) => msg.post(ctx.dock, "charge_me"), // [!code ++]
      unhandled: () => sound.play("#beep"),
// ...
      on: {
        RECHARGE: { // [!code --]
        charged: { // [!code ++]
          to: "/checkup",
// ...
export const buddyEvents = messageEvents(["trigger_response"]); // [!code --]
export const buddyEvents = messageEvents(["trigger_response", "charged"]); // [!code ++]
```

```ts step title="buddy.ts"
    const save = sys.load(SAVE_FILE) as { at?: BuddyPath[] };
    const buddy = buddyMachine.start({ light: msg.url("#light") }, save.at); // [!code --]
    const buddy = buddyMachine.start({ light: msg.url("#light"), dock: msg.url("/dock#dock") }, save.at); // [!code ++]
```

- **`dock: Url`** joins `BuddyCtx`, and the script hands in the address of the dock's script: an object named `dock` with a script component named `dock`.
- **`enter`** on `resting` posts `charge_me` on the way in.
- **`charged`** takes the place of `RECHARGE`, in the event list and in `resting`'s rules. The made-up event has become a real message.
- **`messageEvents([..., "charged"])`**: the translator passes the new message on to the machine.

Follow one round trip. The buddy runs out of energy, enters `resting` and posts `charge_me`. The dock moves to `charging` and remembers who asked. Two seconds later it posts `charged`, and the buddy passes through `checkup` and gets up, a second before its own battery would have been full.

**Neither file imports the other.** The buddy knows the dock by an address. The dock knows the buddy only as the sender of a message, so it works for any object that asks.

And if no dock answers? The buddy still has its own battery region and its nap. Aren't you glad you kept them?

For the full rules, see [Separate objects talk with messages](./state-machines.md#separate-objects-talk-with-messages).

> [!MORE] The whole file so far
>
> ```ts step title="buddy-machine.ts"
> import { defineMachine, waitGroup } from "@defold-typescript/types/hsm";
> import { sequence } from "@defold-typescript/types/hsm/async";
> import { type MessageEvent, messageEvents } from "@defold-typescript/types/hsm/defold";
>
> interface BuddyCtx {
>   light: Url;
>   dock: Url;
> }
>
> type BuddyEvent =
>   | { type: "POKE" }
>   | { type: "WOKEN" }
>   | { type: "GREETED" }
>   | { type: "BUMP"; cost: number }
>   | MessageEvent<"trigger_response" | "charged">;
>
> export const buddyMachine = defineMachine<BuddyCtx, BuddyEvent, "busy">("buddy")({
>   privateCtx: () => ({ wakes: 0, energy: 3, napSeconds: 2 }),
>   initial: "/asleep",
>   states: {
>     asleep: {
>       enter: (ctx, machine) => {
>         if (ctx.wakes === 0) machine.send({ type: "POKE" });
>       },
>       on: { POKE: "/waking" },
>     },
>     waking: {
>       tags: ["busy"],
>       task: (ctx, finish) => {
>         const group = waitGroup();
>         go.set(ctx.light, "tint.w", 0);
>         msg.post(ctx.light, "enable");
>         go.animate(ctx.light, "tint.w", go.PLAYBACK_ONCE_FORWARD, 1, go.EASING_LINEAR, 1, 0, group.add());
>         sound.play("#chirp", {}, group.add());
>         group.wait(() => finish({ type: "WOKEN" }));
>         return () => {
>           go.cancel_animations(ctx.light, "tint.w");
>           sound.stop("#chirp");
>           msg.post(ctx.light, "disable");
>         };
>       },
>       on: { WOKEN: "/checkup", POKE: "/asleep" },
>     },
>     checkup: {
>       always: [
>         { to: "/resting", when: (ctx) => ctx.energy < 1 },
>         {
>           to: "/awake",
>           run: (ctx) => {
>             ctx.wakes += 1;
>           },
>         },
>       ],
>     },
>     awake: {
>       restoreDepth: 1,
>       initial: "/awake/wander",
>       enter: (ctx) => msg.post(ctx.light, "enable"),
>       exit: (ctx) => msg.post(ctx.light, "disable"),
>       after: { 30: "/asleep" },
>       every: [
>         {
>           delay: (ctx) => (ctx.energy < 2 ? 2 : 1),
>           run: (_ctx, machine) => machine.send({ type: "BUMP", cost: 1 / 16 }),
>         },
>       ],
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
>               to: "/awake/greeting",
>               when: (_ctx, event) => event.enter,
>             },
>           },
>         },
>         greeting: {
>           task: sequence(async (ctx, signal) => {
>             await new Promise<void>((resolve) => sound.play("#chirp", {}, () => resolve()));
>             if (signal.aborted) return;
>             for (let blink = 0; blink < 2; blink++) {
>               msg.post(ctx.light, "disable");
>               await signal.wait(0.2);
>               msg.post(ctx.light, "enable");
>               await signal.wait(0.2);
>             }
>             return { type: "GREETED" };
>           }),
>           exit: () => sound.stop("#chirp"),
>           on: { GREETED: "/awake/follow" },
>         },
>         follow: {
>           after: {
>             4: {
>               to: "/awake/wander",
>               run: (ctx) => {
>                 ctx.napSeconds = Math.min(5, ctx.napSeconds + 1);
>               },
>             },
>           },
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
>       type: "parallel",
>       tags: ["busy"],
>       enter: (ctx) => msg.post(ctx.dock, "charge_me"),
>       unhandled: () => sound.play("#beep"),
>       after: [
>         {
>           delay: (ctx) => ctx.napSeconds,
>           to: "/checkup",
>           when: (ctx) => ctx.energy >= 3,
>           run: (ctx) => {
>             ctx.napSeconds = 2;
>           },
>         },
>       ],
>       on: {
>         charged: {
>           to: "/checkup",
>           run: (ctx) => {
>             ctx.energy = 3;
>           },
>         },
>       },
>       states: {
>         battery: {
>           initial: "/resting/battery/filling",
>           states: {
>             filling: {
>               update: (ctx, dt) => {
>                 ctx.energy = Math.min(3, ctx.energy + dt);
>                 return ctx.energy >= 3 ? "/resting/battery/full" : undefined;
>               },
>             },
>             full: {},
>           },
>         },
>         lamp: {
>           initial: "/resting/lamp/shown",
>           exit: (ctx) => msg.post(ctx.light, "disable"),
>           states: {
>             shown: {
>               enter: (ctx) => msg.post(ctx.light, "enable"),
>               after: {
>                 0.5: {
>                   to: "/resting/lamp/hidden",
>                   when: (_ctx, machine) => !machine.matches("/resting/battery/full"),
>                 },
>               },
>             },
>             hidden: {
>               enter: (ctx) => msg.post(ctx.light, "disable"),
>               after: { 0.5: "/resting/lamp/shown" },
>             },
>           },
>         },
>       },
>     },
>   },
> });
>
> export const buddyEvents = messageEvents(["trigger_response", "charged"]);
> ```
>
> ```ts step title="buddy.ts"
> import { defineScript } from "@defold-typescript/types";
> import { inspect } from "@defold-typescript/types/hsm/debug";
> import { buddyEvents, buddyMachine } from "./buddy-machine";
>
> const TOUCH = hash("touch");
> const SAVE_FILE = sys.get_save_file("my_game", "buddy");
> type BuddyPath = NonNullable<ReturnType<typeof buddyMachine.start>["path"]>;
>
> export default defineScript({
>   init() {
>     msg.post(".", "acquire_input_focus");
>     msg.post("#light", "disable");
>     const save = sys.load(SAVE_FILE) as { at?: BuddyPath[] };
>     const buddy = buddyMachine.start({ light: msg.url("#light"), dock: msg.url("/dock#dock") }, save.at);
>     buddy.onMove((from, to, cause) => {
>       print(`buddy: ${from} -> ${to} (${cause}), now in ${buddy.path}`);
>     });
>     buddy.onUnhandled((event) => {
>       print(`buddy dropped ${event.type} in ${buddy.path}`);
>       pprint(buddy.ctx);
>     });
>     return { buddy, inspector: inspect(buddy, "buddy") };
>   },
>   update(self, dt) {
>     self.buddy.update(dt);
>     self.inspector.draw(".");
>     label.set_text("#hint", self.buddy.hasTag("busy") ? "" : "poke me");
>   },
>   on_input(self, action_id, action) {
>     if (action_id === TOUCH && action.pressed && self.buddy.can({ type: "POKE" })) {
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
>     sys.save(SAVE_FILE, { at: [...self.buddy.leaves] });
>     self.buddy.stop();
>   },
> });
> ```

### Try it

1. Run `hsm-view` twice, once on each machine file, and put the two tabs side by side. Start the buddy with `{ light: "#light", dock: "dock" }` and tire it out. Now carry the messages yourself: which buttons do you press, and in which tab?
2. A second buddy asks for a charge while the dock is busy with the first. What happens to its message?
3. Why does the dock post to `event.sender` and not to an address it was started with?

> [!MORE] Answer
> 1. The buddy's log shows `charge_me` going out. In the dock's tab, press `charge_me` with `{ sender: "buddy" }`, then Play for two seconds, and its log shows `charged` going out. Back in the buddy's tab, press `charged`: the buddy passes `checkup` and gets up.
> 2. It is ignored, because `charging` has no rule for `charge_me`. The second buddy isn't stuck: its own battery fills, and its nap rule gets it up.
> 3. So that it needs to know nothing in advance. Any object that posts `charge_me` gets its answer, and the dock never has to be told who its buddies are.

## 27. Designing your own

You have built a whole buddy, and a dock to go with it. How would you start on a machine of your own? The same way, step by step:

1. **List the modes.** What can this thing be doing? Each one is a state. The buddy has `asleep`, `waking`, `checkup`, `awake` and `resting`.
2. **List what can happen.** Pokes, bumps, messages, timeouts. Each is an event, an `after` or an `every`.
3. **Draw the arrows.** For each state, which events move it, and where?
4. **Look for groups.** States that share arrows can live inside a parent, the way `wander` and `follow` share `awake`'s poke and bump. States that only share a name get a tag, like `busy`.
5. **Look for things that happen at once.** Parts that don't depend on each other become regions of a `parallel` state, like `battery` and `lamp`.
6. **Add conditions last.** `when` and `run` handle the "it depends" cases, like a bump that may or may not tire the buddy out. A state that only decides gets `always`, like `checkup`.
7. **Plan cleanup.** Whatever a state starts, its `exit` or the function its `task` returns should stop. `waking` starts a fade and a chirp, so `waking` stops both.
8. **Split the data.** What a script hands in goes in the context. What only the machine uses goes in `privateCtx`.
9. **Count the things.** One thing, one machine. A second object, like the dock, gets a machine of its own, and the two talk with messages.

### Common beginner mistakes

- Forgetting to call `update(dt)`, so timers never fire.
- Forgetting `initial` on a state that has children.
- Writing `"resting"` when you meant `"/resting"`. Every path starts with `/`.
- Expecting `send()` inside a hook to happen instantly.
- Cleaning up anywhere other than `exit` or the function a `task` returns, such as after an `await`.
- Starting the machine at the top of a script file instead of in `init`.
- Expecting `always` to watch a value every frame. It is checked after a move.
- Calling `group.wait` before the last `group.add`.
- Giving two machines the same hot reload key.
- Expecting a saved start to bring back timers or data. It brings back the states.

### Try it

1. Design a machine for a coin. It bobs until the player touches it, plays a one-second sparkle, and is then gone. Name its states, its events and its cleanup.

> [!MORE] Answer
> 1. States: `bobbing`, `collected` and `gone`. Events: a `trigger_response` from the player, and a `DONE` that the sparkle's `task` hands to `finish`. Cleanup: `collected` cancels the sparkle in its `exit`, in case the coin is deleted halfway through.
