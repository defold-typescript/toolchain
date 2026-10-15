/** @noSelfInFile */
import type { Hash, Quaternion, Url, Vector3 } from "../../src/core-types";

declare global {
  /**
   * Game object API documentation
   */
  namespace go {
    /**
     * Options for accessing indexed or internal component properties with go.get and go.set.
     */
    interface property_options {
      /**
       * Index into an array property, starting at one.
       */
      index?: number;
      /**
       * Name of an internal property.
       */
      key?: Hash;
      /**
       * Internal component resources identified by key, such as particle FX emitters.
       */
      keys?: Hash[];
    }
    type Easing = typeof go.EASING_INBACK | typeof go.EASING_INBOUNCE | typeof go.EASING_INCIRC | typeof go.EASING_INCUBIC | typeof go.EASING_INELASTIC | typeof go.EASING_INEXPO | typeof go.EASING_INOUTBACK | typeof go.EASING_INOUTBOUNCE | typeof go.EASING_INOUTCIRC | typeof go.EASING_INOUTCUBIC | typeof go.EASING_INOUTELASTIC | typeof go.EASING_INOUTEXPO | typeof go.EASING_INOUTQUAD | typeof go.EASING_INOUTQUART | typeof go.EASING_INOUTQUINT | typeof go.EASING_INOUTSINE | typeof go.EASING_INQUAD | typeof go.EASING_INQUART | typeof go.EASING_INQUINT | typeof go.EASING_INSINE | typeof go.EASING_LINEAR | typeof go.EASING_OUTBACK | typeof go.EASING_OUTBOUNCE | typeof go.EASING_OUTCIRC | typeof go.EASING_OUTCUBIC | typeof go.EASING_OUTELASTIC | typeof go.EASING_OUTEXPO | typeof go.EASING_OUTINBACK | typeof go.EASING_OUTINBOUNCE | typeof go.EASING_OUTINCIRC | typeof go.EASING_OUTINCUBIC | typeof go.EASING_OUTINELASTIC | typeof go.EASING_OUTINEXPO | typeof go.EASING_OUTINQUAD | typeof go.EASING_OUTINQUART | typeof go.EASING_OUTINQUINT | typeof go.EASING_OUTINSINE | typeof go.EASING_OUTQUAD | typeof go.EASING_OUTQUART | typeof go.EASING_OUTQUINT | typeof go.EASING_OUTSINE;
    type Playback = typeof go.PLAYBACK_ONCE_FORWARD | typeof go.PLAYBACK_ONCE_BACKWARD | typeof go.PLAYBACK_ONCE_PINGPONG | typeof go.PLAYBACK_LOOP_FORWARD | typeof go.PLAYBACK_LOOP_BACKWARD | typeof go.PLAYBACK_LOOP_PINGPONG;
    type EASING = typeof go.EASING_INBACK | typeof go.EASING_INBOUNCE | typeof go.EASING_INCIRC | typeof go.EASING_INCUBIC | typeof go.EASING_INELASTIC | typeof go.EASING_INEXPO | typeof go.EASING_INOUTBACK | typeof go.EASING_INOUTBOUNCE | typeof go.EASING_INOUTCIRC | typeof go.EASING_INOUTCUBIC | typeof go.EASING_INOUTELASTIC | typeof go.EASING_INOUTEXPO | typeof go.EASING_INOUTQUAD | typeof go.EASING_INOUTQUART | typeof go.EASING_INOUTQUINT | typeof go.EASING_INOUTSINE | typeof go.EASING_INQUAD | typeof go.EASING_INQUART | typeof go.EASING_INQUINT | typeof go.EASING_INSINE | typeof go.EASING_LINEAR | typeof go.EASING_OUTBACK | typeof go.EASING_OUTBOUNCE | typeof go.EASING_OUTCIRC | typeof go.EASING_OUTCUBIC | typeof go.EASING_OUTELASTIC | typeof go.EASING_OUTEXPO | typeof go.EASING_OUTINBACK | typeof go.EASING_OUTINBOUNCE | typeof go.EASING_OUTINCIRC | typeof go.EASING_OUTINCUBIC | typeof go.EASING_OUTINELASTIC | typeof go.EASING_OUTINEXPO | typeof go.EASING_OUTINQUAD | typeof go.EASING_OUTINQUART | typeof go.EASING_OUTINQUINT | typeof go.EASING_OUTINSINE | typeof go.EASING_OUTQUAD | typeof go.EASING_OUTQUART | typeof go.EASING_OUTQUINT | typeof go.EASING_OUTSINE;
    type PLAYBACK = typeof go.PLAYBACK_LOOP_BACKWARD | typeof go.PLAYBACK_LOOP_FORWARD | typeof go.PLAYBACK_LOOP_PINGPONG | typeof go.PLAYBACK_NONE | typeof go.PLAYBACK_ONCE_BACKWARD | typeof go.PLAYBACK_ONCE_FORWARD | typeof go.PLAYBACK_ONCE_PINGPONG;
    /**
     * in-back
     */
    const EASING_INBACK: number & { readonly __brand: "go.EASING_INBACK" };
    /**
     * in-bounce
     */
    const EASING_INBOUNCE: number & { readonly __brand: "go.EASING_INBOUNCE" };
    /**
     * in-circlic
     */
    const EASING_INCIRC: number & { readonly __brand: "go.EASING_INCIRC" };
    /**
     * in-cubic
     */
    const EASING_INCUBIC: number & { readonly __brand: "go.EASING_INCUBIC" };
    /**
     * in-elastic
     */
    const EASING_INELASTIC: number & { readonly __brand: "go.EASING_INELASTIC" };
    /**
     * in-exponential
     */
    const EASING_INEXPO: number & { readonly __brand: "go.EASING_INEXPO" };
    /**
     * in-out-back
     */
    const EASING_INOUTBACK: number & { readonly __brand: "go.EASING_INOUTBACK" };
    /**
     * in-out-bounce
     */
    const EASING_INOUTBOUNCE: number & { readonly __brand: "go.EASING_INOUTBOUNCE" };
    /**
     * in-out-circlic
     */
    const EASING_INOUTCIRC: number & { readonly __brand: "go.EASING_INOUTCIRC" };
    /**
     * in-out-cubic
     */
    const EASING_INOUTCUBIC: number & { readonly __brand: "go.EASING_INOUTCUBIC" };
    /**
     * in-out-elastic
     */
    const EASING_INOUTELASTIC: number & { readonly __brand: "go.EASING_INOUTELASTIC" };
    /**
     * in-out-exponential
     */
    const EASING_INOUTEXPO: number & { readonly __brand: "go.EASING_INOUTEXPO" };
    /**
     * in-out-quadratic
     */
    const EASING_INOUTQUAD: number & { readonly __brand: "go.EASING_INOUTQUAD" };
    /**
     * in-out-quartic
     */
    const EASING_INOUTQUART: number & { readonly __brand: "go.EASING_INOUTQUART" };
    /**
     * in-out-quintic
     */
    const EASING_INOUTQUINT: number & { readonly __brand: "go.EASING_INOUTQUINT" };
    /**
     * in-out-sine
     */
    const EASING_INOUTSINE: number & { readonly __brand: "go.EASING_INOUTSINE" };
    /**
     * in-quadratic
     */
    const EASING_INQUAD: number & { readonly __brand: "go.EASING_INQUAD" };
    /**
     * in-quartic
     */
    const EASING_INQUART: number & { readonly __brand: "go.EASING_INQUART" };
    /**
     * in-quintic
     */
    const EASING_INQUINT: number & { readonly __brand: "go.EASING_INQUINT" };
    /**
     * in-sine
     */
    const EASING_INSINE: number & { readonly __brand: "go.EASING_INSINE" };
    /**
     * linear interpolation
     */
    const EASING_LINEAR: number & { readonly __brand: "go.EASING_LINEAR" };
    /**
     * out-back
     */
    const EASING_OUTBACK: number & { readonly __brand: "go.EASING_OUTBACK" };
    /**
     * out-bounce
     */
    const EASING_OUTBOUNCE: number & { readonly __brand: "go.EASING_OUTBOUNCE" };
    /**
     * out-circlic
     */
    const EASING_OUTCIRC: number & { readonly __brand: "go.EASING_OUTCIRC" };
    /**
     * out-cubic
     */
    const EASING_OUTCUBIC: number & { readonly __brand: "go.EASING_OUTCUBIC" };
    /**
     * out-elastic
     */
    const EASING_OUTELASTIC: number & { readonly __brand: "go.EASING_OUTELASTIC" };
    /**
     * out-exponential
     */
    const EASING_OUTEXPO: number & { readonly __brand: "go.EASING_OUTEXPO" };
    /**
     * out-in-back
     */
    const EASING_OUTINBACK: number & { readonly __brand: "go.EASING_OUTINBACK" };
    /**
     * out-in-bounce
     */
    const EASING_OUTINBOUNCE: number & { readonly __brand: "go.EASING_OUTINBOUNCE" };
    /**
     * out-in-circlic
     */
    const EASING_OUTINCIRC: number & { readonly __brand: "go.EASING_OUTINCIRC" };
    /**
     * out-in-cubic
     */
    const EASING_OUTINCUBIC: number & { readonly __brand: "go.EASING_OUTINCUBIC" };
    /**
     * out-in-elastic
     */
    const EASING_OUTINELASTIC: number & { readonly __brand: "go.EASING_OUTINELASTIC" };
    /**
     * out-in-exponential
     */
    const EASING_OUTINEXPO: number & { readonly __brand: "go.EASING_OUTINEXPO" };
    /**
     * out-in-quadratic
     */
    const EASING_OUTINQUAD: number & { readonly __brand: "go.EASING_OUTINQUAD" };
    /**
     * out-in-quartic
     */
    const EASING_OUTINQUART: number & { readonly __brand: "go.EASING_OUTINQUART" };
    /**
     * out-in-quintic
     */
    const EASING_OUTINQUINT: number & { readonly __brand: "go.EASING_OUTINQUINT" };
    /**
     * out-in-sine
     */
    const EASING_OUTINSINE: number & { readonly __brand: "go.EASING_OUTINSINE" };
    /**
     * out-quadratic
     */
    const EASING_OUTQUAD: number & { readonly __brand: "go.EASING_OUTQUAD" };
    /**
     * out-quartic
     */
    const EASING_OUTQUART: number & { readonly __brand: "go.EASING_OUTQUART" };
    /**
     * out-quintic
     */
    const EASING_OUTQUINT: number & { readonly __brand: "go.EASING_OUTQUINT" };
    /**
     * out-sine
     */
    const EASING_OUTSINE: number & { readonly __brand: "go.EASING_OUTSINE" };
    /**
     * loop backward
     */
    const PLAYBACK_LOOP_BACKWARD: number & { readonly __brand: "go.PLAYBACK_LOOP_BACKWARD" };
    /**
     * loop forward
     */
    const PLAYBACK_LOOP_FORWARD: number & { readonly __brand: "go.PLAYBACK_LOOP_FORWARD" };
    /**
     * ping pong loop
     */
    const PLAYBACK_LOOP_PINGPONG: number & { readonly __brand: "go.PLAYBACK_LOOP_PINGPONG" };
    /**
     * no playback
     */
    const PLAYBACK_NONE: number & { readonly __brand: "go.PLAYBACK_NONE" };
    /**
     * once backward
     */
    const PLAYBACK_ONCE_BACKWARD: number & { readonly __brand: "go.PLAYBACK_ONCE_BACKWARD" };
    /**
     * once forward
     */
    const PLAYBACK_ONCE_FORWARD: number & { readonly __brand: "go.PLAYBACK_ONCE_FORWARD" };
    /**
     * once ping pong
     */
    const PLAYBACK_ONCE_PINGPONG: number & { readonly __brand: "go.PLAYBACK_ONCE_PINGPONG" };
    /**
     * This is a callback-function, which is called by the engine when a script component is finalized (destroyed). It can
     * be used to e.g. take some last action, report the finalization to other game object instances, delete spawned objects
     * or release user input focus (see release_input_focus).
     *
     * @param self - script instance used for storing state
     * @example
     * ```ts
     * export default defineScript({
     *   init() {
     *     return { some_value: 0 };
     *   },
     *
     *   final(self) {
     *     // report finalization
     *     msg.post("my_friend_instance", "im_dead", { my_stats: self.some_value });
     *   },
     * });
     * ```
     */
    function final(self: unknown): void;
    /**
     * This is a callback-function, which is called by the engine at fixed intervals to update the state of a script
     * component. The function will be called if 'Fixed Update Frequency' is enabled in the Engine section of game.project.
     * It can for instance be used to update game logic with the physics simulation if using a fixed timestep for the
     * physics (enabled by ticking 'Use Fixed Timestep' in the Physics section of game.project).
     *
     * @param self - script instance used for storing state
     * @param dt - the time-step of the frame update
     */
    function fixed_update(self: unknown, dt: number): void;
    /**
     * This is a callback-function, which is called by the engine when a script component is initialized. It can be used
     * to set the initial state of the script.
     *
     * @param self - script instance used for storing state
     * @example
     * ```ts
     * export default defineScript({
     *   init() {
     *     // set up useful data
     *     return { my_value: 1 };
     *   },
     * });
     * ```
     */
    function init(self: unknown): void;
    /**
     * This is a callback-function, which is called by the engine at the end of the frame to update the state of a script
     * component. Use it to make final adjustments to the game object instance.
     *
     * @param self - script instance used for storing state
     * @param dt - the time-step of the frame update
     */
    function late_update(self: unknown, dt: number): void;
    /**
     * This is a callback-function, which is called by the engine when user input is sent to the game object instance of the script.
     * It can be used to take action on the input, e.g. move the instance according to the input.
     * For an instance to obtain user input, it must first acquire input focus
     * through the message `acquire_input_focus`.
     * Any instance that has obtained input will be put on top of an
     * input stack. Input is sent to all listeners on the stack until the
     * end of stack is reached, or a listener returns `true`
     * to signal that it wants input to be consumed.
     * See the documentation of acquire_input_focus for more
     * information.
     *
     * @param self - script instance used for storing state
     * @param action_id - id of the received input action, as mapped in the input_binding-file, or `nil` for mouse movement
     * @param action - input data for the action. **0️⃣ `gamepad` is 0-based; passed to Defold unchanged.**
     * @returns optional boolean to signal if the input should be consumed (not passed on to others) or not, default is false
     * @example
     * ```ts
     * // This example demonstrates how a game object instance can be moved as a response to user input.
     * export default defineScript({
     *   init() {
     *     // acquire input focus
     *     msg.post(".", "acquire_input_focus");
     *     return {
     *       // maximum speed the instance can be moved
     *       max_speed: 2,
     *       // velocity of the instance, initially zero
     *       velocity: vmath.vector3(),
     *     };
     *   },
     *
     *   update(self, dt) {
     *     // move the instance
     *     go.set_position(go.get_position().add(self.velocity.mul(dt)));
     *   },
     *
     *   on_input(self, action_id, action) {
     *     // check for movement input
     *     if (action_id === hash("right")) {
     *       if (action.released) {
     *         // reset velocity if input was released
     *         self.velocity = vmath.vector3();
     *       } else {
     *         // update velocity
     *         self.velocity = vmath.vector3((action.value ?? 0) * self.max_speed, 0, 0);
     *       }
     *     }
     *   },
     * });
     * ```
     */
    function on_input(self: unknown, action_id: Hash | undefined, action: go.on_input.action): boolean | undefined;
    /**
     * This is a callback-function, which is called by the engine whenever a message has been sent to the script component.
     * It can be used to take action on the message, e.g. send a response back to the sender of the message.
     * The `message` parameter is a table containing the message data. If the message is sent from the engine, the
     * documentation of the message specifies which data is supplied.
     *
     * @param self - script instance used for storing state
     * @param message_id - id of the received message
     * @param message - a table containing the message data
     * @param sender - address of the sender
     * @example
     * This example demonstrates how a game object instance, called "a", can communicate with another instance, called "b". It
     * is assumed that both script components of the instances has id "script".
     * Script of instance "a":
     * ```ts
     * // This example demonstrates how a game object instance, called "a", can communicate with another instance, called "b". It
     * // is assumed that both script components of the instances has id "script".
     *
     * // a.script — Script of instance "a":
     * export default defineScript({
     *   init() {
     *     // let b know about some important data
     *     msg.post("b#script", "my_data", { important_value: 1 });
     *   },
     * });
     * ```
     * @example
     * Script of instance "b":
     * ```ts
     * // b.script — Script of instance "b":
     * export default defineScript({
     *   init() {
     *     // store the url of instance "a" for later use, by specifying undefined as socket we
     *     // automatically use our own socket
     *     return { a_url: msg.url(undefined, go.get_id("a"), "script"), important_value: 0 };
     *   },
     *
     *   on_message(self, message_id, message, sender) {
     *     // check message and sender
     *     if (message_id === hash("my_data") && sender === self.a_url && typeof message.important_value === "number") {
     *       // use the data in some way
     *       self.important_value = message.important_value;
     *     }
     *   },
     * });
     * ```
     */
    function on_message(self: unknown, message_id: Hash, message: LuaMap<AnyNotNil, unknown> | Record<string, unknown>, sender: Url): void;
    /**
     * This is a callback-function, which is called by the engine when the script component is reloaded, e.g. from the editor.
     * It can be used for live development, e.g. to tweak constants or set up the state properly for the instance.
     *
     * @param self - script instance used for storing state
     * @example
     * ```ts
     * // This example demonstrates how to tweak the speed of a game object instance that is moved on user input.
     * export default defineScript({
     *   init() {
     *     // acquire input focus
     *     msg.post(".", "acquire_input_focus");
     *     return {
     *       // maximum speed the instance can be moved, this value is tweaked in the on_reload function below
     *       max_speed: 2,
     *       // velocity of the instance, initially zero
     *       velocity: vmath.vector3(),
     *     };
     *   },
     *
     *   update(self, dt) {
     *     // move the instance
     *     go.set_position(go.get_position().add(self.velocity.mul(dt)));
     *   },
     *
     *   on_input(self, action_id, action) {
     *     // check for movement input
     *     if (action_id === hash("right")) {
     *       if (action.released) {
     *         // reset velocity if input was released
     *         self.velocity = vmath.vector3();
     *       } else {
     *         // update velocity
     *         self.velocity = vmath.vector3((action.value ?? 0) * self.max_speed, 0, 0);
     *       }
     *     }
     *   },
     *
     *   on_reload(self) {
     *     // edit this value and reload the script component
     *     self.max_speed = 100;
     *   },
     * });
     * ```
     */
    function on_reload(self: unknown): void;
    /**
     * This is a callback-function, which is called by the engine every frame to update the state of a script component.
     * It can be used to perform any kind of game related tasks, e.g. moving the game object instance.
     *
     * @param self - script instance used for storing state
     * @param dt - the time-step of the frame update
     * @example
     * ```ts
     * // This example demonstrates how to move a game object instance through the script component:
     * export default defineScript({
     *   init() {
     *     // set initial velocity to be 1 along world x-axis
     *     return { my_velocity: vmath.vector3(1, 0, 0) };
     *   },
     *
     *   update(self, dt) {
     *     // move the game object instance
     *     go.set_position(go.get_position().add(self.my_velocity.mul(dt)));
     *   },
     * });
     * ```
     */
    function update(self: unknown, dt: number): void;
    namespace on_input {
      /**
       * Data supplied to the global `on_input` lifecycle function.
       */
      interface action {
        /**
         * Amount of input, usually 1 for buttons or between 0 and 1 for analogue input; absent for pointer movement and text input.
         */
        value?: number;
        /**
         * Whether the input was pressed this frame; absent for pointer movement and text input.
         */
        pressed?: boolean;
        /**
         * Whether the input was released this frame; absent for pointer movement and text input.
         */
        released?: boolean;
        /**
         * Whether the input was repeated this frame; absent for pointer movement and text input.
         */
        repeated?: boolean;
        /**
         * Pointer x-coordinate; absent for gamepad, key, and text input.
         */
        x?: number;
        /**
         * Pointer y-coordinate; absent for gamepad, key, and text input.
         */
        y?: number;
        /**
         * Pointer x-coordinate in screen space; absent for gamepad, key, and text input.
         */
        screen_x?: number;
        /**
         * Pointer y-coordinate in screen space; absent for gamepad, key, and text input.
         */
        screen_y?: number;
        /**
         * Change in the pointer x-coordinate; absent for gamepad, key, and text input.
         */
        dx?: number;
        /**
         * Change in the pointer y-coordinate; absent for gamepad, key, and text input.
         */
        dy?: number;
        /**
         * Change in the pointer x-coordinate in screen space; absent for gamepad, key, and text input.
         */
        screen_dx?: number;
        /**
         * Change in the pointer y-coordinate in screen space; absent for gamepad, key, and text input.
         */
        screen_dy?: number;
        /**
         * Accelerometer x value, when present.
         */
        acc_x?: number;
        /**
         * Accelerometer y value, when present.
         */
        acc_y?: number;
        /**
         * Accelerometer z value, when present.
         */
        acc_z?: number;
        /**
         * Index of the gamepad that provided the input.
         */
        gamepad?: number;
        /**
         * Id of the user associated with the controller.
         */
        userid?: number;
        /**
         * SDL-compatible guid, supplied with a gamepad-connected action.
         */
        gamepad_guid?: string;
        /**
         * Parsed guid information, supplied with a gamepad-connected action.
         */
        gamepad_guid_info?: go.on_input.gamepad_guid_info;
        /**
         * Whether the input originated from an unknown or unmapped gamepad.
         */
        gamepad_unknown?: boolean;
        /**
         * Name of a connected gamepad.
         */
        gamepad_name?: string;
        /**
         * Axis values, supplied only for raw gamepad input.
         */
        gamepad_axis?: number[];
        /**
         * Hat values, supplied only for raw gamepad input.
         */
        gamepad_hats?: number[];
        /**
         * Button values, supplied only for raw gamepad input.
         */
        gamepad_buttons?: number[];
        /**
         * Touch inputs, one entry per finger.
         */
        touch?: go.on_input.touch[];
        /**
         * Text entered by a text action, or the current sequence for marked-text composition such as Japanese Kana.
         */
        text?: string;
      }
      /**
       * Parsed fields from a connected gamepad guid.
       */
      interface gamepad_guid_info {
        /**
         * USB vendor id.
         */
        vendor: number;
        /**
         * USB product id.
         */
        product: number;
        /**
         * Bus used to communicate with the device.
         */
        bus: number;
        /**
         * SDL CRC16 signature.
         */
        crc: number;
        /**
         * Device or firmware version.
         */
        version: number;
      }
      /**
       * One touch entry in on_input.action.
       */
      interface touch {
        /**
         * Identifier for the touch during its lifetime.
         */
        id: number;
        /**
         * Whether the finger was pressed this frame.
         */
        pressed: boolean;
        /**
         * Whether the finger was released this frame.
         */
        released: boolean;
        /**
         * Number of taps, such as one for a single tap and two for a double tap.
         */
        tap_count: number;
        /**
         * Touch x-coordinate.
         */
        x: number;
        /**
         * Touch y-coordinate.
         */
        y: number;
        /**
         * Touch x-coordinate in screen space.
         */
        screen_x: number;
        /**
         * Touch y-coordinate in screen space.
         */
        screen_y: number;
        /**
         * Change in the touch x-coordinate.
         */
        dx: number;
        /**
         * Change in the touch y-coordinate.
         */
        dy: number;
        /**
         * Change in the touch x-coordinate in screen space.
         */
        screen_dx: number;
        /**
         * Change in the touch y-coordinate in screen space.
         */
        screen_dy: number;
      }
    }
    interface properties {
      /**
       * The rotation of the game object expressed in Euler angles.
       * Euler angles are specified in degrees in the interval (-360, 360).
       * The type of the property is vector3.
       */
      euler: Vector3;
      /**
       * The position of the game object.
       * The type of the property is vector3.
       */
      position: Vector3;
      /**
       * The rotation of the game object.
       * The type of the property is quaternion.
       */
      rotation: Quaternion;
      /**
       * The scale of the game object. `go.get` returns a vector3; `go.set` and `go.animate` also take a number, which sets a uniform scale.
       */
      scale: number | Vector3;
    }
  }
}

export {};
