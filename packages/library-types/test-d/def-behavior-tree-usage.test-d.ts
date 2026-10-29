/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as BehaviorTree from "def_behavior_tree.behavior_tree";

// Compile-only proof for the def_behavior_tree fork, written as upstream's README builds
// and runs a tree. No assertions execute; the `dts-declaration-validity` compile is
// the gate.

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

interface Ship {
  health: number;
}

// A composite lists its children by registered name or inline; the task's payload is the
// one the tree is created with.
BehaviorTree.registerTemplates({
  TREES: {
    SHIP: {
      main_node: {
        type: BehaviorTree.Sequence,
        nodes: [
          "IS_ALIVE",
          { type: BehaviorTree.Task, run: (task, _payload: Ship) => task.success() },
        ],
      },
    },
  },
  NODES: {
    IS_ALIVE: {
      type: BehaviorTree.Task,
      run: (task, payload: Ship) => {
        if (payload.health > 0) task.success();
        else task.fail();
      },
    },
  },
});

// A decorator takes one child, and `chance` rides on any node a `RandomWithChances` lists.
BehaviorTree.registerTemplates({
  TREES: {
    ROAM: {
      main_node: {
        type: BehaviorTree.RandomWithChances,
        nodes: [
          { type: BehaviorTree.ChanceDecorator, chance: 30, node: "IS_ALIVE" },
          { type: BehaviorTree.Task, chance: 70, start: (task) => task.fail() },
        ],
      },
    },
  },
  NODES: {
    IS_ALIVE: { type: BehaviorTree.Task, run: (task) => task.success() },
  },
});

BehaviorTree.registerTemplates({
  TREES: {
    BAD: {
      // @ts-expect-error a composite takes `nodes`, not a decorator's single `node`
      main_node: { type: BehaviorTree.Sequence, node: "IS_ALIVE" },
    },
  },
  NODES: {
    IS_ALIVE: { type: BehaviorTree.Task, run: (task) => task.success() },
  },
});

BehaviorTree.registerTemplates({
  TREES: {
    BAD: {
      // @ts-expect-error a task has no children
      main_node: { type: BehaviorTree.Task, nodes: ["IS_ALIVE"] },
    },
  },
  NODES: {
    IS_ALIVE: { type: BehaviorTree.Task, run: (task) => task.success() },
  },
});

// A node is named by string only beside the `NODES` table that holds it: registering
// looks every string up there, at any depth.
BehaviorTree.registerTemplates({
  TREES: { ROOT: { main_node: "IS_ALIVE" } },
  NODES: {
    IS_ALIVE: { type: BehaviorTree.Task, run: (task) => task.success() },
  },
});

// @ts-expect-error a root named by string needs `NODES`
BehaviorTree.registerTemplates({
  TREES: { ROOT: { main_node: "IS_ALIVE" } },
});

BehaviorTree.registerTemplates({
  TREES: {
    LIST: { main_node: { type: BehaviorTree.Sequence, nodes: ["IS_ALIVE"] } },
  },
  NODES: {
    IS_ALIVE: { type: BehaviorTree.Task, run: (task) => task.success() },
  },
});

// @ts-expect-error a composite child named by string needs `NODES`
BehaviorTree.registerTemplates({
  TREES: {
    LIST: { main_node: { type: BehaviorTree.Sequence, nodes: ["IS_ALIVE"] } },
  },
});

BehaviorTree.registerTemplates({
  TREES: {
    NOT: { main_node: { type: BehaviorTree.InvertDecorator, node: "IS_ALIVE" } },
  },
  NODES: {
    IS_ALIVE: { type: BehaviorTree.Task, run: (task) => task.success() },
  },
});

// @ts-expect-error a decorator child named by string needs `NODES`
BehaviorTree.registerTemplates({
  TREES: {
    NOT: { main_node: { type: BehaviorTree.InvertDecorator, node: "IS_ALIVE" } },
  },
});

