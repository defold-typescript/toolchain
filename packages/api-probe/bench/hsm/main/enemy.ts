import { defineScript } from "@defold-typescript/types";
import { benchStats } from "./bench-stats";
import { enemyMachine } from "./enemy-machine";

const SPOT = { type: "SPOT" } as const;
const LOSE = { type: "LOSE" } as const;
const HIT = { type: "HIT" } as const;

// The witness counts rely on two hooks in enemy-machine.ts: approach's update
// adds 1 to ctx.ticks on every call, and alive's HIT either adds 1 to ctx.hits
// or moves to /dead.
const APPROACH = "/alive/chase/approach";
const DEAD = "/dead";

const SEND_EVERY = 20;

let spawned = 0;

export default defineScript({
  init() {
    spawned += 1;
    return {
      machine: enemyMachine.start({ ticks: 0, hits: 0, threshold: 10 + (spawned % 7) }),
      frame: spawned % SEND_EVERY,
      sent: 0,
    };
  },
  update(self, dt) {
    self.frame += 1;
    const sending = self.frame % SEND_EVERY === 0;
    const event = self.sent % 3 === 0 ? SPOT : self.sent % 3 === 1 ? HIT : LOSE;
    if (benchStats.phase === "alloc") {
      // A nonzero heap delta in either direction means the call allocated: with
      // the collector stopped only an allocation can move the count, and a
      // collection can only start from one. The count also takes in what the VM
      // allocates for itself (a JIT trace, a deeper Lua stack) the first time a
      // path runs, so the bench counts allocating calls rather than demanding
      // zero bytes.
      let path = self.machine.path;
      const ticks = self.machine.ctx.ticks;
      let kb0 = collectgarbage("count");
      self.machine.update(dt);
      let kb1 = collectgarbage("count");
      if (kb1 !== kb0) {
        benchStats.updateKb += math.abs(kb1 - kb0);
        benchStats.updateAllocs += 1;
      }
      benchStats.allocUpdateSlots += 1;
      if (path === APPROACH) {
        benchStats.allocApproachUpdates += 1;
        if (self.machine.ctx.ticks !== ticks + 1) benchStats.allocStalledUpdates += 1;
      }
      if (sending) {
        self.sent += 1;
        path = self.machine.path;
        const hits = self.machine.ctx.hits;
        kb0 = collectgarbage("count");
        self.machine.send(event);
        kb1 = collectgarbage("count");
        if (kb1 !== kb0) {
          benchStats.sendKb += math.abs(kb1 - kb0);
          benchStats.sendAllocs += 1;
        }
        benchStats.allocSendSlots += 1;
        if (event === HIT && path !== DEAD) {
          benchStats.allocAliveHits += 1;
          if (self.machine.ctx.hits === hits && self.machine.path === path) {
            benchStats.allocStalledHits += 1;
          }
        }
      }
      return;
    }

    if (benchStats.phase === "time") {
      let path = self.machine.path;
      const ticks = self.machine.ctx.ticks;
      let t0 = socket.gettime();
      self.machine.update(dt);
      let t1 = socket.gettime();
      benchStats.updateSeconds += t1 - t0;
      benchStats.timedUpdateSlots += 1;
      if (path === APPROACH) {
        benchStats.timedApproachUpdates += 1;
        if (self.machine.ctx.ticks !== ticks + 1) benchStats.timedStalledUpdates += 1;
      }
      if (sending) {
        self.sent += 1;
        path = self.machine.path;
        const hits = self.machine.ctx.hits;
        t0 = socket.gettime();
        self.machine.send(event);
        t1 = socket.gettime();
        benchStats.sendSeconds += t1 - t0;
        benchStats.timedSendSlots += 1;
        if (event === HIT && path !== DEAD) {
          benchStats.timedAliveHits += 1;
          if (self.machine.ctx.hits === hits && self.machine.path === path) {
            benchStats.timedStalledHits += 1;
          }
        }
      }
      return;
    }

    self.machine.update(dt);
    if (sending) {
      self.sent += 1;
      self.machine.send(event);
    }
  },
  final(self) {
    self.machine.stop();
  },
});
