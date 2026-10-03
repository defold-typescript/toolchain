// Every game-object script runs in one Lua state, so this module table is
// shared by the controller and all enemies.
export const benchStats = {
  measuring: false,
  updateSeconds: 0,
  sendSeconds: 0,
  updateKb: 0,
  sendKb: 0,
  updateAllocs: 0,
  sendAllocs: 0,
  sends: 0,
};
