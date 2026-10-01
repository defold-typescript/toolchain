--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.gui
---GUI API documentation
---fit adjust mode Adjust mode is used when the screen resolution differs from the project settings. The fit mode ensures that the entire node is visible in the adjusted gui scene.
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.ADJUST)
---@field ADJUST_FIT gui.ADJUST
---stretch adjust mode Adjust mode is used when the screen resolution differs from the project settings. The stretch mode ensures that the node is displayed as is in the adjusted gui scene, which might scale it non-uniformally.
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.ADJUST)
---@field ADJUST_STRETCH gui.ADJUST
---zoom adjust mode Adjust mode is used when the screen resolution differs from the project settings. The zoom mode ensures that the node fills its entire area and might make the node exceed it.
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.ADJUST)
---@field ADJUST_ZOOM gui.ADJUST
---bottom y-anchor
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.ANCHOR)
---@field ANCHOR_BOTTOM gui.ANCHOR
---left x-anchor
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.ANCHOR)
---@field ANCHOR_LEFT gui.ANCHOR
---no anchor
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.ANCHOR)
---@field ANCHOR_NONE gui.ANCHOR
---right x-anchor
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.ANCHOR)
---@field ANCHOR_RIGHT gui.ANCHOR
---top y-anchor
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.ANCHOR)
---@field ANCHOR_TOP gui.ANCHOR
---additive blending
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.BLEND)
---@field BLEND_ADD gui.BLEND
---additive alpha blending
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.BLEND)
---@field BLEND_ADD_ALPHA gui.BLEND
---alpha blending
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.BLEND)
---@field BLEND_ALPHA gui.BLEND
---multiply blending
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.BLEND)
---@field BLEND_MULT gui.BLEND
---screen blending
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.BLEND)
---@field BLEND_SCREEN gui.BLEND
---clipping mode none
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.CLIPPING_MODE)
---@field CLIPPING_MODE_NONE gui.CLIPPING_MODE
---clipping mode stencil
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.CLIPPING_MODE)
---@field CLIPPING_MODE_STENCIL gui.CLIPPING_MODE
---in-back
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_INBACK gui.EASING
---in-bounce
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_INBOUNCE gui.EASING
---in-circlic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_INCIRC gui.EASING
---in-cubic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_INCUBIC gui.EASING
---in-elastic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_INELASTIC gui.EASING
---in-exponential
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_INEXPO gui.EASING
---in-out-back
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_INOUTBACK gui.EASING
---in-out-bounce
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_INOUTBOUNCE gui.EASING
---in-out-circlic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_INOUTCIRC gui.EASING
---in-out-cubic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_INOUTCUBIC gui.EASING
---in-out-elastic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_INOUTELASTIC gui.EASING
---in-out-exponential
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_INOUTEXPO gui.EASING
---in-out-quadratic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_INOUTQUAD gui.EASING
---in-out-quartic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_INOUTQUART gui.EASING
---in-out-quintic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_INOUTQUINT gui.EASING
---in-out-sine
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_INOUTSINE gui.EASING
---in-quadratic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_INQUAD gui.EASING
---in-quartic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_INQUART gui.EASING
---in-quintic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_INQUINT gui.EASING
---in-sine
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_INSINE gui.EASING
---linear interpolation
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_LINEAR gui.EASING
---out-back
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_OUTBACK gui.EASING
---out-bounce
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_OUTBOUNCE gui.EASING
---out-circlic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_OUTCIRC gui.EASING
---out-cubic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_OUTCUBIC gui.EASING
---out-elastic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_OUTELASTIC gui.EASING
---out-exponential
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_OUTEXPO gui.EASING
---out-in-back
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_OUTINBACK gui.EASING
---out-in-bounce
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_OUTINBOUNCE gui.EASING
---out-in-circlic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_OUTINCIRC gui.EASING
---out-in-cubic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_OUTINCUBIC gui.EASING
---out-in-elastic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_OUTINELASTIC gui.EASING
---out-in-exponential
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_OUTINEXPO gui.EASING
---out-in-quadratic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_OUTINQUAD gui.EASING
---out-in-quartic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_OUTINQUART gui.EASING
---out-in-quintic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_OUTINQUINT gui.EASING
---out-in-sine
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_OUTINSINE gui.EASING
---out-quadratic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_OUTQUAD gui.EASING
---out-quartic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_OUTQUART gui.EASING
---out-quintic
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_OUTQUINT gui.EASING
---out-sine
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@field EASING_OUTSINE gui.EASING
---default keyboard
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.KEYBOARD_TYPE)
---@field KEYBOARD_TYPE_DEFAULT gui.KEYBOARD_TYPE
---email keyboard
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.KEYBOARD_TYPE)
---@field KEYBOARD_TYPE_EMAIL gui.KEYBOARD_TYPE
---number input keyboard
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.KEYBOARD_TYPE)
---@field KEYBOARD_TYPE_NUMBER_PAD gui.KEYBOARD_TYPE
---password keyboard
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.KEYBOARD_TYPE)
---@field KEYBOARD_TYPE_PASSWORD gui.KEYBOARD_TYPE
---elliptical pie node bounds
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PIEBOUNDS)
---@field PIEBOUNDS_ELLIPSE gui.PIEBOUNDS
---rectangular pie node bounds
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PIEBOUNDS)
---@field PIEBOUNDS_RECTANGLE gui.PIEBOUNDS
---center pivot
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PIVOT)
---@field PIVOT_CENTER gui.PIVOT
---east pivot
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PIVOT)
---@field PIVOT_E gui.PIVOT
---north pivot
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PIVOT)
---@field PIVOT_N gui.PIVOT
---north-east pivot
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PIVOT)
---@field PIVOT_NE gui.PIVOT
---north-west pivot
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PIVOT)
---@field PIVOT_NW gui.PIVOT
---south pivot
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PIVOT)
---@field PIVOT_S gui.PIVOT
---south-east pivot
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PIVOT)
---@field PIVOT_SE gui.PIVOT
---south-west pivot
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PIVOT)
---@field PIVOT_SW gui.PIVOT
---west pivot
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PIVOT)
---@field PIVOT_W gui.PIVOT
---loop backward
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PLAYBACK)
---@field PLAYBACK_LOOP_BACKWARD gui.PLAYBACK
---loop forward
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PLAYBACK)
---@field PLAYBACK_LOOP_FORWARD gui.PLAYBACK
---ping pong loop
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PLAYBACK)
---@field PLAYBACK_LOOP_PINGPONG gui.PLAYBACK
---once backward
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PLAYBACK)
---@field PLAYBACK_ONCE_BACKWARD gui.PLAYBACK
---once forward
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PLAYBACK)
---@field PLAYBACK_ONCE_FORWARD gui.PLAYBACK
---once forward and then backward
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PLAYBACK)
---@field PLAYBACK_ONCE_PINGPONG gui.PLAYBACK
---color property
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PROP)
---@field PROP_COLOR gui.PROP
---euler property
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PROP)
---@field PROP_EULER gui.PROP
---fill_angle property
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PROP)
---@field PROP_FILL_ANGLE gui.PROP
---inner_radius property
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PROP)
---@field PROP_INNER_RADIUS gui.PROP
---leading property
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PROP)
---@field PROP_LEADING gui.PROP
---outline color property
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PROP)
---@field PROP_OUTLINE gui.PROP
---position property
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PROP)
---@field PROP_POSITION gui.PROP
---rotation property
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PROP)
---@field PROP_ROTATION gui.PROP
---scale property
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PROP)
---@field PROP_SCALE gui.PROP
---shadow color property
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PROP)
---@field PROP_SHADOW gui.PROP
---size property
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PROP)
---@field PROP_SIZE gui.PROP
---slice9 property
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PROP)
---@field PROP_SLICE9 gui.PROP
---tracking property
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PROP)
---@field PROP_TRACKING gui.PROP
---data error The provided data is not in the expected format or is in some other way incorrect, for instance the image data provided to gui.new_texture().
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.RESULT)
---@field RESULT_DATA_ERROR gui.RESULT
---out of resource The system is out of resources, for instance when trying to create a new texture using gui.new_texture().
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.RESULT)
---@field RESULT_OUT_OF_RESOURCES gui.RESULT
---texture already exists The texture id already exists when trying to use gui.new_texture().
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.RESULT)
---@field RESULT_TEXTURE_ALREADY_EXISTS gui.RESULT
---both sides safe area Safe area mode that applies insets on all edges.
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.SAFE_AREA)
---@field SAFE_AREA_BOTH gui.SAFE_AREA
---long side safe area Safe area mode that applies insets only on the long edges.
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.SAFE_AREA)
---@field SAFE_AREA_LONG gui.SAFE_AREA
---no safe area Safe area mode that ignores safe area insets.
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.SAFE_AREA)
---@field SAFE_AREA_NONE gui.SAFE_AREA
---short side safe area Safe area mode that applies insets only on the short edges.
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.SAFE_AREA)
---@field SAFE_AREA_SHORT gui.SAFE_AREA
---automatic size mode The size of the node is determined by the currently assigned texture.
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.SIZE_MODE)
---@field SIZE_MODE_AUTO gui.SIZE_MODE
---manual size mode The size of the node is determined by the size set in the editor, the constructor or by gui.set_size()
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.SIZE_MODE)
---@field SIZE_MODE_MANUAL gui.SIZE_MODE
---box type
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.TYPE)
---@field TYPE_BOX gui.TYPE
---custom type
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.TYPE)
---@field TYPE_CUSTOM gui.TYPE
---particlefx type
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.TYPE)
---@field TYPE_PARTICLEFX gui.TYPE
---pie type
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.TYPE)
---@field TYPE_PIE gui.TYPE
---text type
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.TYPE)
---@field TYPE_TEXT gui.TYPE
gui = {}

