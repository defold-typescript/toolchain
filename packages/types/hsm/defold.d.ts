// Generated from packages/hsm/src/defold.ts by `bun run --cwd packages/hsm declarations`; do not edit.
export type MessageEvent<K extends MessageId> = K extends MessageId ? {
    readonly type: K;
    readonly sender: Url;
} & Omit<MessagePayload<K>, "type" | "sender"> : never;
/** @noSelf */
export interface MessageEventMapper<K extends MessageId> {
    readonly toEvent: (message_id: Hash, message: Record<string | number, unknown>, sender: Url) => MessageEvent<K> | undefined;
}
export declare function messageEvents<const K extends MessageId>(ids: readonly K[]): MessageEventMapper<K>;
export interface MonarchTransitionIds {
    readonly SCREEN_TRANSITION_IN_STARTED: Hash;
    readonly SCREEN_TRANSITION_IN_FINISHED: Hash;
    readonly SCREEN_TRANSITION_OUT_STARTED: Hash;
    readonly SCREEN_TRANSITION_OUT_FINISHED: Hash;
    readonly SCREEN_TRANSITION_FAILED: Hash;
}
export type MonarchEvent = MonarchInEvent<"monarch_screen_transition_in_started"> | MonarchInEvent<"monarch_screen_transition_in_finished"> | MonarchOutEvent<"monarch_screen_transition_out_started"> | MonarchOutEvent<"monarch_screen_transition_out_finished"> | {
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
    readonly toEvent: (message_id: Hash, message: Record<string | number, unknown>, sender: Url) => MonarchEvent | undefined;
}
export declare function monarchEvents(ids: MonarchTransitionIds): MonarchEventMapper;
export {};
