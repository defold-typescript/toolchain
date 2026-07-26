/** @noResolution */
declare module 'event.event' {
	type promise_state = "pending" | "resolved" | "rejected";
	/**
	 * Array of next items:
	 * [1] callback,
	 * [2] callback_context,
	 * [3] script_context
	 * [4] remaining: nil=infinite, number=fires left, 0=pending delete.
	 * [5] subscribed_event: event when callback is event with context.
	 */
	interface event_callback_data {
	}
	/**
	 * A logger object for event module should match the following interface
	 */
	interface event_logger {
		trace: (logger: event_logger, message: string, data: unknown | undefined) => void;
		debug: (logger: event_logger, message: string, data: unknown | undefined) => void;
		info: (logger: event_logger, message: string, data: unknown | undefined) => void;
		warn: (logger: event_logger, message: string, data: unknown | undefined) => void;
		error: (logger: event_logger, message: string, data: unknown | undefined) => void;
	}
	/**
	 * The Event module, used to create and manage events. Allows to subscribe to events and trigger them.
	 */
	interface event {
		/**
		 * Subscribe a callback to the event or other event. The callback will be invoked whenever the event is triggered.
		 * The callback_context parameter is optional and will be passed as the first parameter to the callback function.
		 * If the callback with context is already subscribed, the warning will be logged.
		 * local function callback(self)
		 * print("clicked!")
		 * end
		 * on_click_event:subscribe(callback, self)
		 *
		 * -- Subscribe an event to another event
		 * event_1 = event.create(callback)
		 * event_2 = event.create()
		 * event_2:subscribe(event_1) -- Now event2 will trigger event1
		 */
		subscribe(callback: unknown | event, callback_context: unknown | undefined): boolean;
		/**
		 * Subscribe a callback for a single trigger. After the first trigger the callback is automatically unsubscribed.
		 * on_click_event:subscribe_once(function(self) print("one-time click!") end, self)
		 */
		subscribe_once(callback: unknown | event, callback_context: unknown | undefined): boolean;
		/**
		 * Remove a previously subscribed callback from the event.
		 * The callback_context should be the same as the one used when subscribing the callback.
		 * If there is no callback_context provided, all callbacks with the same function will be unsubscribed.
		 * on_click_event:unsubscribe(callback, self)
		 */
		unsubscribe(callback: unknown | event, callback_context: unknown | undefined): boolean;
		/**
		 * Determine if a specific callback is currently subscribed to the event.
		 * The callback_context should be the same as the one used when subscribing the callback.
		 * local is_subscribed = on_click_event:is_subscribed(callback, self)
		 */
		is_subscribed(callback: unknown | event, callback_context: unknown | undefined): LuaMultiReturn<[boolean, number | undefined]>;
		/**
		 * Trigger the event, causing all subscribed callbacks to be executed.
		 * Any parameters passed to trigger will be forwarded to the callbacks.
		 * The return value of the last executed callback is returned.
		 * The event:trigger(...) can be called as event(...).
		 * on_click_event:trigger("arg1", "arg2")
		 *
		 * -- The event can be triggered as a function
		 * on_click_event("arg1", "arg2")
		 */
		trigger(...args: unknown[]): unknown;
		/**
		 * Check if the event has no subscribed callbacks.
		 * local is_empty = on_click_event:is_empty()
		 */
		is_empty(): boolean;
		/**
		 * Remove all callbacks subscribed to the event, effectively resetting it.
		 * on_click_event:clear()
		 */
		clear(): void;
	}
	/**
	 * Global events module that allows creation and management of global events that can be triggered from anywhere in your game.
	 * This is particularly useful for events that need to be handled by multiple scripts or systems.
	 */
	interface events {
	}
	interface promise_cancelled_context {
		is_cancelled: boolean;
		on_cancel: event;
	}
	/**
	 * The Promise module, used to create and manage promises.
	 * A promise represents a single asynchronous operation that will either resolve with a value or reject with a reason.
	 */
	interface promise {
		state: promise_state;
		value: unknown;
		cancellation: promise_cancelled_context;
		on_resolve: event;
		on_reject: event;
		_tail: promise | undefined;
		_cancel_children: LuaTable<promise, boolean> | undefined;
		/**
		 * Attach resolve and reject handlers to the promise.
		 * Returns a new promise that will be resolved or rejected based on the handlers' return values.
		 * load_data():next(function(data) return process(data) end):next(display):catch(show_error)
		 */
		next(on_resolved: unknown | promise | event | undefined, on_rejected: unknown | promise | event | undefined, context: unknown | undefined): promise;
		/**
		 * Attach a rejection handler to the promise. Equivalent to next(nil, on_rejected).
		 * load_data():catch(function(err) print("Failed:", err) end)
		 */
		"catch"(on_rejected: unknown | event, context: unknown | undefined): promise;
		/**
		 * Attach a handler that is called regardless of whether the promise is resolved or rejected.
		 * The handler is called with the resolved value or rejection reason.
		 * When context is provided, it is passed as the first argument.
		 * The handler return value is ignored.
		 * load_data():finally(function() hide_loading_spinner() end)
		 */
		"finally"(on_finally: unknown | event, context: unknown | undefined): promise;
		/**
		 * Check if the promise is in pending state.
		 */
		is_pending(): boolean;
		/**
		 * Check if the promise is in resolved state.
		 */
		is_resolved(): boolean;
		/**
		 * Check if the promise is in rejected state.
		 */
		is_rejected(): boolean;
		/**
		 * Check if the promise is finished (either resolved or rejected).
		 */
		is_finished(): boolean;
		/**
		 * Check if the shared cancel_context was cancelled.
		 */
		is_cancelled(): boolean;
		/**
		 * Call the promise to resolve it with a single value (e.g. as a one-argument callback).
		 */
		__call(value: unknown): void;
		/**
		 * Resolve the promise.
		 * my_promise:resolve(result)
		 */
		resolve(value: unknown): void;
		/**
		 * Reject the promise.
		 * my_promise:reject("failed")
		 */
		reject(reason: unknown): void;
		/**
		 * Cancel the promise chain. Triggers cleanup and rejects if still pending.
		 * my_promise:cancel()
		 */
		cancel(): void;
		/**
		 * Append a task to this promise's internal sequence without reassigning.
		 * The task may return a value or a promise. If `task` is a promise, the pipeline waits for it
		 * to finish and adopts its result. The incoming value is not forwarded into `task`
		 * (same as `append(function() return task end)`).
		 * Returns self for chaining.
		 * Almost similar to `promise = promise:next(task)`, but without reassigning the promise.
		 * pipeline:append(step1)
		 * pipeline:append(step2)
		 * pipeline:append(step3)
		 * local last = pipeline:tail()
		 * print("Is going to check status of", last:is_pending())
		 */
		append(task: ((value: unknown) => unknown) | promise): promise;
		/**
		 * Get the current tail promise representing all appended work.
		 * local last = pipeline:tail()
		 * last:next(on_complete)
		 */
		tail(): promise;
		/**
		 * Reset the internal sequence to an already resolved promise.
		 * pipeline:reset()
		 * pipeline:append(new_step)
		 */
		reset(): promise;
		/**
		 * Reject pending child promises when a settled promise is cancelled.
		 */
		_reject_cancel_children(): void;
		/**
		 * Cancel the promise chain.
		 */
		_cancel_promise(): void;
	}
	interface queue_event_data {
		data: unknown;
		on_handle: event;
	}
	/**
	 * The Queue module, used to create and manage FIFO event queues. Allows to push events to a queue and subscribe handlers to process them.
	 * Events are stored in the queue until they are handled by subscribers, following first-in-first-out (FIFO) order.
	 */
	interface queue {
		events: queue_event_data[];
		handlers: event[];
		once_state: LuaTable<event, number>;
		/**
		 * Push a new event to the queue. The event will exist until it's handled by a subscriber.
		 * If there are already subscribers for this queue instance, they will be called immediately.
		 * If multiple subscribers handle the event, all subscribers will still be called. The on_handle callback
		 * will be called for each subscriber that handles the event.
		 * my_queue:push(save_data)
		 * my_queue:push(save_data, function() print("saved!") end)
		 */
		push(data: unknown, on_handle: unknown | event | undefined, context: unknown | undefined): void;
		/**
		 * Subscribe a handler to this queue instance. When an event is pushed to this queue,
		 * the handler will be called. If there are already events in the queue, they will be processed immediately.
		 * Return a non-nil value from the handler to mark the event as handled and remove it from the queue.
		 * local function on_save(self, data)
		 * do_save(data)
		 * return true
		 * end
		 * my_queue:subscribe(on_save, self)
		 */
		subscribe(handler: unknown | event, context: unknown | undefined): boolean;
		/**
		 * Subscribe a handler until it handles one event. The handler is invoked for each event in the queue until it returns non-nil (handles an event)
		 * then it is automatically unsubscribed and will not be invoked again, even if more events remain in the queue.
		 * my_queue:subscribe_once(function(self, data) return process(data) end, self)
		 */
		subscribe_once(handler: unknown | event, context: unknown | undefined): boolean;
		/**
		 * Unsubscribe a handler from this queue instance.
		 * my_queue:unsubscribe(on_save, self)
		 */
		unsubscribe(handler: unknown | event, context: unknown | undefined): boolean;
		/**
		 * Check if a handler is subscribed to this queue instance.
		 * local ok = my_queue:is_subscribed(on_save, self)
		 */
		is_subscribed(handler: unknown | event, context: unknown | undefined): LuaMultiReturn<[boolean, number | undefined]>;
		/**
		 * Process all events in this queue immediately. Subscribers will not be called in this function.
		 * Events can be handled and removed in event handler callback. If event is handled, it will be removed from the queue.
		 * my_queue:process(function(self, data) return handle(data) end, self)
		 */
		process(event_handler: unknown | event, context: unknown | undefined): void;
		/**
		 * Process exactly one queued event with a specific handler (subscribers will NOT be called).
		 * If the handler returns non-nil the event will be removed from the queue.
		 * local handled = my_queue:process_next(function(data) return handle(data) end)
		 */
		process_next(event_handler: unknown | event | undefined, context: unknown | undefined): boolean;
		/**
		 * Get all pending events in this queue.
		 * for _, event_data in ipairs(my_queue:get_events()) do
		 * print(event_data.data)
		 * end
		 */
		get_events(): queue_event_data[];
		/**
		 * Clear all pending events in this queue.
		 * my_queue:clear_events()
		 */
		clear_events(): void;
		/**
		 * Clear all subscribers from this queue instance.
		 * my_queue:clear_subscribers()
		 */
		clear_subscribers(): void;
		/**
		 * Check if this queue has no pending events.
		 * if my_queue:is_empty() then
		 * return
		 * end
		 */
		is_empty(): boolean;
		/**
		 * Check if this queue instance has no subscribed handlers.
		 * if my_queue:has_subscribers() then
		 * my_queue:push(data)
		 * end
		 */
		has_subscribers(): boolean;
		/**
		 * Remove all events and handlers from this queue instance, effectively resetting it.
		 * my_queue:clear()
		 */
		clear(): void;
		/**
		 * Process the events if there are subscribers for this queue instance.
		 * If event is handled, it will be removed from the queue.
		 * All subscribers will be called for each event, even if it's already been handled.
		 */
		_check_subscribers(): void;
	}
	/**
	 * Global queues module that allows creation and management of global FIFO event queues that can be accessed from anywhere in your game.
	 * This is particularly useful for events that need to be handled by multiple scripts or systems using a queue-based approach.
	 */
	interface queues {
	}
	/**
	 * Generate a new event instance. This instance can then be used to subscribe to and trigger events.
	 * The callback function will be called when the event is triggered. The callback_context parameter is optional
	 * and will be passed as the first parameter to the callback function. Usually, it is used to pass the self instance.
	 * local e = event.create()
	 * local e = event.create(function(self) print("ok") end, self)
	 */
	export function create(this: void, callback: unknown | event | undefined, callback_context: unknown | undefined): event;
	/**
	 * Check if the table is an event instance.
	 * if event.is_event(my_value) then
	 * my_value:trigger()
	 * end
	 */
	export function is_event(this: void, value: unknown): boolean;
	/**
	 * Customize the logging mechanism used by Event module. You can use **Defold Log** library or provide a custom logger.
	 * By default, the module uses the `pprint` logger for errors.
	 */
	export function set_logger(this: void, logger_instance: event_logger | LuaTable | undefined): void;
	/**
	 * Set the mode of the event module.
	 */
	export function set_mode(this: void, mode: "pcall"): void;
}