---@enum defold_enum.gui.ADJUST: integer
local __defold_enum_gui_ADJUST = {
    ADJUST_FIT = nil,
    ADJUST_STRETCH = nil,
    ADJUST_ZOOM = nil,
}

---Adjust modes
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.ADJUST)
---@alias gui.ADJUST defold_enum.gui.ADJUST
---| `gui.ADJUST_FIT`
---| `gui.ADJUST_STRETCH`
---| `gui.ADJUST_ZOOM`

---@enum defold_enum.gui.ANCHOR: integer
local __defold_enum_gui_ANCHOR = {
    ANCHOR_BOTTOM = nil,
    ANCHOR_LEFT = nil,
    ANCHOR_NONE = nil,
    ANCHOR_RIGHT = nil,
    ANCHOR_TOP = nil,
}

---Anchor modes
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.ANCHOR)
---@alias gui.ANCHOR defold_enum.gui.ANCHOR
---| `gui.ANCHOR_BOTTOM`
---| `gui.ANCHOR_LEFT`
---| `gui.ANCHOR_NONE`
---| `gui.ANCHOR_RIGHT`
---| `gui.ANCHOR_TOP`

---@enum defold_enum.gui.BLEND: integer
local __defold_enum_gui_BLEND = {
    BLEND_ADD = nil,
    BLEND_ADD_ALPHA = nil,
    BLEND_ALPHA = nil,
    BLEND_MULT = nil,
    BLEND_SCREEN = nil,
}

---Blend modes
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.BLEND)
---@alias gui.BLEND defold_enum.gui.BLEND
---| `gui.BLEND_ADD`
---| `gui.BLEND_ADD_ALPHA`
---| `gui.BLEND_ALPHA`
---| `gui.BLEND_MULT`
---| `gui.BLEND_SCREEN`

---@enum defold_enum.gui.CLIPPING_MODE: integer
local __defold_enum_gui_CLIPPING_MODE = {
    CLIPPING_MODE_NONE = nil,
    CLIPPING_MODE_STENCIL = nil,
}

---Clipping modes
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.CLIPPING_MODE)
---@alias gui.CLIPPING_MODE defold_enum.gui.CLIPPING_MODE
---| `gui.CLIPPING_MODE_NONE`
---| `gui.CLIPPING_MODE_STENCIL`

---@enum defold_enum.gui.EASING: integer
local __defold_enum_gui_EASING = {
    EASING_INBACK = nil,
    EASING_INBOUNCE = nil,
    EASING_INCIRC = nil,
    EASING_INCUBIC = nil,
    EASING_INELASTIC = nil,
    EASING_INEXPO = nil,
    EASING_INOUTBACK = nil,
    EASING_INOUTBOUNCE = nil,
    EASING_INOUTCIRC = nil,
    EASING_INOUTCUBIC = nil,
    EASING_INOUTELASTIC = nil,
    EASING_INOUTEXPO = nil,
    EASING_INOUTQUAD = nil,
    EASING_INOUTQUART = nil,
    EASING_INOUTQUINT = nil,
    EASING_INOUTSINE = nil,
    EASING_INQUAD = nil,
    EASING_INQUART = nil,
    EASING_INQUINT = nil,
    EASING_INSINE = nil,
    EASING_LINEAR = nil,
    EASING_OUTBACK = nil,
    EASING_OUTBOUNCE = nil,
    EASING_OUTCIRC = nil,
    EASING_OUTCUBIC = nil,
    EASING_OUTELASTIC = nil,
    EASING_OUTEXPO = nil,
    EASING_OUTINBACK = nil,
    EASING_OUTINBOUNCE = nil,
    EASING_OUTINCIRC = nil,
    EASING_OUTINCUBIC = nil,
    EASING_OUTINELASTIC = nil,
    EASING_OUTINEXPO = nil,
    EASING_OUTINQUAD = nil,
    EASING_OUTINQUART = nil,
    EASING_OUTINQUINT = nil,
    EASING_OUTINSINE = nil,
    EASING_OUTQUAD = nil,
    EASING_OUTQUART = nil,
    EASING_OUTQUINT = nil,
    EASING_OUTSINE = nil,
}

---Easing curves
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.EASING)
---@alias gui.EASING defold_enum.gui.EASING
---| `gui.EASING_INBACK`
---| `gui.EASING_INBOUNCE`
---| `gui.EASING_INCIRC`
---| `gui.EASING_INCUBIC`
---| `gui.EASING_INELASTIC`
---| `gui.EASING_INEXPO`
---| `gui.EASING_INOUTBACK`
---| `gui.EASING_INOUTBOUNCE`
---| `gui.EASING_INOUTCIRC`
---| `gui.EASING_INOUTCUBIC`
---| `gui.EASING_INOUTELASTIC`
---| `gui.EASING_INOUTEXPO`
---| `gui.EASING_INOUTQUAD`
---| `gui.EASING_INOUTQUART`
---| `gui.EASING_INOUTQUINT`
---| `gui.EASING_INOUTSINE`
---| `gui.EASING_INQUAD`
---| `gui.EASING_INQUART`
---| `gui.EASING_INQUINT`
---| `gui.EASING_INSINE`
---| `gui.EASING_LINEAR`
---| `gui.EASING_OUTBACK`
---| `gui.EASING_OUTBOUNCE`
---| `gui.EASING_OUTCIRC`
---| `gui.EASING_OUTCUBIC`
---| `gui.EASING_OUTELASTIC`
---| `gui.EASING_OUTEXPO`
---| `gui.EASING_OUTINBACK`
---| `gui.EASING_OUTINBOUNCE`
---| `gui.EASING_OUTINCIRC`
---| `gui.EASING_OUTINCUBIC`
---| `gui.EASING_OUTINELASTIC`
---| `gui.EASING_OUTINEXPO`
---| `gui.EASING_OUTINQUAD`
---| `gui.EASING_OUTINQUART`
---| `gui.EASING_OUTINQUINT`
---| `gui.EASING_OUTINSINE`
---| `gui.EASING_OUTQUAD`
---| `gui.EASING_OUTQUART`
---| `gui.EASING_OUTQUINT`
---| `gui.EASING_OUTSINE`

---@enum defold_enum.gui.KEYBOARD_TYPE: integer
local __defold_enum_gui_KEYBOARD_TYPE = {
    KEYBOARD_TYPE_DEFAULT = nil,
    KEYBOARD_TYPE_EMAIL = nil,
    KEYBOARD_TYPE_NUMBER_PAD = nil,
    KEYBOARD_TYPE_PASSWORD = nil,
}

---Keyboard types
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.KEYBOARD_TYPE)
---@alias gui.KEYBOARD_TYPE defold_enum.gui.KEYBOARD_TYPE
---| `gui.KEYBOARD_TYPE_DEFAULT`
---| `gui.KEYBOARD_TYPE_EMAIL`
---| `gui.KEYBOARD_TYPE_NUMBER_PAD`
---| `gui.KEYBOARD_TYPE_PASSWORD`

---@enum defold_enum.gui.PIEBOUNDS: integer
local __defold_enum_gui_PIEBOUNDS = {
    PIEBOUNDS_ELLIPSE = nil,
    PIEBOUNDS_RECTANGLE = nil,
}

---Pie bounds modes
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PIEBOUNDS)
---@alias gui.PIEBOUNDS defold_enum.gui.PIEBOUNDS
---| `gui.PIEBOUNDS_ELLIPSE`
---| `gui.PIEBOUNDS_RECTANGLE`

---@enum defold_enum.gui.PIVOT: integer
local __defold_enum_gui_PIVOT = {
    PIVOT_CENTER = nil,
    PIVOT_E = nil,
    PIVOT_N = nil,
    PIVOT_NE = nil,
    PIVOT_NW = nil,
    PIVOT_S = nil,
    PIVOT_SE = nil,
    PIVOT_SW = nil,
    PIVOT_W = nil,
}

