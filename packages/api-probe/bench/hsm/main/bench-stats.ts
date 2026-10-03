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
  allocUpdates: number;
  allocSends: number;
  timedUpdates: number;
  timedSends: number;
  allocUpdateTransitions: number;
  allocSendTransitions: number;
  timedUpdateTransitions: number;
  timedSendTransitions: number;
  timedHeapProbes: number;
} = {
  phase: "warmup",
  updateSeconds: 0,
  sendSeconds: 0,
  updateKb: 0,
  sendKb: 0,
  updateAllocs: 0,
  sendAllocs: 0,
  allocUpdates: 0,
  allocSends: 0,
  timedUpdates: 0,
  timedSends: 0,
  allocUpdateTransitions: 0,
  allocSendTransitions: 0,
  timedUpdateTransitions: 0,
  timedSendTransitions: 0,
  timedHeapProbes: 0,
};
