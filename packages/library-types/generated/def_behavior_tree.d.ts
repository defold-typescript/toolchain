/** @noSelfInFile **/

/**
 * Event-driven behavior trees for NPC logic. Register node templates once with
 * `registerTemplates`, create a tree over a payload with `new`, and call `run`: each
 * node moves on only when the one before it reports success or failure, and a tree can
 * start from any node id, so an active node saved with a game can be resumed on load.
 * @see {@link https://github.com/s-kania/def-behavior-tree|Github Source}
 * @noResolution
 */
declare module 'def_behavior_tree.behavior_tree' {
  /**
   * A node type, the `type` of a node template. Its `name` names the type in the
   * registered tree template.
   */
  export interface NodeType<Name extends string = string> {
    readonly name: Name;
  }

  /**
   * The lowest-level node, which has no children and runs your behavior code through
   * its template's `start`, `run` and `finish`. Its type name is `"Node"`.
   */
  export const Task: NodeType<'Node'>;

  /**
   * The archetype the four composites build on. Not a template type itself: use
   * `Sequence`, `Selector`, `Random` or `RandomWithChances`.
   */
  export const Composite: NodeType<'Composite'>;

  /**
   * A composite that runs its children in order, the next one when the last succeeds.
   * It fails as soon as a child fails, and succeeds when the last child succeeds.
   */
  export const Sequence: NodeType<'Sequence'>;

  /**
   * A composite that runs its children in order, the next one when the last fails. It
   * succeeds as soon as a child succeeds, and fails when every child fails.
   */
  export const Selector: NodeType<'Selector'>;

  /**
   * A composite that runs one child picked at random, by the tree's `rng` over
   * `1` to the child count, and reports that child's result.
   */
  export const Random: NodeType<'Random'>;

  /**
   * A composite that runs one child picked by weight: the tree's `rng` draws from `1` to
   * `100`, and each child's `chance` is its share of that range, so the chances should
   * add up to `100`. To weight a node registered by name, wrap it in a `ChanceDecorator`.
   */
  export const RandomWithChances: NodeType<'RandomWithChances'>;

  /**
   * The archetype the five decorators build on. Not a template type itself: use one of
   * the decorators.
   */
  export const Decorator: NodeType<'Decorator'>;

  /** A decorator that reports the opposite of its child's result. */
  export const InvertDecorator: NodeType<'InvertDecorator'>;

  /** A decorator that fails whatever its child reports. */
  export const AlwaysFailDecorator: NodeType<'AlwaysFailDecorator'>;

  /** A decorator that succeeds whatever its child reports. */
  export const AlwaysSucceedDecorator: NodeType<'AlwaysSucceedDecorator'>;

  /**
   * A decorator that runs its child again each time it succeeds, and succeeds once the
   * child fails. A good root node.
   */
  export const RepeatUntilFailDecorator: NodeType<'RepeatUntilFailDecorator'>;

  /**
   * A decorator that passes its child's result through, so a node registered by name
   * can carry a `chance` inside a `RandomWithChances`.
   */
  export const ChanceDecorator: NodeType<'ChanceDecorator'>;

  /** The controls a task callback receives to finish the task. */
  export interface TaskControl {
    /** Reports the task as succeeded, which moves the tree on. */
    success(this: void): void;
    /** Reports the task as failed, which moves the tree on. */
    fail(this: void): void;
  }

  /**
   * A task's `start`, `run` or `finish`.
   * @param task Finishes the task when it calls `success` or `fail`.
   * @param payload The payload the tree was created with.
   */
  export type TaskCallback<P> = (this: void, task: TaskControl, payload: P) => void;

  /**
   * A task template. `start` is called before `run`, and `finish` after the task
   * succeeds or fails; each is optional. A task finishes when one of them calls
   * `task.success()` or `task.fail()`, and `start` or `finish` may do so early.
   */
  export interface TaskTemplate<P> {
    type: typeof Task;
    start?: TaskCallback<P>;
    run?: TaskCallback<P>;
    finish?: TaskCallback<P>;
    /** This node's share of `1` to `100`, read only when a `RandomWithChances` lists it. */
    chance?: number;
    nodes?: never;
    node?: never;
  }

  /**
   * A composite template, with its children in `nodes`: each one a template written
   * inline, or, when the templates carry `NODES`, a node registered there by name.
   */
  export interface CompositeTemplate<P, Ref extends string = string> {
    type: typeof Sequence | typeof Selector | typeof Random | typeof RandomWithChances;
    nodes: (Ref | NodeTemplate<P, Ref>)[];
    /** This node's share of `1` to `100`, read only when a `RandomWithChances` lists it. */
    chance?: number;
    node?: never;
  }

  /**
   * A decorator template, with its one child in `node`: a template written inline, or,
   * when the templates carry `NODES`, a node registered there by name.
   */
  export interface DecoratorTemplate<P, Ref extends string = string> {
    type:
      | typeof InvertDecorator
      | typeof AlwaysFailDecorator
      | typeof AlwaysSucceedDecorator
      | typeof RepeatUntilFailDecorator
      | typeof ChanceDecorator;
    node: Ref | NodeTemplate<P, Ref>;
    /** This node's share of `1` to `100`, read only when a `RandomWithChances` lists it. */
    chance?: number;
    nodes?: never;
  }

  /**
   * A node template: a task, a composite or a decorator, told apart by its `type`. `Ref`
   * is what a child may be named by, `never` in a tree written wholly inline.
   */
  export type NodeTemplate<P, Ref extends string = string> =
    | TaskTemplate<P>
    | CompositeTemplate<P, Ref>
    | DecoratorTemplate<P, Ref>;