---Pivot modes
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PIVOT)
---@alias gui.PIVOT defold_enum.gui.PIVOT
---| `gui.PIVOT_CENTER`
---| `gui.PIVOT_E`
---| `gui.PIVOT_N`
---| `gui.PIVOT_NE`
---| `gui.PIVOT_NW`
---| `gui.PIVOT_S`
---| `gui.PIVOT_SE`
---| `gui.PIVOT_SW`
---| `gui.PIVOT_W`

---@enum defold_enum.gui.PLAYBACK: integer
local __defold_enum_gui_PLAYBACK = {
    PLAYBACK_LOOP_BACKWARD = nil,
    PLAYBACK_LOOP_FORWARD = nil,
    PLAYBACK_LOOP_PINGPONG = nil,
    PLAYBACK_ONCE_BACKWARD = nil,
    PLAYBACK_ONCE_FORWARD = nil,
    PLAYBACK_ONCE_PINGPONG = nil,
}

---Playback modes
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PLAYBACK)
---@alias gui.PLAYBACK defold_enum.gui.PLAYBACK
---| `gui.PLAYBACK_LOOP_BACKWARD`
---| `gui.PLAYBACK_LOOP_FORWARD`
---| `gui.PLAYBACK_LOOP_PINGPONG`
---| `gui.PLAYBACK_ONCE_BACKWARD`
---| `gui.PLAYBACK_ONCE_FORWARD`
---| `gui.PLAYBACK_ONCE_PINGPONG`

---@enum defold_enum.gui.PROP: integer
local __defold_enum_gui_PROP = {
    PROP_COLOR = nil,
    PROP_EULER = nil,
    PROP_FILL_ANGLE = nil,
    PROP_INNER_RADIUS = nil,
    PROP_LEADING = nil,
    PROP_OUTLINE = nil,
    PROP_POSITION = nil,
    PROP_ROTATION = nil,
    PROP_SCALE = nil,
    PROP_SHADOW = nil,
    PROP_SIZE = nil,
    PROP_SLICE9 = nil,
    PROP_TRACKING = nil,
}

---GUI property names
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.PROP)
---@alias gui.PROP defold_enum.gui.PROP
---| `gui.PROP_COLOR`
---| `gui.PROP_EULER`
---| `gui.PROP_FILL_ANGLE`
---| `gui.PROP_INNER_RADIUS`
---| `gui.PROP_LEADING`
---| `gui.PROP_OUTLINE`
---| `gui.PROP_POSITION`
---| `gui.PROP_ROTATION`
---| `gui.PROP_SCALE`
---| `gui.PROP_SHADOW`
---| `gui.PROP_SIZE`
---| `gui.PROP_SLICE9`
---| `gui.PROP_TRACKING`

---@enum defold_enum.gui.RESULT: integer
local __defold_enum_gui_RESULT = {
    RESULT_DATA_ERROR = nil,
    RESULT_OUT_OF_RESOURCES = nil,
    RESULT_TEXTURE_ALREADY_EXISTS = nil,
}

---GUI results
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.RESULT)
---@alias gui.RESULT defold_enum.gui.RESULT
---| `gui.RESULT_DATA_ERROR`
---| `gui.RESULT_OUT_OF_RESOURCES`
---| `gui.RESULT_TEXTURE_ALREADY_EXISTS`

---@enum defold_enum.gui.SAFE_AREA: integer
local __defold_enum_gui_SAFE_AREA = {
    SAFE_AREA_BOTH = nil,
    SAFE_AREA_LONG = nil,
    SAFE_AREA_NONE = nil,
    SAFE_AREA_SHORT = nil,
}

---Safe-area modes
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.SAFE_AREA)
---@alias gui.SAFE_AREA defold_enum.gui.SAFE_AREA
---| `gui.SAFE_AREA_BOTH`
---| `gui.SAFE_AREA_LONG`
---| `gui.SAFE_AREA_NONE`
---| `gui.SAFE_AREA_SHORT`

---@enum defold_enum.gui.SIZE_MODE: integer
local __defold_enum_gui_SIZE_MODE = {
    SIZE_MODE_AUTO = nil,
    SIZE_MODE_MANUAL = nil,
}

---Size modes
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.SIZE_MODE)
---@alias gui.SIZE_MODE defold_enum.gui.SIZE_MODE
---| `gui.SIZE_MODE_AUTO`
---| `gui.SIZE_MODE_MANUAL`

---@enum defold_enum.gui.TYPE: integer
local __defold_enum_gui_TYPE = {
    TYPE_BOX = nil,
    TYPE_CUSTOM = nil,
    TYPE_PARTICLEFX = nil,
    TYPE_PIE = nil,
    TYPE_TEXT = nil,
}

---Node types
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.TYPE)
---@alias gui.TYPE defold_enum.gui.TYPE
---| `gui.TYPE_BOX`
---| `gui.TYPE_CUSTOM`
---| `gui.TYPE_PARTICLEFX`
---| `gui.TYPE_PIE`
---| `gui.TYPE_TEXT`

---This starts an animation of a node property according to the specified parameters.
---If the node property is already being animated, that animation will be canceled and
---replaced by the new one. Note however that several different node properties
---can be animated simultaneously. Use `gui.cancel_animations` to stop the animation
---before it has completed.
---
---Composite properties of type vector3, vector4 or quaternion
---also expose their sub-components (x, y, z and w).
---You can address the components individually by suffixing the name with a dot '.'
---and the name of the component.
---For instance, `"position.x"` (the position x coordinate) or `"color.w"`
---(the color alpha value).
---
---If a `complete_function` (Lua function) is specified, that function will be called
---when the animation has completed.
---By starting a new animation in that function, several animations can be sequenced
---together. See the examples below for more information.
---
---**Examples:**
---
---How to start a simple color animation, where the node fades in to white during 0.5 seconds:
---
---```lua
---gui.set_color(node, vmath.vector4(0, 0, 0, 0)) -- node is fully transparent
---gui.animate(node, gui.PROP_COLOR, vmath.vector4(1, 1, 1, 1), gui.EASING_INOUTQUAD, 0.5) -- start animation
---```
---
---How to start a sequenced animation where the node fades in to white during 0.5 seconds, stays visible for 2 seconds and then fades out:
---
---```lua
---local function on_animation_done(self, node)
---    -- fade out node, but wait 2 seconds before the animation starts
---    gui.animate(node, gui.PROP_COLOR, vmath.vector4(0, 0, 0, 0), gui.EASING_OUTQUAD, 0.5, 2.0)
---end
---
---function init(self)
---    -- fetch the node we want to animate
---    local my_node = gui.get_node("my_node")
---    -- node is initially set to fully transparent
---    gui.set_color(my_node, vmath.vector4(0, 0, 0, 0))
---    -- animate the node immediately and call on_animation_done when the animation has completed
---    gui.animate(my_node, gui.PROP_COLOR, vmath.vector4(1, 1, 1, 1), gui.EASING_INOUTQUAD, 0.5, 0.0, on_animation_done)
---end
---```
---
---How to animate a node's y position using a crazy custom easing curve:
---
---```lua
---function init(self)
---    local values = { 0, 0, 0, 0, 0, 0, 0, 0,
---                     1, 1, 1, 1, 1, 1, 1, 1,
---                     0, 0, 0, 0, 0, 0, 0, 0,
---                     1, 1, 1, 1, 1, 1, 1, 1,
---                     0, 0, 0, 0, 0, 0, 0, 0,
---                     1, 1, 1, 1, 1, 1, 1, 1,
---                     0, 0, 0, 0, 0, 0, 0, 0,
---                     1, 1, 1, 1, 1, 1, 1, 1 }
---    local vec = vmath.vector(values)
---    local node = gui.get_node("box")
---    gui.animate(node, "position.y", 100, vec, 4.0, 0, nil, gui.PLAYBACK_LOOP_PINGPONG)
---end
---```
---@param node node node to animate
---@param property string|hash|gui.PROP property to animate; each `gui.PROP` member equals its corresponding property name string
---@param to number|vector3|vector4|quaternion target property value
---@param easing gui.EASING|vector easing to use during animation. Either specify one of the `gui.EASING_*` constants or provide a `vector` with a custom curve. See the [animation guide](/manuals/animation#_easing) for more information.
---@param duration number duration of the animation in seconds.
---@param delay? number delay before the animation starts in seconds.
---@param complete_function? fun(self:script_instance, node:node) function to call when the animation has completed
---@param playback? gui.PLAYBACK playback mode
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.animate:node-property-to-easing-duration-delay-complete_function-playback)
function gui.animate(node, property, to, easing, duration, delay, complete_function, playback) end

