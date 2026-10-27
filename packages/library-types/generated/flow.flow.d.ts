/** @noSelfInFile */

/**
 * Flow's main facade for UI rendering, navigation, components, colors, logging, and
 * hosted bottom sheets.
 * @see {@link https://github.com/Pause-Games/flow|GitHub source}
 * @noResolution
 */
declare module 'flow.flow' {
  import type {
    Flow_BoxProps,
    Flow_ButtonImageProps,
    Flow_ButtonProps,
    Flow_Element,
    Flow_IconProps,
    Flow_InitConfig,
    Flow_Logger,
    Flow_MarkdownOptions,
    Flow_Navigation,
    Flow_PopupProps,
    Flow_PushOptions,
    Flow_RuntimeConfig,
    Flow_ScrollProps,
    Flow_Style,
    Flow_TextProps,
  } from 'flow.types';

  type FlowSelf = object;
  type FlowParams = LuaMap<string, unknown> | Record<string, unknown>;
  type FlowInputAction = {
    x?: number;
    y?: number;
    pressed?: boolean;
    released?: boolean;
  };

  /** Flow's callable Markdown component and its explicit parsing helpers. */
  interface FlowMarkdownComponent {
    /** Creates a scrollable Markdown viewer. */
    (options: Flow_MarkdownOptions): Flow_Element;
    /** Parses Markdown into Flow elements. */
    parse(markdown_text: string, key_prefix?: string, options?: Flow_MarkdownOptions): Flow_Element[];
    /** Creates a scrollable Markdown viewer from text and style overrides. */
    viewer(markdown_text: string, key?: string, style_override?: Flow_Style): Flow_Element;
  }

  /** Flow's primitive component constructors. */
  interface FlowComponents {
    /** Creates a box element. */
    Box(props: Flow_BoxProps): Flow_Element;
    /** Creates a button element. */
    Button(props: Flow_ButtonProps): Flow_Element;
    /** Creates an image-backed button element. */
    ButtonImage(props: Flow_ButtonImageProps): Flow_Element;
    /** Creates an icon element. */
    Icon(props: Flow_IconProps): Flow_Element;
    /** Creates a Markdown viewer and exposes Markdown parsing helpers. */
    Markdown: FlowMarkdownComponent;
    /** Creates a popup element. */
    Popup(props: Flow_PopupProps): Flow_Element;
    /** Creates a scroll element. */
    Scroll(props: Flow_ScrollProps): Flow_Element;
    /** Creates a text element. */
    Text(props: Flow_TextProps): Flow_Element;
  }

  /** Namespaces added to the low-level `flow.ui` module by the facade. */
  interface FlowUiNamespaces {
    /** Flow's imperative flexbox module. */
    Flex: typeof import('flow.flex');
    /** Alias of `Flex`. */
    flex: typeof import('flow.flex');
    /** Flow's color helpers. */
    color: typeof import('flow.color');
    /** Flow's layout pass. */
    layout: typeof import('flow.layout');
    /** Primitive component constructors. */
    cp: FlowComponents;
    /** Alias of `cp`. */
    components: FlowComponents;
  }

  /** The plain-script runtime with lifecycle inputs compatible with project interfaces. */
  interface FlowRuntimeFacade {
    /** Initializes navigation on a script component. */
    init(self: object, config?: Flow_RuntimeConfig): LuaTable;
    /** Detaches navigation from a script component. */
    final(self: object): void;
    /** Routes a message through script navigation. */
    on_message(
      self: object,
      message_id: Hash | string,
      message?: FlowParams,
      sender?: Url,
    ): boolean;
  }

  type FlowNavigationMessageModule = typeof import('flow.navigation.messages');

  /** Navigation message ids keyed by operation name. */
  interface FlowNavigationMessageIds {
    /** Message id for `push`. */
    push: Hash | string;
    /** Message id for `pop`. */
    pop: Hash | string;
    /** Message id for `replace`. */
    replace: Hash | string;
    /** Message id for `reset`. */
    reset: Hash | string;
    /** Message id for `back`. */
    back: Hash | string;
    /** Message id for `invalidate`. */
    invalidate: Hash | string;
  }

