--AUTOCOMPLETE FOR IDEA DO NOT REMOVE OR REQUIRE
---@class DRAW_PIXELS
pixels = {}

---Indicates border should be maintained:
function pixels.start_fill() end
---Stop border recording:
function pixels.end_fill() end
---Fills the area considering the boundaries:
function pixels.fill_area(buffer_info, x,y, red, green, blue, alpha) end
---Method for drawing circle:
function pixels.circle(buffer_info, pox_x, pox_y, diameter, red, green, blue, alpha, antialiasing, width) end
---Method for drawing filled circle:
function pixels.filled_circle(buffer_info, pos_x, pos_y, diameter, red, green, blue, alpha, antialiasing) end
---Method for drawing rectangle:
function pixels.rect(buffer_info, pos_x, pos_y, rect_width, rect_height, red, green, blue, alpha) end
---Method for drawing filled rectangle:
function pixels.filled_rect(buffer_info, pos_x, pos_y, rect_width, rect_height, red, green, blue, alpha, angle) end
---Fill buffer with the color:
function pixels.fill(buffer_info, red, green, blue, alpha) end
---Draw a line between two points:
function pixels.line(buffer_info, x0, y0, x1, y1, red, green, blue, alpha, antialiasing, width) end
---Draw a gradient line between two points:
function pixels.gradient_line(buffer_info, x0, y0, x1, y1, red1, green1, blue1, red2, green2, blue2, alpha, antialiasing, width) end
---Draw a polyline with bevel joins and an optional gradient from the center line to the edges:
function pixels.polyline(buffer_info, points, options) end
---Draw a arc between two corners:
function pixels.arc(buffer_info, x, y, radius, from, to, red, green, blue, alpha) end
---Draw a filled arc between two corners:
function pixels.filled_arc(buffer_info, x, y, radius, from, to, red, green, blue, alpha) end
---Draw a gradient arc between two corners:
function pixels.gradient_arc(buffer_info, x, y, radius, from, to, red1, green1, blue1, red2, green2, blue2, alpha) end
---Draw a pixel:
function pixels.pixel(buffer_info, x, y, red, green, blue, alpha) end
---Read color from a position in the buffer:
function pixels.color(buffer_info, x, y) end
---Draw a bezier line between two points and one control point:
function pixels.bezier(buffer_info, x0, y0, xc, yc, x1, y1, red, green, blue, alpha) end

return