---If one or more animations of the specified node is currently running (started by `gui.animate`), they will immediately be canceled.
---
---**Examples:**
---
---Start an animation of the position property of a node, then cancel parts of
---the animation:
---
---```lua
---local node = gui.get_node("my_node")
----- animate to new position
---local pos = vmath.vector3(100, 100, 0)
---gui.animate(node, "position", pos, go.EASING_LINEAR, 2)
---...
----- cancel animation of the x component.
---gui.cancel_animations(node, "position.x")
---```
---
---Cancels all property animations on a node in a single call:
---
---```lua
---local node = gui.get_node("my_node")
----- animate to new position and scale
---gui.animate(node, "position", vmath.vector3(100, 100, 0), go.EASING_LINEAR, 5)
---gui.animate(node, "scale", vmath.vector3(0.5), go.EASING_LINEAR, 5)
---...
----- cancel positioning and scaling at once
---gui.cancel_animations(node)
---```
---@param node node node that should have its animation canceled
---@param property? nil|string|hash|gui.PROP optional property for which the animation should be canceled  - `"position"` - `"rotation"` - `"euler"` - `"scale"` - `"color"` - `"outline"` - `"shadow"` - `"size"` - `"fill_angle"` (pie) - `"inner_radius"` (pie) - `"leading"` (text) - `"tracking"` (text) - `"slice9"` (slice9)
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.cancel_animations:node-property)
function gui.cancel_animations(node, property) end

---Cancels any running flipbook animation on the specified node.
---
---**Examples:**
---
---```lua
---local node = gui.get_node("anim_node")
---gui.cancel_flipbook(node)
---```
---@param node node node cancel flipbook animation for
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.cancel_flipbook:node)
function gui.cancel_flipbook(node) end

---Make a clone instance of a node. The cloned node will be identical to the
---original node, except the id which is generated as the string "node" plus
---a sequential unsigned integer value.
---This function does not clone the supplied node's children nodes.
---Use gui.clone_tree for that purpose.
---@param node node node to clone
---@return node clone the cloned node
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.clone:node)
function gui.clone(node) end

---Make a clone instance of a node and all its children.
---Use gui.clone to clone a node excluding its children.
---@param node node root node to clone
---@return table<hash, node> clones a table mapping node ids to the corresponding cloned nodes
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.clone_tree:node)
function gui.clone_tree(node) end

---Deletes the specified node. Any child nodes of the specified node will be
---recursively deleted.
---
---**Examples:**
---
---Delete a particular node and any child nodes it might have:
---
---```lua
---local node = gui.get_node("my_node")
---gui.delete_node(node)
---```
---@param node node node to delete
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.delete_node:node)
function gui.delete_node(node) end

---Delete a dynamically created texture.
---
---**Examples:**
---
---```lua
---function init(self)
---     -- Create a texture.
---     if gui.new_texture("temp_tx", 10, 10, "rgb", string.rep('\0', 10 * 10 * 3)) then
---         -- Do something with the texture.
---         ...
---
---         -- Delete the texture
---         gui.delete_texture("temp_tx")
---     end
---end
---```
---@param texture string|hash texture id
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.delete_texture:texture)
function gui.delete_texture(texture) end

---Instead of using specific getters such as gui.get_position or gui.get_scale,
---you can use gui.get instead and supply the property as a string or a hash.
---While this function is similar to go.get, there are a few more restrictions
---when operating in the gui namespace. Most notably, only these explicitly named properties are supported:
---
---- `"position"`
---- `"rotation"`
---- `"euler"`
---- `"scale"`
---- `"color"`
---- `"outline"`
---- `"shadow"`
---- `"size"`
---- `"fill_angle"` (pie)
---- `"inner_radius"` (pie)
---- `"leading"` (text)
---- `"tracking"` (text)
---- `"slice9"` (slice9)
---
---The value returned will either be a vmath.vector4 or a single number, i.e getting the "position"
---property will return a vec4 while getting the "position.x" property will return a single value.
---You can also use this function to get material constants.
---
---**Examples:**
---
---Get properties on existing nodes:
---
---```lua
---local node = gui.get_node("my_box_node")
---local node_position = gui.get(node, "position")
---```
---@param node node node to get the property for
---@param property string|hash|gui.PROP the property to retrieve
---@param options? { index?:integer } optional options table (only applicable for material constants) - `index` `integer` index into array property (1 based)
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get:node-property-options)
function gui.get(node, property, options) end

---Returns the adjust mode of a node.
---The adjust mode defines how the node will adjust itself to screen
---resolutions that differs from the one in the project settings.
---@param node node node from which to get the adjust mode (node)
---@return gui.ADJUST adjust_mode the current adjust mode
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_adjust_mode:node)
function gui.get_adjust_mode(node) end

---gets the node alpha
---@param node node node from which to get alpha
---@return number alpha alpha
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_alpha:node)
function gui.get_alpha(node) end

---Returns the blend mode of a node.
---Blend mode defines how the node will be blended with the background.
---@param node node node from which to get the blend mode
---@return gui.BLEND blend_mode blend mode
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_blend_mode:node)
function gui.get_blend_mode(node) end

---If node is set as an inverted clipping node, it will clip anything inside as opposed to outside.
---@param node node node from which to get the clipping inverted state
---@return boolean inverted `true` or `false`
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_clipping_inverted:node)
function gui.get_clipping_inverted(node) end

---Clipping mode defines how the node will clip it's children nodes
---@param node node node from which to get the clipping mode
---@return gui.CLIPPING_MODE clipping_mode clipping mode  - `gui.CLIPPING_MODE_NONE`  - `gui.CLIPPING_MODE_STENCIL`
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_clipping_mode:node)
function gui.get_clipping_mode(node) end

---If node is set as visible clipping node, it will be shown as well as clipping. Otherwise, it will only clip but not show visually.
---@param node node node from which to get the clipping visibility state
---@return boolean visible `true` or `false`
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_clipping_visible:node)
function gui.get_clipping_visible(node) end

---Returns the color of the supplied node. The components
---of the returned vector4 contains the color channel values:
---
---Component | Color value
------------ | -------------
---x         | Red value
---y         | Green value
---z         | Blue value
---w         | Alpha value
---@param node node node to get the color from
---@return vector4 color node color
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_color:node)
function gui.get_color(node) end

---Returns the rotation of the supplied node.
---The rotation is expressed in degree Euler angles.
---@param node node node to get the rotation from
---@return vector3 rotation node rotation
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_euler:node)
function gui.get_euler(node) end

---Returns the sector angle of a pie node.
---@param node node node from which to get the fill angle
---@return number angle sector angle
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_fill_angle:node)
function gui.get_fill_angle(node) end

---Get node flipbook animation.
---@param node node node to get flipbook animation from
---@return hash animation animation id
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_flipbook:node)
function gui.get_flipbook(node) end

---This is only useful nodes with flipbook animations. Gets the normalized cursor of the flipbook animation on a node.
---@param node node node to get the cursor for (node)
---@return number cursor cursor value
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_flipbook_cursor:node)
function gui.get_flipbook_cursor(node) end

---This is only useful nodes with flipbook animations. Gets the playback rate of the flipbook animation on a node.
---@param node node node to set the cursor for
---@return number rate playback rate
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_flipbook_playback_rate:node)
function gui.get_flipbook_playback_rate(node) end

---This is only useful for text nodes. The font must be mapped to the gui scene in the gui editor.
---@param node node node from which to get the font
---@return hash font font id
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_font:node)
function gui.get_font(node) end

---This is only useful for text nodes. The font must be mapped to the gui scene in the gui editor.
---
---**Examples:**
---
---Get the text metrics for a text
---
---```lua
---function init(self)
---  local node = gui.get_node("name")
---  local font_name = gui.get_font(node)
---  local font = gui.get_font_resource(font_name)
---  local metrics = resource.get_text_metrics(font, "The quick brown fox\n jumps over the lazy dog")
---end
---```
---@param font_name hash|string font of which to get the path hash
---@return hash hash path hash to resource
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_font_resource:font_name)
function gui.get_font_resource(font_name) end

---Returns the scene height.
---@return number height scene height
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_height:)
function gui.get_height() end

---Retrieves the id of the specified node.
---
---**Examples:**
---
---Gets the id of a node:
---
---```lua
---local node = gui.get_node("my_node")
---
---local id = gui.get_id(node)
---print(id) --> hash: [my_node]
---```
---@param node node the node to retrieve the id from
---@return hash id the id of the node
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_id:node)
function gui.get_id(node) end

---Retrieve the index of the specified node among its siblings.
---The index defines the order in which a node appear in a GUI scene.
---Higher index means the node is drawn on top of lower indexed nodes.
---
---**Examples:**
---
---Compare the index order of two sibling nodes:
---
---```lua
---local node1 = gui.get_node("my_node_1")
---local node2 = gui.get_node("my_node_2")
---
---if gui.get_index(node1) < gui.get_index(node2) then
---    -- node1 is drawn below node2
---else
---    -- node2 is drawn below node1
---end
---```
---@param node node the node to retrieve the id from
---@return number index the index of the node
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_index:node)
function gui.get_index(node) end

---gets the node inherit alpha state
---@param node node node from which to get the inherit alpha state
---@return boolean inherit_alpha `true` or `false`
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_inherit_alpha:node)
function gui.get_inherit_alpha(node) end

