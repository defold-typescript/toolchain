// Every game-object script runs in one Lua state, so this module table is
// shared by the controller and all enemies.
export const benchStats: {
  phase: "warmup" | "alloc" | "time" | "done";
  updateSeconds: number;
  sendSeconds: number;
  updateKb: number;
  sendKb: number;
  updateAllocs: number;
  sendAllocs: number;
  allocUpdateSlots: number;
  allocSendSlots: number;
  timedUpdateSlots: number;
  timedSendSlots: number;
  allocApproachUpdates: number;
  allocStalledUpdates: number;
  allocAliveHits: number;
  allocStalledHits: number;
  timedApproachUpdates: number;
  timedStalledUpdates: number;
  timedAliveHits: number;
  timedStalledHits: number;
  timedHeapProbes: number;
} = {
  phase: "warmup",
  updateSeconds: 0,
  sendSeconds: 0,
  updateKb: 0,
  sendKb: 0,
  updateAllocs: 0,
  sendAllocs: 0,
  allocUpdateSlots: 0,
  allocSendSlots: 0,
  timedUpdateSlots: 0,
  timedSendSlots: 0,
  allocApproachUpdates: 0,
  allocStalledUpdates: 0,
  allocAliveHits: 0,
  allocStalledHits: 0,
  timedApproachUpdates: 0,
  timedStalledUpdates: 0,
  timedAliveHits: 0,
  timedStalledHits: 0,
  timedHeapProbes: 0,
};
