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

function copyEvent(type: string, message: Record<string | number, unknown>, sender: Url): unknown {
  const event: { [key: string]: unknown } = {};
  for (const key in message) {
    event[key] = message[key];
  }
  event.type = type;
  event.sender = sender;
  return event;
}
