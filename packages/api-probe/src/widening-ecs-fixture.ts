// The entity type and predicate filters the widening gate checks the ECS API
// with. The gate's call check imports them beside the calls it builds.
import "@defold-typescript/types";

export * as ecs from "@defold-typescript/types/ecs";

export type Ent = { position: Vector3; velocity?: Vector3; frozen?: true; label?: string };

// Asserts every component `K` names at once, so a union `K` claims them all.
export declare function narrowBoth<K extends "velocity" | "frozen">(
  k: K,
): (system: unknown, e: Ent) => e is Ent & Required<Pick<Ent, K>>;

// Asserts one alternative per component `K` names.
export declare function narrowEach<K extends "velocity" | "frozen">(
  k: K,
): (system: unknown, e: Ent) => e is K extends unknown ? Ent & Required<Pick<Ent, K>> : never;
