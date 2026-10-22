/** @noSelfInFile */
declare global {
  /**
   * Draw pixels and simple geometry into a texture buffer: lines, polylines,
   * circles, rectangles, arcs and Bezier curves, flood fills, and copies between
   * buffers. Every call takes a {@link pixels.BufferInfo} naming the target
   * buffer and its size.
   *
   * @see {@link https://github.com/king8fisher/defold-pixels|Github Source}
   */
  namespace pixels {
    /** Target buffer passed to every drawing call. */
    interface BufferInfo {
      // `buffer.create`'s return, since `buffer.BufferData` exists only from Defold 1.13.2.
      /** The pixel buffer to draw into or read. */
      buffer: ReturnType<typeof buffer.create>;
      /** Buffer width in pixels; must match the texture width. */
      width: number;
      /** Buffer height in pixels; must match the texture height. */
      height: number;
      /** 3 for RGB, 4 for RGBA. */
      channels: 3 | 4;
      /** Blend using premultiplied alpha. Default is `false`. */
      premultiply_alpha?: boolean;
    }

    /** `[r, g, b, a]` in 0..255; alpha defaults to 255. */
    type Color = [number, number, number] | [number, number, number, number];

    /** The stroke settings every {@link pixels.PolylineOptions} shares. */
    interface PolylineStyle {
      /** One alpha factor in 0..1 per point; scales both colors' alpha, linearly along each segment. */
      alphas?: number[];
      /** Color on the center line. */
      color: Color;
      /** Color at both edges. Defaults to `color` for a solid stroke. */
      edge_color?: Color;
      /** Corner style: `"bevel"` cuts corners flat, `"miter"` extends the outer edges until they meet. Default is `"bevel"`. */
      join?: "bevel" | "miter";
      /** Longest miter as a multiple of the half width, at least 1; longer miters are cut flat. Default is 4. */
      miter_limit?: number;
      /** `[x, y, w, h]`: only pixels inside this rectangle change. */
      clip?: [number, number, number, number];
    }

    /** A polyline stroked at one width. */
    interface PolylineWidth extends PolylineStyle {
      /** Stroke width in pixels, measured across the line. */
      width: number;
      /** One stroke width per point, replacing `width`; changes linearly along each segment. */
      widths?: number[];
    }

    /** A polyline stroked at a width given per point. */
    interface PolylinePointWidths extends PolylineStyle {
      /** Stroke width in pixels, measured across the line. Ignored when `widths` is given. */
      width?: number;
      /** One stroke width per point; changes linearly along each segment. */
      widths: number[];
    }

    /** Options for {@link pixels.polyline}: a `color` and either `width` or `widths`. */
    type PolylineOptions = PolylineWidth | PolylinePointWidths;

    /** Start recording drawn pixels as the boundary for {@link pixels.fill_area}. */
    function start_fill(): void;

    /** Stop recording the {@link pixels.fill_area} boundary. */
    function end_fill(): void;

    /**
     * Flood-fill the area containing (x, y), up to the boundary recorded between
     * {@link pixels.start_fill} and {@link pixels.end_fill}.
     *
     * @param buffer_info - The target buffer.
     * @param x - X of a pixel inside the area.
     * @param y - Y of a pixel inside the area.
     * @param red - Red in 0..255.
     * @param green - Green in 0..255.
     * @param blue - Blue in 0..255.
     * @param alpha - Alpha in 0..255. Default is 0; 3-channel buffers ignore it.
     */
    function fill_area(
      buffer_info: BufferInfo,
      x: number,
      y: number,
      red: number,
      green: number,
      blue: number,
      alpha?: number,
    ): void;

    /**
     * Draw a circle outline.
     *
     * @param buffer_info - The target buffer.
     * @param pos_x - X of the center.
     * @param pos_y - Y of the center.
     * @param diameter - Diameter in pixels.
     * @param red - Red in 0..255.
     * @param green - Green in 0..255.
     * @param blue - Blue in 0..255.
     * @param alpha - Alpha in 0..255. Default is 0; 3-channel buffers ignore it.
     * @param antialiasing - Smooth the edge. Default is `false`.
     * @param width - Line width in pixels; applies only when `antialiasing` is `true`.
     */
    function circle(
      buffer_info: BufferInfo,
      pos_x: number,
      pos_y: number,
      diameter: number,
      red: number,
      green: number,
      blue: number,
      alpha?: number,
      antialiasing?: boolean,
      width?: number,
    ): void;

    /**
     * Draw a filled circle.
     *
     * @param buffer_info - The target buffer.
     * @param pos_x - X of the center.
     * @param pos_y - Y of the center.
     * @param diameter - Diameter in pixels.
     * @param red - Red in 0..255.
     * @param green - Green in 0..255.
     * @param blue - Blue in 0..255.
     * @param alpha - Alpha in 0..255. Default is 0; 3-channel buffers ignore it.
     * @param antialiasing - Smooth the edge. Default is `false`.
     */
    function filled_circle(
      buffer_info: BufferInfo,
      pos_x: number,
      pos_y: number,
      diameter: number,
      red: number,
      green: number,
      blue: number,
      alpha?: number,
      antialiasing?: boolean,
    ): void;

    /**
     * Draw a rectangle outline centered on (pos_x, pos_y).
     *
     * @param buffer_info - The target buffer.
     * @param pos_x - X of the center.
     * @param pos_y - Y of the center.
     * @param rect_width - Width in pixels.
     * @param rect_height - Height in pixels.
     * @param red - Red in 0..255.
     * @param green - Green in 0..255.
     * @param blue - Blue in 0..255.
     * @param alpha - Alpha in 0..255. Default is 0; 3-channel buffers ignore it.
     */
    function rect(
      buffer_info: BufferInfo,
      pos_x: number,
      pos_y: number,
      rect_width: number,
      rect_height: number,
      red: number,
      green: number,
      blue: number,
      alpha?: number,
    ): void;

    /**
     * Draw a filled rectangle centered on (pos_x, pos_y), optionally rotated.
     *
     * @param buffer_info - The target buffer.
     * @param pos_x - X of the center.
     * @param pos_y - Y of the center.
     * @param rect_width - Width in pixels.
     * @param rect_height - Height in pixels.
     * @param red - Red in 0..255.
     * @param green - Green in 0..255.
     * @param blue - Blue in 0..255.
     * @param alpha - Alpha in 0..255. Default is 0; 3-channel buffers ignore it.
     * @param angle - Rotation in degrees. Default is 0.
     */
    function filled_rect(
      buffer_info: BufferInfo,
      pos_x: number,
      pos_y: number,
      rect_width: number,
      rect_height: number,
      red: number,
      green: number,
      blue: number,
      alpha?: number,
      angle?: number,
    ): void;

    /**
     * Fill the whole buffer with one color.
     *
     * @param buffer_info - The target buffer.
     * @param red - Red in 0..255.
     * @param green - Green in 0..255.
     * @param blue - Blue in 0..255.
     * @param alpha - Alpha in 0..255. Default is 0; 3-channel buffers ignore it.
     */
    function fill(
      buffer_info: BufferInfo,
      red: number,
      green: number,
      blue: number,
      alpha?: number,
    ): void;

    /**
     * Draw a line between two points.
     *
     * @param buffer_info - The target buffer.
     * @param x0 - X of the start.
     * @param y0 - Y of the start.
     * @param x1 - X of the end.
     * @param y1 - Y of the end.
     * @param red - Red in 0..255.
     * @param green - Green in 0..255.
     * @param blue - Blue in 0..255.
     * @param alpha - Alpha in 0..255. Default is 0; 3-channel buffers ignore it.
     * @param antialiasing - Smooth the edge. Default is `false`.
     * @param width - Line width in pixels; applies only when `antialiasing` is `true`.
     */
    function line(
      buffer_info: BufferInfo,
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      red: number,
      green: number,
      blue: number,
      alpha?: number,
      antialiasing?: boolean,
      width?: number,
    ): void;

    /**
     * Draw a line that blends from color 1 at (x0, y0) to color 2 at (x1, y1).
     *
     * @param buffer_info - The target buffer.
     * @param x0 - X of the start.
     * @param y0 - Y of the start.
     * @param x1 - X of the end.
     * @param y1 - Y of the end.
     * @param red1 - Start red in 0..255.
     * @param green1 - Start green in 0..255.
     * @param blue1 - Start blue in 0..255.
     * @param red2 - End red in 0..255.
     * @param green2 - End green in 0..255.
     * @param blue2 - End blue in 0..255.
     * @param alpha - Alpha in 0..255. Default is 0; 3-channel buffers ignore it.
     * @param antialiasing - Smooth the edge. Default is `false`.
     * @param width - Line width in pixels; applies only when `antialiasing` is `true`.
     */
    function gradient_line(
      buffer_info: BufferInfo,
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      red1: number,
      green1: number,
      blue1: number,
      red2: number,
      green2: number,
      blue2: number,
      alpha?: number,
      antialiasing?: boolean,
      width?: number,
    ): void;

    /**
     * Draw `points` as one stroke with bevel or miter joins and a gradient from
     * the center line to the edges. Each pixel is blended once, so a
     * semi-transparent stroke does not darken at corners or crossings.
     *
     * @param buffer_info - The target buffer.
     * @param points - `[x1, y1, x2, y2, ...]`, an x, y pair per point.
     * @param options - Stroke color and width. `widths` and `alphas` hold one number per point.
     */
    function polyline(buffer_info: BufferInfo, points: number[], options: PolylineOptions): void;

    /**
     * Draw an arc outline between two angles.
     *
     * @param buffer_info - The target buffer.
     * @param x - X of the center.
     * @param y - Y of the center.
     * @param radius - Radius in pixels.
     * @param from - Start angle in radians.
     * @param to - End angle in radians; `from` < `to` draws counterclockwise.
     * @param red - Red in 0..255.
     * @param green - Green in 0..255.
     * @param blue - Blue in 0..255.
     * @param alpha - Alpha in 0..255. Default is 0; 3-channel buffers ignore it.
     */
    function arc(
      buffer_info: BufferInfo,
      x: number,
      y: number,
      radius: number,
      from: number,
      to: number,
      red: number,
      green: number,
      blue: number,
      alpha?: number,
    ): void;

    /**
     * Draw a filled arc between two angles.
     *
     * @param buffer_info - The target buffer.
     * @param x - X of the center.
     * @param y - Y of the center.
     * @param radius - Radius in pixels.
     * @param from - Start angle in radians.
     * @param to - End angle in radians; `from` < `to` draws counterclockwise.
     * @param red - Red in 0..255.
     * @param green - Green in 0..255.
     * @param blue - Blue in 0..255.
     * @param alpha - Alpha in 0..255. Default is 0; 3-channel buffers ignore it.
     */
    function filled_arc(
      buffer_info: BufferInfo,
      x: number,
      y: number,
      radius: number,
      from: number,
      to: number,
      red: number,
      green: number,
      blue: number,
      alpha?: number,
    ): void;

    /**
     * Draw a filled arc that blends from color 1 at the center to color 2 at the
     * edge.
     *
     * @param buffer_info - The target buffer.
     * @param x - X of the center.
     * @param y - Y of the center.
     * @param radius - Radius in pixels.
     * @param from - Start angle in radians.
     * @param to - End angle in radians; `from` < `to` draws counterclockwise.
     * @param red1 - Center red in 0..255.
     * @param green1 - Center green in 0..255.
     * @param blue1 - Center blue in 0..255.
     * @param red2 - Edge red in 0..255.
     * @param green2 - Edge green in 0..255.
     * @param blue2 - Edge blue in 0..255.
     * @param alpha - Alpha in 0..255. Default is 0; 3-channel buffers ignore it.
     */
    function gradient_arc(
      buffer_info: BufferInfo,
      x: number,
      y: number,
      radius: number,
      from: number,
      to: number,
      red1: number,
      green1: number,
      blue1: number,
      red2: number,
      green2: number,
      blue2: number,
      alpha?: number,
    ): void;

    /**
     * Draw one pixel.
     *
     * @param buffer_info - The target buffer.
     * @param x - X of the pixel.
     * @param y - Y of the pixel.
     * @param red - Red in 0..255.
     * @param green - Green in 0..255.
     * @param blue - Blue in 0..255.
     * @param alpha - Alpha in 0..255. Default is 0; 3-channel buffers ignore it.
     */
    function pixel(
      buffer_info: BufferInfo,
      x: number,
      y: number,
      red: number,
      green: number,
      blue: number,
      alpha?: number,
    ): void;

    // `[undefined?]` rather than `[]`: destructuring `LuaMultiReturn<[] | ...>` drops the empty arm.
    /**
     * Read the color of one pixel: red, green and blue, then alpha for a
     * 4-channel buffer. Returns nothing for a position outside the buffer.
     *
     * @param buffer_info - The buffer to read.
     * @param x - X of the pixel.
     * @param y - Y of the pixel.
     */
    function color(
      buffer_info: BufferInfo,
      x: number,
      y: number,
    ): LuaMultiReturn<[undefined?] | [number, number, number] | [number, number, number, number]>;

    /**
     * Draw a quadratic Bezier curve from (x0, y0) to (x1, y1) with control point
     * (xc, yc).
     *
     * @param buffer_info - The target buffer.
     * @param x0 - X of the start.
     * @param y0 - Y of the start.
     * @param xc - X of the control point.
     * @param yc - Y of the control point.
     * @param x1 - X of the end.
     * @param y1 - Y of the end.
     * @param red - Red in 0..255.
     * @param green - Green in 0..255.
     * @param blue - Blue in 0..255.
     * @param alpha - Alpha in 0..255. Default is 0; 3-channel buffers ignore it.
     */
    function bezier(
      buffer_info: BufferInfo,
      x0: number,
      y0: number,
      xc: number,
      yc: number,
      x1: number,
      y1: number,
      red: number,
      green: number,
      blue: number,
      alpha?: number,
    ): void;

    /**
     * Copy a rectangle from `src` into `dest` at (dest_x, dest_y). The region is
     * clipped to both buffers.
     *
     * @param dest - The buffer to write.
     * @param src - The buffer to read.
     * @param rect_x - X of the source rectangle.
     * @param rect_y - Y of the source rectangle.
     * @param rect_width - Width of the source rectangle in pixels.
     * @param rect_height - Height of the source rectangle in pixels.
     * @param dest_x - X in `dest` to copy to.
     * @param dest_y - Y in `dest` to copy to.
     * @param merge_alpha - Blend over `dest` instead of replacing it. Default is `false`.
     */
    function copy_pixels(
      dest: BufferInfo,
      src: BufferInfo,
      rect_x: number,
      rect_y: number,
      rect_width: number,
      rect_height: number,
      dest_x: number,
      dest_y: number,
      merge_alpha?: boolean,
    ): void;
  }
}

export {};
