export type MessageEvent<K extends MessageId> = K extends MessageId
  ? { readonly type: K; readonly sender: Url } & Omit<MessagePayload<K>, "type" | "sender">
  : never;

/** @noSelf */
export interface MessageEventMapper<K extends MessageId> {
  readonly toEvent: (
    message_id: Hash,
    message: Record<string | number, unknown>,
    sender: Url,
  ) => MessageEvent<K> | undefined;
}

export function messageEvents<const K extends MessageId>(ids: readonly K[]): MessageEventMapper<K> {
  const hashes: Hash[] = [];
  for (let i = 0; i < ids.length; i++) {
    hashes[i] = hash(ids[i] as K);
  }
  return {
    toEvent: (message_id, message, sender) => {
      for (let i = 0; i < hashes.length; i++) {
        if (hashes[i] === message_id) {
          return copyEvent(ids[i] as K, message, sender) as MessageEvent<K>;
        }
      }
      return undefined;
    },
  };
}

export interface MonarchTransitionIds {
  readonly SCREEN_TRANSITION_IN_STARTED: Hash;
  readonly SCREEN_TRANSITION_IN_FINISHED: Hash;
  readonly SCREEN_TRANSITION_OUT_STARTED: Hash;
  readonly SCREEN_TRANSITION_OUT_FINISHED: Hash;
  readonly SCREEN_TRANSITION_FAILED: Hash;
}

export type MonarchEvent =
  | MonarchInEvent<"monarch_screen_transition_in_started">
  | MonarchInEvent<"monarch_screen_transition_in_finished">
  | MonarchOutEvent<"monarch_screen_transition_out_started">
  | MonarchOutEvent<"monarch_screen_transition_out_finished">
  | {
      readonly type: "monarch_screen_transition_failed";
      readonly screen: Hash;
      readonly sender: Url;
    };

interface MonarchInEvent<T extends string> {
  readonly type: T;
  readonly screen: Hash;
  readonly previous_screen?: Hash;
  readonly sender: Url;
}

interface MonarchOutEvent<T extends string> {
  readonly type: T;
  readonly screen: Hash;
  readonly next_screen?: Hash;
  readonly sender: Url;
}

/** @noSelf */
export interface MonarchEventMapper {
  readonly toEvent: (
    message_id: Hash,
    message: Record<string | number, unknown>,
    sender: Url,
  ) => MonarchEvent | undefined;
}

export function monarchEvents(ids: MonarchTransitionIds): MonarchEventMapper {
  const hashes: Hash[] = [
    ids.SCREEN_TRANSITION_IN_STARTED,
    ids.SCREEN_TRANSITION_IN_FINISHED,
    ids.SCREEN_TRANSITION_OUT_STARTED,
    ids.SCREEN_TRANSITION_OUT_FINISHED,
    ids.SCREEN_TRANSITION_FAILED,
  ];
  const types: MonarchEvent["type"][] = [
    "monarch_screen_transition_in_started",
    "monarch_screen_transition_in_finished",
    "monarch_screen_transition_out_started",
    "monarch_screen_transition_out_finished",
    "monarch_screen_transition_failed",
  ];
  return {
    toEvent: (message_id, message, sender) => {
      for (let i = 0; i < hashes.length; i++) {
        if (hashes[i] === message_id) {
          return copyEvent(types[i] as MonarchEvent["type"], message, sender) as MonarchEvent;
        }
      }
      return undefined;
    },
  };
}

function copyEvent(type: string, message: Record<string | number, unknown>, sender: Url): unknown {
  const event: { [key: string]: unknown } = {};
  for (const key in message) {
    event[key] = message[key];
  }
  event.type = type;
  event.sender = sender;
  return event;
}
