/**
 * The event `messageEvents` builds from the Defold message `K`, for a machine's event union. It
 * holds the message id as `type`, the payload fields declared through `BuiltinMessages` and
 * `CustomMessages`, and the `sender`.
 */
export type MessageEvent<K extends MessageId> = K extends MessageId
  ? {
      /** The message id. A payload field named `type` never overrides it. */
      readonly type: K;
      /** The URL the message came from. A payload field named `sender` never overrides it. */
      readonly sender: Url;
    } & Omit<MessagePayload<K>, "type" | "sender">
  : never;

/**
 * Returned by `messageEvents`. Build it once at module scope: it hashes the ids when it is
 * created.
 * @noSelf
 */
export interface MessageEventMapper<K extends MessageId> {
  /**
   * Turns the parameters of `on_message` into the event for that message, a new table on each
   * call. Returns `undefined` for a message id that `messageEvents` was not given.
   */
  readonly toEvent: (
    message_id: Hash,
    message: Record<string | number, unknown>,
    sender: Url,
  ) => MessageEvent<K> | undefined;
}

/**
 * Builds a mapper that turns the Defold messages listed in `ids` into typed machine events of
 * the shape `{ type: id, ...payload, sender }`. Call it once at module scope: the ids are hashed
 * here.
 */
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

function copyEvent(type: string, message: Record<string | number, unknown>, sender: Url): unknown {
  const event: { [key: string]: unknown } = {};
  for (const key in message) {
    event[key] = message[key];
  }
  event.type = type;
  event.sender = sender;
  return event;
}