---Returns the inner radius of a pie node.
---The radius is defined along the x-axis.
---@param node node node from where to get the inner radius
---@return number radius inner radius
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_inner_radius:node)
function gui.get_inner_radius(node) end

---The layer must be mapped to the gui scene in the gui editor.
---@param node node node from which to get the layer
---@return hash layer layer id
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_layer:node)
function gui.get_layer(node) end

---gets the scene current layout
---@return hash layout layout id
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_layout:)
function gui.get_layout() end

---Returns the sprites and links found in the text node's current layout.
---Each object's `x` and `y` identify its lower-left corner relative to the
---text node's upper-left layout origin.
---@param node node text node to inspect
---@return gui.layout_object[] objects layout objects in source order
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_layout_objects:node)
function gui.get_layout_objects(node) end

---Returns a table mapping each layout id hash to a vector3(width, height, 0). For the default layout,
---the current scene resolution is returned. If a layout name is not present in the Display Profiles (or when
---no display profiles are assigned), the width/height pair is 0.
---@return table<hash, vector3> layout_id_hash -> vmath.vector3(width, height, 0)
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_layouts:)
function gui.get_layouts() end

---Returns the leading value for a text node.
---@param node node node from where to get the leading
---@return number leading leading scaling value (default=1)
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_leading:node)
function gui.get_leading(node) end

---Returns whether a text node is in line-break mode or not.
---This is only useful for text nodes.
---@param node node node from which to get the line-break for
---@return boolean line_break `true` or `false`
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_line_break:node)
function gui.get_line_break(node) end

---Returns the material of a node.
---The material must be mapped to the gui scene in the gui editor.
---
---**Examples:**
---
---Getting the material for a node, and assign it to another node:
---
---```lua
---local node1 = gui.get_node("my_node")
---local node2 = gui.get_node("other_node")
---local node1_material = gui.get_material(node1)
---gui.set_material(node2, node1_material)
---```
---@param node node node to get the material for
---@return hash materal material id
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_material:node)
function gui.get_material(node) end

---Retrieves the node with the specified id.
---
---**Examples:**
---
---Gets a node by id and change its color:
---
---```lua
---local node = gui.get_node("my_node")
---local red = vmath.vector4(1.0, 0.0, 0.0, 1.0)
---gui.set_color(node, red)
---```
---@param id string|hash id of the node to retrieve
---@return node instance a new node instance
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_node:id)
function gui.get_node(id) end

---Returns the outer bounds mode for a pie node.
---@param node node node from where to get the outer bounds mode
---@return gui.PIEBOUNDS bounds_mode the outer bounds mode of the pie node
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_outer_bounds:node)
function gui.get_outer_bounds(node) end

---Returns the outline color of the supplied node.
---See `gui.get_color` for info how vectors encode color values.
---@param node node node to get the outline color from
---@return vector4 color outline color
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_outline:node)
function gui.get_outline(node) end

---Returns the parent node of the specified node.
---If the supplied node does not have a parent, `nil` is returned.
---@param node node the node from which to retrieve its parent
---@return node|nil parent parent instance or `nil`
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_parent:node)
function gui.get_parent(node) end

---Get the paricle fx for a gui node
---@param node node node to get particle fx for
---@return hash particlefx particle fx id
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_particlefx:node)
function gui.get_particlefx(node) end

---Returns the number of generated vertices around the perimeter
---of a pie node.
---@param node node pie node
---@return number vertices vertex count
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_perimeter_vertices:node)
function gui.get_perimeter_vertices(node) end

---The pivot specifies how the node is drawn and rotated from its position.
---@param node node node to get pivot from
---@return gui.PIVOT pivot pivot constant  - `gui.PIVOT_CENTER`  - `gui.PIVOT_N`  - `gui.PIVOT_NE`  - `gui.PIVOT_E`  - `gui.PIVOT_SE`  - `gui.PIVOT_S`  - `gui.PIVOT_SW`  - `gui.PIVOT_W`  - `gui.PIVOT_NW`
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_pivot:node)
function gui.get_pivot(node) end

---Returns the position of the supplied node.
---@param node node node to get the position from
---@return vector3 position node position
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_position:node)
function gui.get_position(node) end

---Returns the rotation of the supplied node.
---The rotation is expressed as a quaternion
---@param node node node to get the rotation from
---@return quaternion rotation node rotation
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_rotation:node)
function gui.get_rotation(node) end

---Returns the scale of the supplied node.
---@param node node node to get the scale from
---@return vector3 scale node scale
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_scale:node)
function gui.get_scale(node) end

---Returns the screen position of the supplied node. This function returns the
---calculated transformed position of the node, taking into account any parent node
---transforms.
---@param node node node to get the screen position from
---@return vector3 position node screen position
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_screen_position:node)
function gui.get_screen_position(node) end

---Returns the shadow color of the supplied node.
---See `gui.get_color` for info how vectors encode color values.
---@param node node node to get the shadow color from
---@return vector4 color node shadow color
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_shadow:node)
function gui.get_shadow(node) end

---Returns the size of the supplied node.
---@param node node node to get the size from
---@return vector3 size node size
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_size:node)
function gui.get_size(node) end

---Returns the size of a node.
---The size mode defines how the node will adjust itself in size. Automatic
---size mode alters the node size based on the node's content. Automatic size
---mode works for Box nodes and Pie nodes which will both adjust their size
---to match the assigned image. Particle fx and Text nodes will ignore
---any size mode setting.
---@param node node node from which to get the size mode (node)
---@return gui.SIZE_MODE size_mode the current size mode
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_size_mode:node)
function gui.get_size_mode(node) end

---Returns the slice9 configuration values for the node.
---@param node node node to manipulate
---@return vector4 values configuration values
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_slice9:node)
function gui.get_slice9(node) end

---Returns the text value of a text node. This is only useful for text nodes.
---@param node node node from which to get the text
---@return string text text value
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_text:node)
function gui.get_text(node) end

---Returns the texture of a node.
---This is currently only useful for box or pie nodes.
---The texture must be mapped to the gui scene in the gui editor.
---@param node node node to get texture from
---@return hash texture texture id
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_texture:node)
function gui.get_texture(node) end

---Returns the tracking value of a text node.
---@param node node node from where to get the tracking
---@return number tracking tracking scaling number (default=0)
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_tracking:node)
function gui.get_tracking(node) end

---Get a node and all its children as a Lua table.
---@param node node root node to get node tree from
---@return table<hash, node> clones a table mapping node ids to the corresponding nodes
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_tree:node)
function gui.get_tree(node) end

---gets the node type
---@param node node node from which to get the type
---@return gui.TYPE type type
---@return number|nil subtype id of the custom type
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_type:node)
function gui.get_type(node) end

---Returns `true` if a node is visible and `false` if it's not.
---Invisible nodes are not rendered.
---@param node node node to query
---@return boolean visible whether the node is visible or not
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_visible:node)
function gui.get_visible(node) end

---Returns the scene width.
---@return number width scene width
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_width:)
function gui.get_width() end

---The x-anchor specifies how the node is moved when the game is run in a different resolution.
---@param node node node to get x-anchor from
---@return gui.ANCHOR anchor anchor constant  - `gui.ANCHOR_NONE` - `gui.ANCHOR_LEFT` - `gui.ANCHOR_RIGHT`
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_xanchor:node)
function gui.get_xanchor(node) end

---The y-anchor specifies how the node is moved when the game is run in a different resolution.
---@param node node node to get y-anchor from
---@return gui.ANCHOR anchor anchor constant  - `gui.ANCHOR_NONE` - `gui.ANCHOR_TOP` - `gui.ANCHOR_BOTTOM`
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.get_yanchor:node)
function gui.get_yanchor(node) end

---Hides the on-display touch keyboard on the device.
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.hide_keyboard:)
function gui.hide_keyboard() end

---Returns `true` if a node is enabled and `false` if it's not.
---Disabled nodes are not rendered and animations acting on them are not evaluated.
---@param node node node to query
---@param recursive? boolean check hierarchy recursively
---@return boolean enabled whether the node is enabled or not
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.is_enabled:node-recursive)
function gui.is_enabled(node, recursive) end

---Alters the ordering of the two supplied nodes by moving the first node
---above the second.
---If the second argument is `nil` the first node is moved to the top.
---@param node node to move
---@param reference node|nil reference node above which the first node should be moved
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.move_above:node-reference)
function gui.move_above(node, reference) end

---Alters the ordering of the two supplied nodes by moving the first node
---below the second.
---If the second argument is `nil` the first node is moved to the bottom.
---@param node node to move
---@param reference node|nil reference node below which the first node should be moved
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.move_below:node-reference)
function gui.move_below(node, reference) end

---Dynamically create a new box node.
---@param pos vector3|vector4 node position
---@param size vector3 node size
---@return node node new box node
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.new_box_node:pos-size)
function gui.new_box_node(pos, size) end

---Dynamically create a particle fx node.
---@param pos vector3|vector4 node position
---@param particlefx hash|string particle fx resource name
---@return node node new particle fx node
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.new_particlefx_node:pos-particlefx)
function gui.new_particlefx_node(pos, particlefx) end

