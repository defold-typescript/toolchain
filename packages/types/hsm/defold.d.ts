// Generated from packages/hsm/src/defold.ts by `bun run --cwd packages/hsm declarations`; do not edit.
export type MessageEvent<K extends MessageId> = K extends MessageId ? {
    readonly type: K;
} & Omit<MessagePayload<K>, "type"> : never;
/** @noSelf */
export interface MessageEventMapper<K extends MessageId> {
    readonly toEvent: (message_id: Hash, message: Record<string | number, unknown>) => MessageEvent<K> | undefined;
}
export declare function messageEvents<const K extends MessageId>(ids: readonly K[]): MessageEventMapper<K>;
