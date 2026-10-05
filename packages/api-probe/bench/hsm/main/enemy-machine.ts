import { defineMachine } from "@defold-typescript/types/hsm";

export interface EnemyCtx {
  ticks: number;
  hits: number;
  readonly threshold: number;
}

export type EnemyEvent = { type: "SPOT" } | { type: "LOSE" } | { type: "HIT" };

export const enemyMachine = defineMachine<EnemyCtx, EnemyEvent>()({
  initial: "/alive",
  states: {
    alive: {
      initial: "/alive/patrol",
      on: {
        HIT: [
          { to: "/dead", when: (ctx) => ctx.hits >= 2 },
          {
            run: (ctx) => {
              ctx.hits += 1;
            },
          },
        ],
      },
      states: {
        patrol: {
          initial: "/alive/patrol/walk",
          on: { SPOT: "/alive/chase" },
          states: {
            walk: { after: { 1: "/alive/patrol/idle" } },
            idle: { after: { 0.5: "/alive/patrol/walk" } },
          },
        },
        chase: {
          initial: "/alive/chase/approach",
          on: { LOSE: "/alive/patrol" },
          states: {
            approach: {
              enter: (ctx) => {
                ctx.ticks = 0;
              },
              update: (ctx) => {
                ctx.ticks += 1;
                return ctx.ticks >= ctx.threshold ? "/alive/chase/attack" : undefined;
              },
            },
            attack: { after: { 0.25: "/alive/chase/approach" } },
          },
        },
      },
    },
    dead: {
      enter: (ctx) => {
        ctx.hits = 0;
      },
      after: { 0.5: "/alive" },
    },
  },
});
