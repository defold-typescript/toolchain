/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as quest from "quest.quest";

// Compile-only proof that the quest LuaLS golden is callable with the types
// upstream documents. No assertions execute; the `dts-declaration-validity`
// compile (skipLibCheck: false) is the gate.

// quest exports a function named `event` while importing the `event` type from
// `event.event`; a value import of that type would collide with this export and
// fail the golden under `isolatedModules`.
quest.event("kill", "enemy", 2);

const started: boolean = quest.start_quest("q1");
quest.complete_quest("q1");

// quest re-exports its internal event queue as a module field; the queue's own
// `subscribe` takes the handler alone.
const queued: boolean = quest.on_quest_event.subscribe((event_data: unknown) => {
  void event_data;
});

void started;
void queued;
