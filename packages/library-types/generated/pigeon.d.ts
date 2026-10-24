/** @noResolution */
declare module 'pigeon.pigeon' {
	type hash = Opaque<"userdata"> | Hash;
	type HashedMessageId = hash | Opaque<"userdata">;
	type MessageId = string | hash | Opaque<"userdata"> | HashedMessageId;
	type MessagesGroup = MessageId | MessageId[] | LuaTable<number | string, MessageId>;
	type MessageDefinition = LuaTable<string, string> | LuaTable | undefined;
	type Letters = LuaTable<string, MessageDefinition | undefined>;
	type MessageIds = MessageId[];
	type HashedMessageIds = HashedMessageId[];
	type Url_ = Url | string | Opaque<"userdata">;
	type DataType = "nil" | "number" | "string" | "boolean" | "table" | "function" | "thread" | "userdata" | "hash" | "url" | "vector" | "vector3" | "vector4" | "matrix4" | "quat";
	type ExpectedDataType = DataType | string | LuaTable<number, DataType>;
	interface BaseLetterDefinition {
		id: HashedMessageId;
	}
	interface CameraMessageDefinition {
		aspect_ratio: string;
		fov: string;
		near_z: string;
		far_z: string;
		orthographic_projection: string;
		orthographic_zoom: string;
		orthographic_mode: string;
	}
	/**
	 * Post this message to a camera-component to set its properties at run-time.
	 */
	interface LetterSetCamera extends BaseLetterDefinition {
		data: CameraMessageDefinition;
	}
	/**
	 * Legacy compatibility message kept for older projects.
	 * Not part of current Defold stable camera message docs (prefer camera.acquire_focus()).
	 */
	interface LetterAcquireCameraFocus extends BaseLetterDefinition {
	}
	/**
	 * Legacy compatibility message kept for older projects.
	 * Not part of current Defold stable camera message docs (prefer camera.release_focus()).
	 */
	interface LetterReleaseCameraFocus extends BaseLetterDefinition {
	}
	interface TimeStepMessageDefinition {
		factor: string;
		mode: string;
	}
	/**
	 * Post this message to a collection-proxy-component to modify the time-step.
	 */
	interface LetterSetTimeStep extends BaseLetterDefinition {
		data: TimeStepMessageDefinition;
	}
	/**
	 * Post this message to start loading the referenced collection. When loading completes, proxy_loaded will be sent back.
	 */
	interface LetterLoad extends BaseLetterDefinition {
	}
	/**
	 * Post this message to start unloading the referenced collection. When unloading completes, proxy_unloaded will be sent back.
	 */
	interface LetterUnload extends BaseLetterDefinition {
	}
	/**
	 * Post this message to start background loading of the referenced collection. When loading completes, proxy_loaded will be sent back.
	 */
	interface LetterAsyncLoad extends BaseLetterDefinition {
	}
	/**
	 * Message sent back when collection loading is complete (from load or async_load).
	 */
	interface LetterProxyLoaded extends BaseLetterDefinition {
	}
	/**
	 * Message sent back when collection unloading is complete.
	 */
	interface LetterProxyUnloaded extends BaseLetterDefinition {
	}
	/**
	 * Post this message to initialize game objects and components in the referenced collection.
	 */
	interface LetterInit extends BaseLetterDefinition {
	}
	/**
	 * Post this message to finalize game objects and components in the referenced collection.
	 */
	interface LetterFinal extends BaseLetterDefinition {
	}
	/**
	 * Post this message to enable a component. Supported by: Camera, Collection Proxy, Collision Object,
	 * Gui, Label, Spine Model, Sprite, Tile Grid, Model, Mesh
	 */
	interface LetterEnable extends BaseLetterDefinition {
	}
	/**
	 * Post this message to disable a component. Supported by: Camera, Collection Proxy, Collision Object,
	 * Gui, Label, Spine Model, Sprite, Tile Grid, Model, Mesh
	 */
	interface LetterDisable extends BaseLetterDefinition {
	}
	/**
	 * Post this message to a game object instance to make that instance acquire user input focus.
	 * The last instance to request focus will receive it first and can consume input events.
	 * Scripts in the instance will receive input actions in their on_input callback function.
	 */
	interface LetterAcquireInputFocus extends BaseLetterDefinition {
	}
	/**
	 * Post this message to an instance to make that instance release the user input focus.
	 * The instance will stop receiving input events.
	 */
	interface LetterReleaseInputFocus extends BaseLetterDefinition {
	}
	interface SetParentMessageDefinition {
		parent_id: string;
		keep_world_transform: string;
	}
	/**
	 * Post this message to set the parent of an instance, making it exist in the geometrical space of its parent.
	 */
	interface LetterSetParent extends BaseLetterDefinition {
		data: SetParentMessageDefinition;
	}
	interface LayoutChangedMessageDefinition {
		id: string;
		previous_id: string;
	}
	interface LetterLayoutChanged extends BaseLetterDefinition {
		data: LayoutChangedMessageDefinition;
	}
	/**
	 * This message is sent when a Model animation has finished playing back to the script that started the animation.
	 */
	interface ModelAnimationDoneMessageDefinition {
		animation_id: string;
		playback: string;
	}
	interface LetterModelAnimationDone extends BaseLetterDefinition {
		data: ModelAnimationDoneMessageDefinition;
	}
	/**
	 * Post this message to a collision-object-component to apply force on the collision object. The collision object must be dynamic.
	 */
	interface ApplyForceMessageDefinition {
		force: string;
		position: string;
	}
	interface LetterApplyForce extends BaseLetterDefinition {
		data: ApplyForceMessageDefinition;
	}
	/**
	 * Message sent when two collision objects collide. Reports collision once per frame per colliding pair.
	 */
	interface CollisionObjectMessageDefinition {
		position: string;
		id: string;
		group: string;
	}
	interface CollisionEventMessageDefinition {
		a: string;
		b: string;
	}
	interface LetterCollisionEvent extends BaseLetterDefinition {
		data: CollisionEventMessageDefinition;
	}
	/**
	 * Message broadcasted to every component of an instance with a collision object when it collides.
	 */
	interface CollisionResponseMessageDefinition {
		other_id: string;
		other_position: string;
		other_group: string;
		own_group: string;
	}
	interface LetterCollisionResponse extends BaseLetterDefinition {
		data: CollisionResponseMessageDefinition;
	}
	/**
	 * Detailed contact point information for a collision object
	 */
	interface ContactPointObjectMessageDefinition {
		position: string;
		id: string;
		group: string;
		relative_velocity: string;
		mass: string;
		normal: string;
	}
	/**
	 * Message sent when collision objects have contact points. Can be sent multiple times per frame.
	 */
	interface ContactPointEventMessageDefinition {
		applied_impulse: string;
		distance: string;
		a: string;
		b: string;
	}
	interface LetterContactPointEvent extends BaseLetterDefinition {
		data: ContactPointEventMessageDefinition;
	}
	/**
	 * Detailed contact point response sent to components of an instance with a collision object.
	 */
	interface ContactPointResponseMessageDefinition {
		position: string;
		normal: string;
		relative_velocity: string;
		distance: string;
		applied_impulse: string;
		life_time: string;
		mass: string;
		other_mass: string;
		other_id: string;
		other_position: string;
		other_group: string;
		own_group: string;
	}
	interface LetterContactPointResponse extends BaseLetterDefinition {
		data: ContactPointResponseMessageDefinition;
	}
	/**
	 * Message sent when ray cast doesn't hit any collision object.
	 */
	interface RayCastMissedMessageDefinition {
		request_id: string;
	}
	interface LetterRayCastMissed extends BaseLetterDefinition {
		data: RayCastMissedMessageDefinition;
	}
	/**
	 * Message sent when ray cast hits a collision object.
	 */
	interface RayCastResponseMessageDefinition {
		fraction: string;
		position: string;
		normal: string;
		id: string;
		group: string;
		request_id: string;
	}
	interface LetterRayCastResponse extends BaseLetterDefinition {
		data: RayCastResponseMessageDefinition;
	}
	/**
	 * Basic collision object information for trigger events
	 */
	interface TriggerObjectMessageDefinition {
		id: string;
		group: string;
	}
	/**
	 * Message sent when collision objects interact and one is a trigger.
	 */
	interface TriggerEventMessageDefinition {
		enter: string;
		a: string;
		b: string;
	}
	interface LetterTriggerEvent extends BaseLetterDefinition {
		data: TriggerEventMessageDefinition;
	}
	/**
	 * Message broadcasted when collision object interacts with a trigger.
	 */
	interface TriggerResponseMessageDefinition {
		other_id: string;
		enter: string;
		other_group: string;
		own_group: string;
	}
	interface LetterTriggerResponse extends BaseLetterDefinition {
		data: TriggerResponseMessageDefinition;
	}
	interface DrawDebugTextMessageDefinition {
		position: string;
		text: string;
		color: string;
	}
	interface LetterDrawDebugText extends BaseLetterDefinition {
		data: DrawDebugTextMessageDefinition;
	}
	interface DrawLineMessageDefinition {
		start_point: string;
		end_point: string;
		color: string;
	}
	interface LetterDrawLine extends BaseLetterDefinition {
		data: DrawLineMessageDefinition;
	}
	interface WindowDimensionsMessageDefinition {
		height: string;
		width: string;
	}
	interface LetterWindowResized extends BaseLetterDefinition {
		data: WindowDimensionsMessageDefinition;
	}
	interface LetterResize extends BaseLetterDefinition {
		data: WindowDimensionsMessageDefinition;
	}
	interface ClearColorMessageDefinition {
		color: string;
	}
	interface LetterClearColor extends BaseLetterDefinition {
		data: ClearColorMessageDefinition;
	}
	interface PlaySoundMessageDefinition {
		delay: string;
		gain: string;
		play_id: string;
		start_time: string;
		start_frame: string;
	}
	/**
	 * Post this message to a sound-component to play its sound. Supports up to 32 voices per component.
	 */
	interface LetterPlaySound extends BaseLetterDefinition {
		data?: PlaySoundMessageDefinition | undefined;
	}
	/**
	 * Post this message to a sound-component to stop playing all active voices.
	 */
	interface LetterStopSound extends BaseLetterDefinition {
	}
	interface SetGainMessageDefinition {
		gain: string;
	}
	/**
	 * Post this message to a sound-component to set gain on all active playing voices.
	 */
	interface LetterSetGain extends BaseLetterDefinition {
		data?: SetGainMessageDefinition | undefined;
	}
	interface SoundDoneMessageDefinition {
		play_id: string;
	}
	/**
	 * Message sent when sound completes playing (if play_id was provided).
	 */
	interface LetterSoundDone extends BaseLetterDefinition {
		data?: SoundDoneMessageDefinition | undefined;
	}
	interface SoundStoppedMessageDefinition {
		play_id: string;
	}
	/**
	 * Message sent when sound is manually stopped (if play_id was provided).
	 */
	interface LetterSoundStopped extends BaseLetterDefinition {
		data?: SoundStoppedMessageDefinition | undefined;
	}
	interface PlayAnimationMessageDefinition {
		id: string;
		offset: string;
		playback_rate: string;
	}
	/**
	 * Post this message to a sprite component to make it play an animation from its tile set.
	 */
	interface LetterPlayAnimation extends BaseLetterDefinition {
		data: PlayAnimationMessageDefinition;
	}
	interface AnimationDoneMessageDefinition {
		current_tile: string;
		id: string;
	}
	/**
	 * Message sent when animation completes. Only sent for animations with playback modes:
	 * Once Forward, Once Backward, or Once Ping Pong.
	 */
	interface LetterAnimationDone extends BaseLetterDefinition {
		data: AnimationDoneMessageDefinition;
	}
	interface ExitMessageDefinition {
		code: string;
	}
	/**
	 * Terminates the game application and reports the specified code to the OS.
	 * Can only be sent to the designated @system socket.
	 */
	interface LetterExit extends BaseLetterDefinition {
		data: ExitMessageDefinition;
	}
	/**
	 * Toggles the on-screen profiler showing real-time performance metrics.
	 * Can only be sent to the designated @system socket.
	 */
	interface LetterToggleProfile extends BaseLetterDefinition {
	}
	/**
	 * Toggles the on-screen physics visual debugging mode.
	 * Can only be sent to the designated @system socket.
	 */
	interface LetterTogglePhysicsDebug extends BaseLetterDefinition {
	}
	interface StartRecordMessageDefinition {
		file_name: string;
		frame_period: string;
		fps: string;
	}
	/**
	 * Starts video recording of the game frame-buffer to file (desktop platforms only).
	 * Can only be sent to the designated @system socket.
	 */
	interface LetterStartRecord extends BaseLetterDefinition {
		data: StartRecordMessageDefinition;
	}
	/**
	 * Stops the currently active video recording (desktop platforms only).
	 * Can only be sent to the designated @system socket.
	 */
	interface LetterStopRecord extends BaseLetterDefinition {
	}
	interface RebootMessageDefinition {
		arg1: string;
		arg2: string;
		arg3: string;
		arg4: string;
		arg5: string;
		arg6: string;
	}
	/**
	 * Reboots the game engine with specified command line arguments.
	 * Can only be sent to the designated @system socket.
	 */
	interface LetterReboot extends BaseLetterDefinition {
		data?: RebootMessageDefinition | undefined;
	}
	/**
	 * Resume rendering.
	 * Can only be sent to the designated @system socket.
	 */
	interface LetterResumeRendering extends BaseLetterDefinition {
	}
	interface SetVsyncMessageDefinition {
		swap_interval: string;
	}
	/**
	 * Sets the vsync swap interval for front and back buffers synchronization.
	 * Can only be sent to the designated @system socket.
	 */
	interface LetterSetVsync extends BaseLetterDefinition {
		data: SetVsyncMessageDefinition;
	}
	interface SetUpdateFrequencyMessageDefinition {
		frequency: string;
	}
	/**
	 * Sets game update-frequency (frame cap) at runtime.
	 * Can only be sent to the designated @system socket.
	 */
	interface LetterSetUpdateFrequency extends BaseLetterDefinition {
		data: SetUpdateFrequencyMessageDefinition;
	}
	/**
	 * ------------------------
	 * ------------------------
	 */
	interface logger {
		debug: (...args: any[]) => unknown;
		trace: (...args: any[]) => unknown;
		info: (...args: any[]) => unknown;
		warn: (...args: any[]) => unknown;
		error: (...args: any[]) => unknown;
	}
	/**
	 * Letters are messages defined by Pigeon.
	 * Pigeon provides an example "letters" module that contains constant message data definitions in a single module.
	 * This Letters module describes all Defold system messages by default.
	 * You can modify, add, or remove messages (letters) with API functions,
	 * or you can access this data directly using Pigeon.letters[hashed_message_id].
	 * Every time a message is posted using Pigeon with this message defined as a letter,
	 * the message data is verified according to these settings.
	 */
	interface Pigeon {
		letters: Letters;
		define: (message_id: MessageId, message_def?: MessageDefinition) => boolean;
		define_batch: (letters_table: LuaTable<string, LetterEntry>, is_overwriting?: boolean) => LuaTable<string, boolean>;
		subscribe: (messages: MessagesGroup, callback?: (...args: any[]) => unknown, url?: Url | Opaque<"userdata"> | string, context?: LuaTable, is_optimizing?: boolean) => number | boolean;
		extend_subscription: (id: number, messages: MessagesGroup) => boolean;
		reduce_subscription: (id: number, messages: MessagesGroup) => boolean;
		unsubscribe: (id: number | number[] | boolean | undefined) => boolean;
		unsubscribe_all: () => boolean;
		send: (message_id: MessageId, message?: LuaTable) => boolean;
		send_to: (url: Url | Opaque<"userdata"> | string | hash, message_id: MessageId, message?: LuaTable) => boolean;
		toggle_logging: (enable: boolean) => boolean;
		set_dependency_module_log: (module: LuaTable | undefined, tag?: string) => boolean;
		set_dependency_module_hashed: (module: (...args: any[]) => unknown) => boolean;
		"new": (handlers: LuaTable<hash, (...args: any[]) => unknown>, tag?: string) => LuaTable;
	}
	interface LetterEntry {
		id: unknown;
		data: unknown;
	}
	interface PigeonImpl {
	}
	/**
	 * Typer provides type checking and assertion functions for Lua and Defold.
	 */
	interface Typer {
	}
	/**
	 * ------------------------
	 * ------------------------
	 * ------------------------
	 * ------------------------
	 * Define a single message schema for runtime validation.
	 * Built-in Defold/system message ids are always protected from redefinition.
	 */
	export function define(this: void, message_id: MessageId, message_def?: MessageDefinition): boolean;
	/**
	 * Define multiple message schemas at once from a table of letter definitions.
	 * Built-in Defold/system message ids are always protected from redefinition.
	 */
	export function define_batch(this: void, letters_table: LuaMap<string, LetterEntry> | Record<string, LetterEntry>, is_overwriting?: boolean): LuaTable<string, boolean>;
	/**
	 * Subscribe to given message_id(s) and optionally add a hook called immediately on send.
	 * Hook runs synchronously in the sender context (inside Pigeon.send) before msg.post,
	 * and does not run in the receiver script.
	 */
	export function subscribe(this: void, messages: MessagesGroup, callback?: (...args: any[]) => unknown, url?: Url | Opaque<"userdata"> | string, context?: LuaTable, is_optimizing?: boolean): number | boolean;
	/**
	 * Add message subscriptions to an existing subscriber id.
	 */
	export function extend_subscription(this: void, id: number, messages: MessagesGroup): boolean;
	/**
	 * Remove message subscriptions from an existing subscriber id.
	 */
	export function reduce_subscription(this: void, id: number, messages: MessagesGroup): boolean;
	/**
	 * Unsubscribe one or more subscriptions.
	 */
	export function unsubscribe(this: void, id?: number | number[] | boolean | undefined): boolean;
	/**
	 * Unsubscribe all saved subscriptions.
	 */
	export function unsubscribe_all(this: void): boolean;
	/**
	 * Send a message of given message_id with given message table to all subscribed subscribers.
	 * Additionally, Pigeon checks in runtime if message is correct if defined.
	 * If the message has a hook attached, it will be called immediately.
	 */
	export function send(this: void, message_id: MessageId, message?: LuaTable): boolean;
	/**
	 * Equivalent to Defold built-in `msg.post`. Sends a message of given message_id with an optional data in message table to a specified url.
	 * Accepts the same target forms as `msg.post`: a `url` userdata, a url-like
	 * `string` (e.g. "/gui#hud" or "#fragment"), or a `hash` game object id
	 * (e.g. the id returned by `factory.create` or `go.get_id`).
	 * Additionally, Pigeon checks in runtime if message is correct if defined.
	 */
	export function send_to(this: void, url: Url | string | hash | Opaque<"userdata">, message_id: MessageId, message?: LuaTable): boolean;
	/**
	 * Enable or disable logging functionality.
	 * It only switches between default logging (printing to console) and not logging.
	 * If you want to use dependency logging, you need to set dependency again after enabling logging.
	 * The correctness of arguments is not checked! Use responsibly!
	 */
	export function toggle_logging(this: void, enable: boolean): void;
	/**
	 * Replace internal printing with logging from Log module.
	 * It is suited for Log API, so if you want to provide your own module, follow the API,
	 * or modify internal Pigeon calls for logging accordingly.
	 * The correctness of arguments is not checked! Use responsibly!
	 */
	export function set_dependency_module_log(this: void, module?: LuaTable | undefined, tag?: string): void;
	/**
	 * @deprecated Pigeon always uses its internal `hashed` module. This function is a no-op kept for backward compatibility.
	 */
	export function set_dependency_module_hashed(this: void, module: (...args: any[]) => unknown): boolean;
	/**
	 * Creates a new instance that registers message handlers and subscribes to their messages with an optional tag for logging.
	 */
	export function new_(this: void, handlers: LuaMap<hash, (...args: any[]) => unknown>, tag?: string): LuaTable;
	export { new_ as new };
}
