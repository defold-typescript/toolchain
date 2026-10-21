/** @noSelfInFile */
declare global {
  /**
   * Functions and constants for interacting with webview APIs
   */
  namespace webview {
    const CALLBACK_RESULT_EVAL_ERROR: number & { readonly __brand: "webview.CALLBACK_RESULT_EVAL_ERROR" };
    const CALLBACK_RESULT_EVAL_OK: number & { readonly __brand: "webview.CALLBACK_RESULT_EVAL_OK" };
    const CALLBACK_RESULT_URL_ERROR: number & { readonly __brand: "webview.CALLBACK_RESULT_URL_ERROR" };
    const CALLBACK_RESULT_URL_LOADING: number & { readonly __brand: "webview.CALLBACK_RESULT_URL_LOADING" };
    const CALLBACK_RESULT_URL_OK: number & { readonly __brand: "webview.CALLBACK_RESULT_URL_OK" };
    /**
     * Creates a webview instance. It can show HTML pages as well as evaluate Javascript. The view remains hidden until the first call. There can exist a maximum of 4 webviews at the same time.
     * On iOS, the callback will never get a `webview.CALLBACK_RESULT_EVAL_ERROR`, due to the iOS SDK implementation."
     *
     * @param callback - A callback which receives info about finished requests taking the following parameters:
     * @returns The id number of the webview
     * @example
     * ```lua
     * local function webview_callback(self, webview_id, request_id, type, data)
     *     if type == webview.CALLBACK_RESULT_URL_OK then
     *         -- the page is now loaded, let's show it
     *         webview.set_visible(webview_id, 1)
     *     elseif type == webview.CALLBACK_RESULT_URL_ERROR then
     *         print("Failed to load url: " .. data["url"])
     *         print("Error: " .. data["error"])
     *     elseif type == webview.CALLBACK_RESULT_URL_LOADING then
     *         -- a page is loading
     *         -- return false to prevent it from loading
     *         -- return true or nil to continue loading the page
     *         if data.url ~= "https://www.defold.com/" then
     *             return false
     *         end
     *     elseif type == webview.CALLBACK_RESULT_EVAL_OK then
     *         print("Eval ok. Result: " .. data['result'])
     *     elseif type == webview.CALLBACK_RESULT_EVAL_ERROR then
     *         print("Eval not ok. Request # " .. request_id)
     *     end
     * end
     * local webview_id = webview.create(webview_callback)
     * ```
     */
    function create(callback: (self: unknown, webview_id: number, request_id: number, type: number & { readonly __brand: "webview.CALLBACK_RESULT_URL_OK" } | number & { readonly __brand: "webview.CALLBACK_RESULT_URL_ERROR" } | number & { readonly __brand: "webview.CALLBACK_RESULT_URL_LOADING" } | number & { readonly __brand: "webview.CALLBACK_RESULT_EVAL_OK" } | number & { readonly __brand: "webview.CALLBACK_RESULT_EVAL_ERROR" }, data: { url: string; result: string }) => void): number;
    /**
     * Destroys an instance of a webview.
     *
     * @param webview_id - The webview id (returned by the `webview.create()` call)
     */
    function destroy(webview_id: number): void;
    /**
     * Evaluates JavaScript within the context of the currently loaded page (if any). Once the request is done, the callback (registered in `webview.create()`) is invoked. The callback will get the result in the `data["result"]` field.
     *
     * @param webview_id - The webview id
     * @param code - The JavaScript code to evaluate
     * @returns The id number of the request
     * @example
     * ```lua
     * local request_id = webview.eval(webview_id, "GetMyFormData()")
     * ```
     */
    function eval(webview_id: number, code: string): number;
    /**
     * Returns the visibility state of the webview.
     *
     * @param webview_id - The webview id
     * @returns Returns `0` if not visible, `1` if it is visible
     */
    function is_visible(webview_id: number): number;
    /**
     * Opens a web page in the webview, using an URL. Once the request is done, the callback (registered in `webview.create()`) is invoked.
     *
     * @param webview_id - The webview id
     * @param url - The URL to open
     * @param options - A table of options for the request. Currently it holds these options:
     * @example
     * ```lua
     * local request_id = webview.open(webview_id, "http://www.defold.com", {hidden = true})
     * ```
     */
    function open(webview_id: number, url: string, options: { hidden?: boolean; headers?: Record<string | number, unknown>; transparent?: boolean }): void;
    /**
     * Opens a web page in the webview, using HTML data. Once the request is done, the callback (registered in `webview.create()`) is invoked.
     *
     * @param webview_id - The webview id
     * @param html - The HTML data to display
     * @param options - A table of options for the request. See `webview.open()`
     * @example
     * ```lua
     * local html = sys.load_resource("/main/data/test.html")
     * local request_id = webview.open_raw(webview_id, html, {hidden = true})
     * ```
     */
    function open_raw(webview_id: number, html: string, options: Record<string | number, unknown>): void;
    /**
     * Sets the position and size of the webview
     *
     * @param webview_id - The webview id
     * @param x - The x position of the webview
     * @param y - The y position of the webview
     * @param width - The width of the webview (-1 to match screen width)
     * @param height - The height of the webview (-1 to match screen height)
     */
    function set_position(webview_id: number, x: number, y: number, width: number, height: number): void;
    /**
     * Set transparency of webview background
     *
     * @param webview_id - The webview id
     * @param transparent - If `true`, the webview background becomes transparent, otherwise opaque.
     */
    function set_transparent(webview_id: number, transparent: boolean): void;
    /**
     * Shows or hides a webview
     *
     * @param webview_id - The webview id
     * @param visible - If `0`, hides the webview. If non zero, shows the view
     */
    function set_visible(webview_id: number, visible: number): void;
  }
}

export {};