---Dynamically create a new pie node.
---@param pos vector3|vector4 node position
---@param size vector3 node size
---@return node node new pie node
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.new_pie_node:pos-size)
function gui.new_pie_node(pos, size) end

---Dynamically create a new text node.
---@param pos vector3|vector4 node position
---@param text string node text
---@return node node new text node
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.new_text_node:pos-text)
function gui.new_text_node(pos, text) end

---Dynamically create a new texture.
---
---**Examples:**
---
---How to create a texture and apply it to a new box node:
---
---```lua
---function init(self)
---     local w = 200
---     local h = 300
---
---     -- A nice orange. String with the RGB values.
---     local orange = string.char(0xff) .. string.char(0x80) .. string.char(0x10)
---
---     -- Create the texture. Repeat the color string for each pixel.
---     local ok, reason = gui.new_texture("orange_tx", w, h, "rgb", string.rep(orange, w * h))
---     if ok then
---         -- Create a box node and apply the texture to it.
---         local n = gui.new_box_node(vmath.vector3(200, 200, 0), vmath.vector3(w, h, 0))
---         gui.set_texture(n, "orange_tx")
---     else
---         -- Could not create texture for some reason...
---         if reason == gui.RESULT_TEXTURE_ALREADY_EXISTS then
---             ...
---         else
---             ...
---         end
---     end
---end
---```
---
---How to create a texture using .astc format
---
---```lua
---local path = "/assets/images/logo_4x4.astc"
---local buffer = sys.load_resource(path)
---local n = gui.new_box_node(pos, vmath.vector3(size, size, 0))
----- size is read from the .astc buffer
----- flip is not supported
---gui.new_texture(path, 0, 0, "astc", buffer, false)
---gui.set_texture(n, path)
---```
---@param texture_id string|hash texture id
---@param width number texture width
---@param height number texture height
---@param type string|image.TYPE texture type  - `"rgb"` or `image.TYPE_RGB` - RGB  - `"rgba"` or `image.TYPE_RGBA` - RGBA  - `"l"` or `image.TYPE_LUMINANCE` - LUMINANCE  - `"astc"` - ASTC compressed format
---@param buffer string texture data
---@param flip boolean flip texture vertically
---@return boolean success texture creation was successful
---@return gui.RESULT|nil code one of the gui.RESULT_* codes if unsuccessful
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.new_texture:texture_id-width-height-type-buffer-flip)
function gui.new_texture(texture_id, width, height, type, buffer, flip) end

---Tests whether a coordinate is within the bounding box of a
---node.
---@param node node node to be tested for picking
---@param x number x-coordinate (see [on_input](#on_input) )
---@param y number y-coordinate (see [on_input](#on_input) )
---@return boolean pickable pick result
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.pick_node:node-x-y)
function gui.pick_node(node, x, y) end

---Play flipbook animation on a box or pie node.
---The current node texture must contain the animation.
---Use this function to set one-frame still images on the node.
---
---**Examples:**
---
---Set the texture of a node to a flipbook animation from an atlas:
---
---```lua
---local function anim_callback(self, node)
---    -- Take action after animation has played.
---end
---
---function init(self)
---    -- Create a new node and set the texture to a flipbook animation
---    local node = gui.get_node("button_node")
---    gui.set_texture(node, "gui_sprites")
---    gui.play_flipbook(node, "animated_button")
---end
---```
---
---Set the texture of a node to an image from an atlas:
---
---```lua
----- Create a new node and set the texture to a "button.png" from atlas
---local node = gui.get_node("button_node")
---gui.set_texture(node, "gui_sprites")
---gui.play_flipbook(node, "button")
---```
---@param node node node to set animation for
---@param animation string|hash animation id
---@param complete_function? fun(self:script_instance, node:node) optional function to call when the animation has completed  `self` `script_instance` The current script instance.  `node` `node` The node that is animated.
---@param play_properties? gui.play_properties optional playback properties
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.play_flipbook:node-animation-complete_function-play_properties)
function gui.play_flipbook(node, animation, complete_function, play_properties) end

---Plays the paricle fx for a gui node
---
---**Examples:**
---
---How to play a particle fx when a gui node is created.
---The callback receives the gui node, the hash of the id
---of the emitter, and the new state of the emitter as particlefx.EMITTER_STATE_<STATE>.
---
---```lua
---local function emitter_state_change(self, node, emitter, state)
---  if emitter == hash("exhaust") and state == particlefx.EMITTER_STATE_POSTSPAWN then
---    -- exhaust is done spawning particles...
---  end
---end
---
---function init(self)
---    gui.play_particlefx(gui.get_node("particlefx"), emitter_state_change)
---end
---```
---@param node node node to play particle fx for
---@param emitter_state_function? fun(self:script_instance, node:node|nil, emitter:hash, state:particlefx.EMITTER_STATE) optional callback function that will be called when an emitter attached to this particlefx changes state.
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.play_particlefx:node-emitter_state_function)
function gui.play_particlefx(node, emitter_state_function) end

---Resets the input context of keyboard. This will clear marked text.
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.reset_keyboard:)
function gui.reset_keyboard() end

---Resets the node material to the material assigned in the gui scene.
---
---**Examples:**
---
---Resetting the material for a node:
---
---```lua
---local node = gui.get_node("my_node")
---gui.reset_material(node)
---```
---@param node node node to reset the material for
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.reset_material:node)
function gui.reset_material(node) end

---Resets all nodes in the current GUI scene to their initial state.
---The reset only applies to static node loaded from the scene.
---Nodes that are created dynamically from script are not affected.
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.reset_nodes:)
function gui.reset_nodes() end

---Converts a screen-space position to the local position value for the supplied node.
---The conversion takes the parent transform, anchors, adjust mode, and adjust reference into account.
---
---**Examples:**
---
---Animate a node to the pressed pointer position:
---
---```lua
---function init(self)
---    msg.post(".", "acquire_input_focus")
---    self.marker = gui.get_node("marker")
---end
---
---function on_input(self, action_id, action)
---    if action_id == hash("touch") and action.pressed then
---        local screen_position = vmath.vector3(action.screen_x, action.screen_y, 0)
---        local target_position = gui.screen_to_local(self.marker, screen_position)
---        gui.animate(self.marker, gui.PROP_POSITION, target_position, gui.EASING_OUTQUAD, 0.2)
---        return true
---    end
---end
---```
---@param node node node whose local position space should be used
---@param screen_position vector3 screen-space position
---@return vector3 local_position local position value for the node
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.screen_to_local:node-screen_position)
function gui.screen_to_local(node, screen_position) end