  /** Message ids and the dispatch alias published by the navigation message transport. */
  interface FlowNavigationMessages {
    /** Map of all supported message ids keyed by operation name. */
    ids: FlowNavigationMessageIds;
    /** Message id for `push`; payload `{ id, params?, options? }`. */
    PUSH: Hash | string;
    /** Message id for `pop`; payload `{ result?, options? }`. */
    POP: Hash | string;
    /** Message id for `replace`; payload `{ id, params?, options? }`. */
    REPLACE: Hash | string;
    /** Message id for `reset`; payload `{ id, params?, options? }`. */
    RESET: Hash | string;
    /** Message id for `back`; payload `{ result?, options? }`. */
    BACK: Hash | string;
    /** Message id for `invalidate`; no payload required. */
    INVALIDATE: Hash | string;
    /** Alias of `on_message` for older call sites. */
    handle_message: FlowNavigationMessageModule['on_message'];
  }

  /** The navigation message transport, as published on `flow.nav` and `flow.nav.messages`. */
  type FlowNavigationMessageTransport = FlowNavigationMessageModule & FlowNavigationMessages;

  /** Namespaces and transition shorthand added to the navigation facade. */
  interface FlowNavigationNamespaces {
    /** Navigation message transport. */
    messages: FlowNavigationMessageTransport;
    /** Navigation for plain script components. */
    runtime: typeof import('flow.navigation.runtime') & FlowRuntimeFacade;
    /** Collection-proxy navigation support. */
    proxy: typeof import('flow.navigation.proxy');
    /** Navigation's GUI adapter. */
    gui: typeof import('flow.navigation.gui');
    /** Pushes a screen, accepting the transition shorthand supported by the router. */
    push(
      id: string,
      params?: FlowParams,
      options?: Flow_PushOptions | string,
    ): ReturnType<Flow_Navigation["push"]>;
    /** Replaces the current screen, accepting the transition shorthand supported by the router. */
    replace(
      id: string,
      params?: FlowParams,
      options?: Flow_PushOptions | string,
    ): ReturnType<Flow_Navigation["replace"]>;
  }

  /** The low-level UI module plus Flow's component and helper namespaces. */
  export const ui: typeof import('flow.ui') & FlowUiNamespaces;

  /** The navigation API, message transport, and runtime adapters. */
  export const nav: Flow_Navigation &
    FlowNavigationMessageTransport &
    FlowNavigationNamespaces;

  /** Hosted bottom sheets. */
  export const bottom_sheet: typeof import('flow.bottom_sheet');

  /** Centralized logging. */
  export const log: Flow_Logger;

  /** Color parsing and hexadecimal color helpers. */
  export const color: typeof import('flow.color');

  /** Mounts Flow and configures navigation on a GUI script instance. */
  export function init(self: FlowSelf, config?: Flow_InitConfig): LuaTable;

  /** Releases input focus and destroys the active adapter. */
  export function final(self: FlowSelf): void;

  /** Sets a static element tree and requests a redraw. */
  export function set_tree(self: FlowSelf, tree: Flow_Element): Flow_Element;

  /** Requests a rebuild of the current static or navigation tree. */
  export function invalidate(self: FlowSelf): void;

  /** Advances animations and navigation, rebuilding and redrawing as needed. */
  export function update(self: FlowSelf, dt: number): boolean;

  /** Routes a Defold input action through Flow. */
  export function on_input(self: FlowSelf, action_id: Hash, action: FlowInputAction): boolean;

  /** Handles navigation messages and forwards unhandled messages to the configured hook. */
  export function on_message(
    self: FlowSelf,
    message_id: Hash | string,
    message?: FlowParams,
    sender?: Url,
  ): boolean;

  /** Pushes a screen through the facade's navigation singleton. */
  export function push(
    self: FlowSelf,
    id: string,
    params?: FlowParams,
    options?: Flow_PushOptions | string,
  ): void;

  /** Pops the current screen through the facade's navigation singleton. */
  export function pop(
    self: FlowSelf,
    result_or_transition?: FlowParams | string,
    options?: Flow_PushOptions | string,
  ): void;

  /** Replaces the current screen through the facade's navigation singleton. */
  export function replace(
    self: FlowSelf,
    id: string,
    params?: FlowParams,
    options?: Flow_PushOptions | string,
  ): void;

  /** Resets navigation to a root screen. */
  export function reset(
    self: FlowSelf,
    id: string,
    params?: FlowParams,
    options?: Flow_PushOptions | string,
  ): void;

  /** Returns the current screen's saved vertical scroll offset. */
  export function get_scroll_offset(self: FlowSelf, key: string): number;
}
