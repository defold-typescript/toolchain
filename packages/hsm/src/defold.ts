export type MessageEvent<K extends MessageId> = K extends MessageId
  ? { readonly type: K } & Omit<MessagePayload<K>, "type">
  : never;

/** @noSelf */
export interface MessageEventMapper<K extends MessageId> {
  readonly toEvent: (
    message_id: Hash,
    message: Record<string | number, unknown>,
  ) => MessageEvent<K> | undefined;
}

export function messageEvents<const K extends MessageId>(ids: readonly K[]): MessageEventMapper<K> {
  const hashes: Hash[] = [];
  for (let i = 0; i < ids.length; i++) {
    hashes[i] = hash(ids[i] as K);
  }
  return {
    toEvent: (message_id, message) => {
      for (let i = 0; i < hashes.length; i++) {
        if (hashes[i] === message_id) {
          const event: { [key: string]: unknown } = {};
          for (const key in message) {
            event[key] = message[key];
          }
          event.type = ids[i];
          return event as unknown as MessageEvent<K>;
        }
      }
      return undefined;
    },
  };
}