---Instead of using specific setteres such as gui.set_position or gui.set_scale,
---you can use gui.set instead and supply the property as a string or a hash.
---While this function is similar to go.get and go.set, there are a few more restrictions
---when operating in the gui namespace. Most notably, only these named properties identifiers are supported:
---
---- `"position"`
---- `"rotation"`
---- `"euler"`
---- `"scale"`
---- `"color"`
---- `"outline"`
---- `"shadow"`
---- `"size"`
---- `"fill_angle"` (pie)
---- `"inner_radius"` (pie)
---- `"leading"` (text)
---- `"tracking"` (text)
---- `"slice9"` (slice9)
---
---The value to set must either be a vmath.vector4, vmath.vector3, vmath.quat or a single number and depends on the property name you want to set.
---I.e when setting the "position" property, you need to use a vmath.vector4 and when setting a single component of the property,
---such as "position.x", you need to use a single value.
---
---Note: When setting the rotation using the "rotation" property, you need to pass in a vmath.quat. This behaviour is different than from the gui.set_rotation function,
---the intention is to move new functionality closer to go namespace so that migrating between gui and go is easier. To set the rotation using degrees instead,
---use the "euler" property instead. The rotation and euler properties are linked, changing one of them will change the backing data of the other.
---
---Similar to go.set, you can also use gui.set for setting material constant values on a node. E.g if a material has specified a constant called `tint` in
---the .material file, you can use gui.set to set the value of that constant by calling `gui.set(node, "tint", vmath.vec4(1,0,0,1))`, or `gui.set(node, "matrix", vmath.matrix4())`
---if the constant is a matrix. Arrays are also supported by gui.set - to set an array constant, you need to pass in an options table with the 'index' key set.
---If the material has a constant array called 'tint_array' specified in the material, you can use `gui.set(node, "tint_array", vmath.vec4(1,0,0,1), { index = 4})` to set the fourth array element to a different value.
---
---**Examples:**
---
---Updates the position property on an existing node:
---
---```lua
---local node = gui.get_node("my_box_node")
---local node_position = gui.get(node, "position")
---gui.set(node, "position.x", node_position.x + 128)
---```
---
---Updates the rotation property on an existing node:
---
---```lua
---local node = gui.get_node("my_box_node")
---gui.set(node, "rotation", vmath.quat_rotation_z(math.rad(45)))
----- this is equivalent to:
---gui.set(node, "euler.z", 45)
----- or using the entire vector:
---gui.set(node, "euler", vmath.vector3(0,0,45))
----- or using the set_rotation
---gui.set_rotation(node, vmath.vector3(0,0,45))
---```
---
---Sets various material constants for a node:
---
---```lua
---local node = gui.get_node("my_box_node")
---gui.set(node, "tint", vmath.vector4(1,0,0,1))
----- matrix4 is also supported
---gui.set(node, "light_matrix", vmath.matrix4())
----- update a constant in an array at position 4. the array is specified in the shader as:
----- uniform vec4 tint_array[4]; // lua is 1 based, shader is 0 based
---gui.set(node, "tint_array", vmath.vector4(1,0,0,1), { index = 4 })
----- update a matrix constant in an array at position 4. the array is specified in the shader as:
----- uniform mat4 light_matrix_array[4];
---gui.set(node, "light_matrix_array", vmath.matrix4(), { index = 4 })
----- update a sub-element in a constant
---gui.set(node, "tint.x", 1)
----- update a sub-element in an array constant at position 4
---gui.set(node, "tint_array.x", 1, {index = 4})
---```
---
---Set a named property
---
---```lua
---function on_message(self, message_id, message, sender)
---   if message_id == hash("set_font") then
---       gui.set(msg.url(), "fonts", message.font, {key = "my_font_name"})
---       gui.set_font(gui.get_node("text"), "my_font_name")
---   elseif message_id == hash("set_texture") then
---       gui.set(msg.url(), "textures", message.texture, {key = "my_texture"})
---       gui.set_texture(gui.get_node("box"), "my_texture")
---       gui.play_flipbook(gui.get_node("box"), "logo_256")
---   end
---end
---```
---
---Remove a named runtime texture resource mapping:
---
---```lua
---local atlas_id = resource.create_atlas("/runtime.texturesetc", atlas_params)
---gui.set(msg.url(), "textures", atlas_id, {key = "runtime_texture"})
---gui.set_texture(gui.get_node("box"), "runtime_texture")
---
----- Later, remove the GUI mapping before releasing the atlas resource.
---gui.set(msg.url(), "textures", nil, {key = "runtime_texture"})
---resource.release(atlas_id)
---```
---@param node node|url node to set the property for, or msg.url() to the gui itself
---@param property string|hash|gui.PROP the property to set
---@param value number|vector4|vector3|quaternion|nil the property to set. `nil` is only supported for removing runtime texture mappings with `gui.set(msg.url(), "textures", nil, {key = ...})`.
---@param options? gui.set_options optional material-constant options
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set:node-property-value-options)
function gui.set(node, property, value, options) end

---Sets the adjust mode on a node.
---The adjust mode defines how the node will adjust itself to screen
---resolutions that differs from the one in the project settings.
---@param node node node to set adjust mode for
---@param adjust_mode gui.ADJUST adjust mode to set
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_adjust_mode:node-adjust_mode)
function gui.set_adjust_mode(node, adjust_mode) end

---sets the node alpha
---@param node node node for which to set alpha
---@param alpha number 0..1 alpha color
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_alpha:node-alpha)
function gui.set_alpha(node, alpha) end

---Set the blend mode of a node.
---Blend mode defines how the node will be blended with the background.
---@param node node node to set blend mode for
---@param blend_mode gui.BLEND blend mode to set
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_blend_mode:node-blend_mode)
function gui.set_blend_mode(node, blend_mode) end

---If node is set as an inverted clipping node, it will clip anything inside as opposed to outside.
---@param node node node to set clipping inverted state for
---@param inverted boolean `true` or `false`
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_clipping_inverted:node-inverted)
function gui.set_clipping_inverted(node, inverted) end

---Clipping mode defines how the node will clip it's children nodes
---@param node node node to set clipping mode for
---@param clipping_mode gui.CLIPPING_MODE clipping mode to set  - `gui.CLIPPING_MODE_NONE`  - `gui.CLIPPING_MODE_STENCIL`
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_clipping_mode:node-clipping_mode)
function gui.set_clipping_mode(node, clipping_mode) end

---If node is set as an visible clipping node, it will be shown as well as clipping. Otherwise, it will only clip but not show visually.
---@param node node node to set clipping visibility for
---@param visible boolean `true` or `false`
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_clipping_visible:node-visible)
function gui.set_clipping_visible(node, visible) end

---Sets the color of the supplied node. The components
---of the supplied vector3 or vector4 should contain the color channel values:
---
---Component        | Color value
------------------- | -------------
---x                | Red value
---y                | Green value
---z                | Blue value
---w `vector4` | Alpha value
---@param node node node to set the color for
---@param color vector3|vector4 new color
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_color:node-color)
function gui.set_color(node, color) end

---Sets a node to the disabled or enabled state.
---Disabled nodes are not rendered and animations acting on them are not evaluated.
---@param node node node to be enabled/disabled
---@param enabled boolean whether the node should be enabled or not
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_enabled:node-enabled)
function gui.set_enabled(node, enabled) end

---Sets the rotation of the supplied node.
---The rotation is expressed in degree Euler angles.
---@param node node node to set the rotation for
---@param rotation vector3|vector4 new rotation
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_euler:node-rotation)
function gui.set_euler(node, rotation) end

---Set the sector angle of a pie node.
---@param node node node to set the fill angle for
---@param angle number sector angle
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_fill_angle:node-angle)
function gui.set_fill_angle(node, angle) end

---This is only useful nodes with flipbook animations. The cursor is normalized.
---@param node node node to set the cursor for
---@param cursor number cursor value
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_flipbook_cursor:node-cursor)
function gui.set_flipbook_cursor(node, cursor) end

---This is only useful nodes with flipbook animations. Sets the playback rate of the flipbook animation on a node. Must be positive.
---@param node node node to set the cursor for
---@param playback_rate number playback rate
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_flipbook_playback_rate:node-playback_rate)
function gui.set_flipbook_playback_rate(node, playback_rate) end

---This is only useful for text nodes.
---The font must be mapped to the gui scene in the gui editor.
---@param node node node for which to set the font
---@param font string|hash font id
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_font:node-font)
function gui.set_font(node, font) end

---Set the id of the specicied node to a new value.
---Nodes created with the gui.new_*_node() functions get
---an empty id. This function allows you to give dynamically
---created nodes an id.
---
---No checking is done on the uniqueness of supplied ids.
---It is up to you to make sure you use unique ids.
---
---**Examples:**
---
---Create a new node and set its id:
---
---```lua
---local pos = vmath.vector3(100, 100, 0)
---local size = vmath.vector3(100, 100, 0)
---local node = gui.new_box_node(pos, size)
---gui.set_id(node, "my_new_node")
---```
---@param node node node to set the id for
---@param id string|hash id to set
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_id:node-id)
function gui.set_id(node, id) end

---sets the node inherit alpha state
---@param node node node from which to set the inherit alpha state
---@param inherit_alpha boolean `true` or `false`
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_inherit_alpha:node-inherit_alpha)
function gui.set_inherit_alpha(node, inherit_alpha) end

---Sets the inner radius of a pie node.
---The radius is defined along the x-axis.
---@param node node node to set the inner radius for
---@param radius number inner radius
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_inner_radius:node-radius)
function gui.set_inner_radius(node, radius) end

---The layer must be mapped to the gui scene in the gui editor.
---@param node node node for which to set the layer
---@param layer string|hash layer id
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_layer:node-layer)
function gui.set_layer(node, layer) end

---Applies a named layout on the GUI scene. This re-applies per-layout node descriptors
---and, if a matching Display Profile exists, updates the scene resolution. Emits
---the "layout_changed" message to the scene script when the layout actually changes.
---@param layout string|hash the layout id to apply
---@return boolean true if the layout exists in the scene and was applied, false otherwise
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_layout:layout)
function gui.set_layout(layout) end

---Sets the leading value for a text node. This value is used to
---scale the line spacing of text.
---@param node node node for which to set the leading
---@param leading number a scaling value for the line spacing (default=1)
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_leading:node-leading)
function gui.set_leading(node, leading) end

---Sets the line-break mode on a text node.
---This is only useful for text nodes.
---@param node node node to set line-break for
---@param line_break boolean `true` or `false`
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_line_break:node-line_break)
function gui.set_line_break(node, line_break) end

---Set the material on a node. The material must be mapped to the gui scene in the gui editor,
---and assigning a material is supported for all node types. To set the default material that
---is assigned to the gui scene node, use `gui.reset_material(node_id)` instead.
---
---**Examples:**
---
---Assign an existing material to a node:
---
---```lua
---local node = gui.get_node("my_node")
---gui.set_material(node, "my_material")
---```
---@param node node node to set material for
---@param material string|hash material id
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_material:node-material)
function gui.set_material(node, material) end

