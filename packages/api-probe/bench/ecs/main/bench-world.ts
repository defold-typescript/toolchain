import {
  addEntity,
  addSystem,
  processingSystem,
  refresh,
  requireAll,
  type World,
  world,
} from "@defold-typescript/types/ecs";

export interface BenchEntity {
  sum: number;
  c0?: number;
  c1?: number;
  c2?: number;
  c3?: number;
  c4?: number;
  c5?: number;
}

export interface BenchWorld {
  readonly world: World<BenchEntity>;
  /** Every entity built for the world, in or out of it, by index. */
  readonly entities: readonly BenchEntity[];
}

const COMPONENTS = ["c0", "c1", "c2", "c3", "c4", "c5"] as const;
const COMPONENTS_PER_ENTITY = 3;

export const benchStats = {
  processCalls: 0,
  adds: 0,
  removes: 0,
  heapProbes: 0,
};

export function resetBenchStats(): void {
  benchStats.processCalls = 0;
  benchStats.adds = 0;
  benchStats.removes = 0;
  benchStats.heapProbes = 0;
}

function createSystem(component: (typeof COMPONENTS)[number]) {
  return processingSystem<BenchEntity>()(requireAll(component), {
    process(entity, dt) {
      entity.sum += dt;
      benchStats.processCalls += 1;
    },
    onAdd() {
      benchStats.adds += 1;
    },
    onRemove() {
      benchStats.removes += 1;
    },
  });
}

// Entity `i` holds components `i % 6` to `(i + 2) % 6`, so it belongs to exactly
// 3 of the 6 systems. Entities before `firstLive` are built but left outside the
// world, and the membership is applied before the world is returned.
export function createBenchWorld(entityCount: number, firstLive = 0): BenchWorld {
  const target = world<BenchEntity>();
  for (const component of COMPONENTS) {
    addSystem(target, createSystem(component));
  }
  const entities: BenchEntity[] = [];
  for (let i = 0; i < entityCount; i++) {
    const entity: BenchEntity = { sum: 0 };
    for (let j = 0; j < COMPONENTS_PER_ENTITY; j++) {
      entity[COMPONENTS[(i + j) % COMPONENTS.length] as (typeof COMPONENTS)[number]] = 1;
    }
    entities.push(entity);
    if (i >= firstLive) addEntity(target, entity);
  }
  refresh(target);
  return { world: target, entities };
}
