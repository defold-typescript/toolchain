/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as Colyseus from "colyseus.sdk";

// Compile-only proof for the Colyseus client, written as the calls upstream's
// `example/main.script` makes. No assertions execute; `tsc --noEmit` under
// tsconfig.dts-check.json is the gate.

interface Item {
  name: string;
}

interface Player {
  x: number;
  y: number;
  disconnected: boolean;
  items: Item[];
}

interface MyRoomState {
  currentTurn: string;
  players: Record<string, Player>;
}

const client = Colyseus.Client("ws://localhost:2567");

client.join_or_create<MyRoomState>("my_room", (err, room) => {
  // @ts-expect-error `room` is unset when the join failed, so it is read only once narrowed.
  void room.room_id;

  if (err !== undefined || room === undefined) {
    const failed: Colyseus.MatchmakeError | undefined = err;
    void failed;
    return;
  }

  const room_id: string = room.room_id;
  void room_id;
  room.reconnection.min_uptime = 0;

  const callbacks = Colyseus.callbacks(room);

  callbacks.listen("currentTurn", (current, previous) => {
    void current;
    void previous;
  });

  callbacks.on_add("players", (player: Player, session_id: string) => {
    void session_id;

    callbacks.on_change(player, () => {});

    callbacks.listen(player, "x", (value: number, previous) => {
      const before: number | undefined = previous;
      void value;
      void before;
    });
    callbacks.listen(player, "y", (value: number, previous_value) => {
      void value;
      void previous_value;
    });
    callbacks.listen(player, "disconnected", (value: boolean) => {
      void value;
    });

    const remove = callbacks.on_add(player, "items", (item: Item, key: number) => {
      void item.name;
      void key;
    });
    remove();
    callbacks.on_remove(player, "items", (item: Item, key: number) => {
      void item;
      void key;
    });
  });

  callbacks.on_remove("players", (player: Player, session_id: string) => {
    void player;
    void session_id;
  });

  room.on("statechange", (state) => {
    const current: MyRoomState = state;
    void current;
  });

  room.on_message("weather", (message: { weather: string }) => {
    void message.weather;
  });

  room.on("error", (error) => {
    void error;
  });
  // @ts-expect-error one table arrives, so a `(code, message)` handler never receives a message.
  room.on("error", (code, message) => {
    void code;
    void message;
  });

  room.on("drop", () => {});

  // @ts-expect-error the room emits `reconnect`, never `reconnection`.
  room.on("reconnection", () => {});
  room.on("reconnect", (retry_count) => {
    const attempts: number = retry_count;
    void attempts;
  });

  room.on("leave", (code) => {
    void code?.code;
  });

  room.send("add_item", { name: "helmet" });
  room.send("add_bot");
  room.send("move", { x: 1, y: 2 });
  room.connection.close(Colyseus.protocol.CLOSE_CODE.MAY_TRY_RECONNECT);

  client.reconnect<MyRoomState>(room.reconnection_token, (reconnect_err, rejoined) => {
    void reconnect_err;
    void rejoined?.state.currentTurn;
  });
});

client.join_or_create("lobby", (err, lobby) => {
  if (err !== undefined || lobby === undefined) return;
  lobby.on_message("rooms", (rooms) => {
    void rooms;
  });
  lobby.on_message("+", (message) => {
    void message;
  });
  lobby.on_message("-", (room_id: string) => {
    void room_id;
  });
  lobby.on("leave", (code) => {
    void code;
  });
});

client.join_or_create("queue", {}, (err, queue) => {
  if (err !== undefined || queue === undefined) return;
  queue.on_message("clients", (clients: number) => {
    void clients;
  });
  queue.on_message("seat", (seat: Colyseus.SeatReservation) => {
    queue.send("confirm");
    client.consume_seat_reservation(seat, (seat_err, new_room) => {
      if (seat_err !== undefined || new_room === undefined) return;
      new_room.on("leave", (code) => {
        void code;
      });
      new_room.leave();
    });
  });
});

client.auth.token = "123";

client.http.get("/test", (err, response) => {
  const status: number | undefined = err?.status;
  void status;
  void response;
});

Colyseus.Client.select_by_latency(["ws://localhost:2567", "wss://example.com"], (err, best) => {
  const reason: string | undefined = err;
  const fastest: Colyseus.Client | undefined = best;
  void reason;
  void fastest;
});

client.get_latency((err, latency) => {
  void err;
  void latency;
});
client.get_latency(3, (err, latency) => {
  void err;
  void latency;
});

const may_try_reconnect: 4010 = Colyseus.protocol.CLOSE_CODE.MAY_TRY_RECONNECT;
void may_try_reconnect;

// @ts-expect-error a client is created for an endpoint, which the call cannot leave out.
Colyseus.Client();