---Sets the outer bounds mode for a pie node.
---@param node node node for which to set the outer bounds mode
---@param bounds_mode gui.PIEBOUNDS the outer bounds mode of the pie node
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_outer_bounds:node-bounds_mode)
function gui.set_outer_bounds(node, bounds_mode) end

---Sets the outline color of the supplied node.
---See `gui.set_color` for info how vectors encode color values.
---@param node node node to set the outline color for
---@param color vector3|vector4 new outline color
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_outline:node-color)
function gui.set_outline(node, color) end

---Sets the parent node of the specified node.
---@param node node node for which to set its parent
---@param parent? node parent node to set, pass `nil` to remove parent
---@param keep_scene_transform? boolean optional flag to make the scene position being perserved
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_parent:node-parent-keep_scene_transform)
function gui.set_parent(node, parent, keep_scene_transform) end

---Set the paricle fx for a gui node
---@param node node node to set particle fx for
---@param particlefx hash|string particle fx id
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_particlefx:node-particlefx)
function gui.set_particlefx(node, particlefx) end

---Sets the number of generated vertices around the perimeter of a pie node.
---@param node node pie node
---@param vertices number vertex count
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_perimeter_vertices:node-vertices)
function gui.set_perimeter_vertices(node, vertices) end

---The pivot specifies how the node is drawn and rotated from its position.
---@param node node node to set pivot for
---@param pivot gui.PIVOT pivot constant  - `gui.PIVOT_CENTER`  - `gui.PIVOT_N`  - `gui.PIVOT_NE`  - `gui.PIVOT_E`  - `gui.PIVOT_SE`  - `gui.PIVOT_S`  - `gui.PIVOT_SW`  - `gui.PIVOT_W`  - `gui.PIVOT_NW`
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_pivot:node-pivot)
function gui.set_pivot(node, pivot) end

---Sets the position of the supplied node.
---@param node node node to set the position for
---@param position vector3|vector4 new position
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_position:node-position)
function gui.set_position(node, position) end

---Set the order number for the current GUI scene.
---The number dictates the sorting of the "gui" render predicate,
---in other words in which order the scene will be rendered in relation
---to other currently rendered GUI scenes.
---
---The number must be in the range 0 to 15.
---@param order number rendering order (0-15)
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_render_order:order)
function gui.set_render_order(order) end

---Sets the rotation of the supplied node.
---The rotation is expressed as a quaternion
---@param node node node to set the rotation for
---@param rotation quaternion|vector4 new rotation
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_rotation:node-rotation)
function gui.set_rotation(node, rotation) end

---Sets how the safe area is applied to this gui scene.
---@param mode gui.SAFE_AREA safe area mode
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_safe_area_mode:mode)
function gui.set_safe_area_mode(mode) end

---Sets the scaling of the supplied node.
---@param node node node to set the scale for
---@param scale vector3|vector4 new scale
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_scale:node-scale)
function gui.set_scale(node, scale) end

---Set the screen position to the supplied node
---@param node node node to set the screen position to
---@param screen_position vector3 screen position
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_screen_position:node-screen_position)
function gui.set_screen_position(node, screen_position) end

---Sets the shadow color of the supplied node.
---See `gui.set_color` for info how vectors encode color values.
---@param node node node to set the shadow color for
---@param color vector3|vector4 new shadow color
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_shadow:node-color)
function gui.set_shadow(node, color) end

---Sets the size of the supplied node.
---
---You can only set size on nodes with size mode set to SIZE_MODE_MANUAL
---@param node node node to set the size for
---@param size vector3|vector4 new size
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_size:node-size)
function gui.set_size(node, size) end

---Sets the size mode of a node.
---The size mode defines how the node will adjust itself in size. Automatic
---size mode alters the node size based on the node's content. Automatic size
---mode works for Box nodes and Pie nodes which will both adjust their size
---to match the assigned image. Particle fx and Text nodes will ignore
---any size mode setting.
---@param node node node to set size mode for
---@param size_mode gui.SIZE_MODE size mode to set
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_size_mode:node-size_mode)
function gui.set_size_mode(node, size_mode) end

---Set the slice9 configuration values for the node.
---@param node node node to manipulate
---@param values vector4 new values
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_slice9:node-values)
function gui.set_slice9(node, values) end

---Set the text value of a text node. This is only useful for text nodes.
---@param node node node to set text for
---@param text string|number text to set
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_text:node-text)
function gui.set_text(node, text) end

---Set the texture on a box or pie node. The texture must be mapped to
---the gui scene in the gui editor. The function points out which texture
---the node should render from. If the texture is an atlas, further
---information is needed to select which image/animation in the atlas
---to render. In such cases, use `gui.play_flipbook()` in
---addition to this function.
---
---**Examples:**
---
---To set a texture (or animation) from an atlas:
---
---```lua
---local node = gui.get_node("box_node")
---gui.set_texture(node, "my_atlas")
---gui.play_flipbook(node, "image")
---```
---
---Set a dynamically created texture to a node. Note that there is only
---one texture image in this case so <code>gui.set_texture()</code> is
---sufficient.
---
---```lua
---local w = 200
---local h = 300
----- A nice orange. String with the RGB values.
---local orange = string.char(0xff) .. string.char(0x80) .. string.char(0x10)
----- Create the texture. Repeat the color string for each pixel.
---if gui.new_texture("orange_tx", w, h, "rgb", string.rep(orange, w * h)) then
---    local node = gui.get_node("box_node")
---    gui.set_texture(node, "orange_tx")
---end
---```
---@param node node node to set texture for
---@param texture string|hash texture id
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_texture:node-texture)
function gui.set_texture(node, texture) end

---Set the texture buffer data for a dynamically created texture.
---
---**Examples:**
---
---```lua
---function init(self)
---     local w = 200
---     local h = 300
---
---     -- Create a dynamic texture, all white.
---     if gui.new_texture("dynamic_tx", w, h, "rgb", string.rep(string.char(0xff), w * h * 3)) then
---         -- Create a box node and apply the texture to it.
---         local n = gui.new_box_node(vmath.vector3(200, 200, 0), vmath.vector3(w, h, 0))
---         gui.set_texture(n, "dynamic_tx")
---
---         ...
---
---         -- Change the data in the texture to a nice orange.
---         local orange = string.char(0xff) .. string.char(0x80) .. string.char(0x10)
---         if gui.set_texture_data("dynamic_tx", w, h, "rgb", string.rep(orange, w * h)) then
---             -- Go on and to more stuff
---             ...
---         end
---     else
---         -- Something went wrong
---         ...
---     end
---end
---```
---@param texture string|hash texture id
---@param width number texture width
---@param height number texture height
---@param type string|image.TYPE texture type  - `"rgb"` or `image.TYPE_RGB` - RGB  - `"rgba"` or `image.TYPE_RGBA` - RGBA  - `"l"` or `image.TYPE_LUMINANCE` - LUMINANCE  - `"astc"` - ASTC compressed format
---@param buffer string texture data
---@param flip boolean flip texture vertically
---@return boolean success setting the data was successful
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_texture_data:texture-width-height-type-buffer-flip)
function gui.set_texture_data(texture, width, height, type, buffer, flip) end

---Sets the tracking value of a text node. This value is used to
---adjust the vertical spacing of characters in the text.
---@param node node node for which to set the tracking
---@param tracking number a scaling number for the letter spacing (default=0)
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_tracking:node-tracking)
function gui.set_tracking(node, tracking) end

---Set if a node should be visible or not. Only visible nodes are rendered.
---@param node node node to be visible or not
---@param visible boolean whether the node should be visible or not
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_visible:node-visible)
function gui.set_visible(node, visible) end

---The x-anchor specifies how the node is moved when the game is run in a different resolution.
---@param node node node to set x-anchor for
---@param anchor gui.ANCHOR anchor constant  - `gui.ANCHOR_NONE` - `gui.ANCHOR_LEFT` - `gui.ANCHOR_RIGHT`
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_xanchor:node-anchor)
function gui.set_xanchor(node, anchor) end

---The y-anchor specifies how the node is moved when the game is run in a different resolution.
---@param node node node to set y-anchor for
---@param anchor gui.ANCHOR anchor constant  - `gui.ANCHOR_NONE` - `gui.ANCHOR_TOP` - `gui.ANCHOR_BOTTOM`
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.set_yanchor:node-anchor)
function gui.set_yanchor(node, anchor) end

---Shows the on-display touch keyboard.
---The specified type of keyboard is displayed if it is available on
---the device.
---
---This function is only available on iOS and Android.  .
---@param type gui.KEYBOARD_TYPE keyboard type
---@param autoclose boolean if the keyboard should automatically close when clicking outside
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.show_keyboard:type-autoclose)
function gui.show_keyboard(type, autoclose) end

---Stops the particle fx for a gui node
---@param node node node to stop particle fx for
---@param options? particlefx.stop_options options used when stopping the particle fx
---
---[Open in Browser](https://defold.com/ref/gui-lua#gui.stop_particlefx:node-options)
function gui.stop_particlefx(node, options) end
