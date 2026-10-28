/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as BehaviorTree from "def_behavior_tree.behavior_tree";

// Compile-only proof for the def_behavior_tree fork, written as upstream's README builds
// and runs a tree. No assertions execute; tsc --noEmit under tsconfig.dts-check.json is
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
});

BehaviorTree.registerTemplates({
  TREES: {
    BAD: {
      // @ts-expect-error a composite takes `nodes`, not a decorator's single `node`
      main_node: { type: BehaviorTree.Sequence, node: "IS_ALIVE" },
    },
  },
});

BehaviorTree.registerTemplates({
  TREES: {
    BAD: {
      // @ts-expect-error a task has no children
      main_node: { type: BehaviorTree.Task, nodes: ["IS_ALIVE"] },
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
seeded.run();