  /**
   * Templates whose trees name nodes by string. Every name, at any depth, is looked up
   * in `NODES`.
   */
  export interface NamedTemplates<P> {
    TREES: Record<string, { main_node: string | NodeTemplate<P> }>;
    NODES: Record<string, NodeTemplate<P>>;
  }

  /** Templates whose trees are written wholly inline, with no node named by string. */
  export interface InlineTemplates<P> {
    TREES: Record<string, { main_node: NodeTemplate<P, never> }>;
    NODES?: undefined;
  }

  /**
   * The templates `registerTemplates` takes. `TREES` names each tree and its root node.
   * A template that names a node by string needs `NODES` to hold it; one written wholly
   * inline may leave `NODES` out. Register the templates once, before `new` creates any
   * tree.
   */
  export type Templates<P> = NamedTemplates<P> | InlineTemplates<P>;

  /**
   * A node of a registered tree template. Each use of a template in a tree is its own
   * node with its own id, even when several refer to the same template by name.
   */
  export interface TreeNode {
    /** The node's id in its tree, from `1` at the root. Pass it to `run` or `restart`. */
    readonly id: number;
    /**
     * The template's name for a node registered under `NODES`, followed by
     * ` | <type name>` for one that is not a task; the type name for an inline node.
     */
    name: string;
    /** The node's type. */
    type: NodeType;
    /** The template's `chance`, if it gave one. */
    chance?: number;
    /** A composite's children. */
    nodes?: TreeNode[];
    /** A decorator's child. */
    node?: TreeNode;
  }

  /** A behavior tree created by `new`, running its registered template over a payload. */
  export interface BehaviorTree<P = unknown> {
    /** The registered tree this tree runs, from `config.tree_name`. */
    readonly name: string;
    /** The payload every task callback receives. */
    payload: P;
    /** Whether the tree is running: set by `run` and `restart`, cleared when the root finishes. */
    running: boolean;
    /** The node the tree is at, unset until the first `run` or `restart`. Save its `id` to resume later. */
    activeNode: TreeNode | undefined;
    /** The number generator `Random` and `RandomWithChances` draw with. */
    rng: (this: void, x: number, y: number) => number;

    /**
     * Starts the tree at a node. Does nothing while the tree is `running`.
     * @param activeNodeID The id of the node to start at. Defaults to `1`, the root.
     */
    run(activeNodeID?: number): void;

    /**
     * Starts the tree at a node whether or not it is `running`.
     * @param activeNodeID The id of the node to start at. Defaults to `1`, the root.
     */
    restart(activeNodeID?: number): void;

    /**
     * Sets the node the tree is at, without running it.
     * @param node A node of this tree.
     */
    setActiveNode(node: TreeNode): void;

    /**
     * Returns a node of this tree by id.
     * @param nodeID The node's id.
     */
    getNode(nodeID: number): TreeNode | undefined;

    /** Finishes the root node and stops the tree. Called when the root succeeds. */
    success(): void;

    /** Finishes the root node and stops the tree. Called when the root fails. */
    fail(): void;

    /**
     * Returns a number from the tree's `rng`.
     * @param x The low end of the range.
     * @param y The high end of the range.
     */
    getRandomBetween(x: number, y: number): number;
  }

  /**
   * Creates a tree that runs a registered tree template over a payload. Register the
   * templates with `registerTemplates` first.
   * @param config `tree_name` names a tree under the templates' `TREES`, `payload` is
   * passed to every task callback, and `rng` returns a whole number between its two
   * arguments for `Random` and `RandomWithChances`; it defaults to `math.random`.
   */
  function new_<P>(config: {
    tree_name: string;
    payload: P;
    rng?: (this: void, range_start: number, range_end: number) => number;
  }): BehaviorTree<P>;
  /**
   * Creates a tree that runs a registered tree template with no payload, so its task
   * callbacks receive `undefined`. Register the templates with `registerTemplates` first.
   * @param config `tree_name` names a tree under the templates' `TREES`, and `rng`
   * returns a whole number between its two arguments for `Random` and
   * `RandomWithChances`; it defaults to `math.random`.
   */
  function new_(config: {
    tree_name: string;
    payload?: undefined;
    rng?: (this: void, range_start: number, range_end: number) => number;
  }): BehaviorTree<undefined>;
  export { new_ as new };

  /**
   * Registers the tree templates, giving every node of each tree under `TREES` its own
   * id. Call it once, before `new` creates any tree.
   * @param templates The trees, and the named nodes they refer to.
   */
  export const registerTemplates: <P>(templates: Templates<P>) => void;

  /**
   * Returns a registered tree template's nodes, indexed by node id.
   * @param treeName The tree's name under `TREES`.
   */
  export const getTreeTemplate: (treeName: string) => TreeNode[] | undefined;

  /** The registry the tree templates are stored in. */
  export const Registry: {
    /**
     * Registers the tree templates, giving every node of each tree under `TREES` its
     * own id. Call it once, before `new` creates any tree.
     * @param templates The trees, and the named nodes they refer to.
     */
    registerTemplates<P>(this: void, templates: Templates<P>): void;
    /**
     * Returns a registered tree template's nodes, indexed by node id.
     * @param treeName The tree's name under `TREES`.
     */
    getTreeTemplate(this: void, treeName: string): TreeNode[] | undefined;
    /**
     * Returns a node of a registered tree template by id.
     * @param id The node's id.
     * @param treeName The tree's name under `TREES`.
     */
    getNodeFromTree(this: void, id: number, treeName: string): TreeNode | undefined;
  };
}
