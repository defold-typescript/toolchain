/** @noSelfInFile */

/**
 * Flow's hosted bottom-sheet component and GUI lifecycle adapter.
 * @see {@link https://github.com/Pause-Games/flow|GitHub source}
 * @noResolution
 */
declare module 'flow.bottom_sheet' {
  import type {
    Flow_BottomSheetHostConfig,
    Flow_BottomSheetProps,
    Flow_Element,
  } from 'flow.types';

  type FlowSelf = object;
  type FlowParams = LuaMap<string, unknown> | Record<string, unknown>;
  type FlowInputAction = {
    x?: number;
    y?: number;
    pressed?: boolean;
    released?: boolean;
  };

  /** The callable `flow.bottom_sheet` module. */
  interface FlowBottomSheetModule {
    /** Creates a bottom-sheet element. */
    (props: Flow_BottomSheetProps): Flow_Element;

    /** Mounts the bottom-sheet host on a GUI script instance. */
    init: (self: FlowSelf, config: Flow_BottomSheetHostConfig) => void;

    /** Releases input focus and destroys the host's navigation adapter. */
    final: (self: FlowSelf) => void;

    /** Advances animations and rebuilds the hosted sheet when needed. */
    update: (self: FlowSelf, dt: number) => boolean;

    /** Presents the configured sheet with optional parameters. */
    present: (self: FlowSelf, params?: FlowParams) => void;

    /** Starts closing the presented sheet and records its optional result. */
    dismiss: (self: FlowSelf, result?: unknown) => boolean;

    /** Rebuilds the current sheet tree. */
    invalidate: (self: FlowSelf) => boolean;

    /** Routes a Defold input action to the hosted sheet. */
    on_input: (
      self: FlowSelf,
      action_id: Hash | undefined,
      action: FlowInputAction,
    ) => boolean;

    /** Handles open, close, navigation, and configured custom messages. */
    on_message: (
      self: FlowSelf,
      message_id: Hash | string,
      message?: FlowParams,
      sender?: Url,
    ) => boolean;
  }

  const bottom_sheet: FlowBottomSheetModule;
  export = bottom_sheet;
}