BehaviorTree.registerTemplates({
  TREES: {
    NESTED: {
      main_node: {
        type: BehaviorTree.Sequence,
        nodes: [{ type: BehaviorTree.InvertDecorator, node: "IS_ALIVE" }],
      },
    },
  },
  NODES: {
    IS_ALIVE: { type: BehaviorTree.Task, run: (task) => task.success() },
  },
});

// @ts-expect-error a nested child named by string needs `NODES`
BehaviorTree.registerTemplates({
  TREES: {
    NESTED: {
      main_node: {
        type: BehaviorTree.Sequence,
        nodes: [{ type: BehaviorTree.InvertDecorator, node: "IS_ALIVE" }],
      },
    },
  },
});

// A tree written wholly inline needs no `NODES`.
BehaviorTree.registerTemplates({
  TREES: {
    PATROL: {
      main_node: {
        type: BehaviorTree.RepeatUntilFailDecorator,
        node: {
          type: BehaviorTree.Selector,
          nodes: [
            {
              type: BehaviorTree.InvertDecorator,
              node: {
                type: BehaviorTree.Task,
                run: (task, payload: Ship) => {
                  if (payload.health > 0) task.fail();
                  else task.success();
                },
              },
            },
            { type: BehaviorTree.Task, start: (task) => task.success() },
          ],
        },
      },
    },
  },
});

// An explicit payload type reaches every task callback, named or inline.
BehaviorTree.registerTemplates<Ship>({
  TREES: { HURT: { main_node: "IS_HURT" } },
  NODES: {
    IS_HURT: {
      type: BehaviorTree.Task,
      run: (task, payload) => (payload.health < 3 ? task.success() : task.fail()),
    },
  },
});

BehaviorTree.registerTemplates<Ship>({
  TREES: {
    HURT_INLINE: {
      main_node: {
        type: BehaviorTree.Task,
        run: (task, payload) => (payload.health < 3 ? task.success() : task.fail()),
      },
    },
  },
});

const ship: Ship = { health: 3 };
const tree = BehaviorTree.new({ tree_name: "SHIP", payload: ship });
const _tree: Equal<typeof tree, BehaviorTree.BehaviorTree<Ship>> = true;
void _tree;

const running = tree.running;
const _running: Equal<typeof running, boolean> = true;
void _running;

// No node is active until the first run.
const activeId = tree.activeNode?.id;
const _activeId: Equal<typeof activeId, number | undefined> = true;
void _activeId;

tree.run();
tree.run(activeId);
tree.restart();
// @ts-expect-error a start node is named by its numeric id
tree.run("x");

const template = BehaviorTree.getTreeTemplate("SHIP");
const _template: Equal<typeof template, BehaviorTree.TreeNode[] | undefined> = true;
void _template;

const seeded = BehaviorTree.new({
  tree_name: "ROAM",
  rng: (range_start, range_end) => math.random(range_start, range_end),
});
const _seeded: Equal<typeof seeded, BehaviorTree.BehaviorTree<undefined>> = true;
void _seeded;
seeded.run();

const seededShip = BehaviorTree.new({
  tree_name: "SHIP",
  payload: ship,
  rng: (range_start, range_end) => math.random(range_start, range_end),
});
const _seededShip: Equal<typeof seededShip, BehaviorTree.BehaviorTree<Ship>> = true;
void _seededShip;

// A tree created without a payload hands its task callbacks `undefined`.
const bare = BehaviorTree.new({ tree_name: "ROAM" });
const _bare: Equal<typeof bare, BehaviorTree.BehaviorTree<undefined>> = true;
void _bare;

const unset = BehaviorTree.new({ tree_name: "ROAM", payload: undefined });
const _unset: Equal<typeof unset, BehaviorTree.BehaviorTree<undefined>> = true;
void _unset;

// @ts-expect-error a payload type needs a payload of that type
BehaviorTree.new<Ship>({ tree_name: "SHIP" });

// @ts-expect-error a tree created without a payload is not a tree over one
const forced: BehaviorTree.BehaviorTree<Ship> = BehaviorTree.new({ tree_name: "SHIP" });
void forced;
