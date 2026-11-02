local glow = {}

glow.mode = {
	GLOW_SOFT = 1,
	GLOW_HARD = 2
}

local enabled = false
local tint = vmath.vector4(1.0, 1.0, 1.0, 1.0)
local radius = 1
local mode = 1
local predicate = "glow"

---@param size number
---@param color vector4
---@param kind integer
function glow.configure(size, color, kind)
	radius = size
	tint = color
	mode = kind
end

---@param on boolean
function glow.enable(on)
	enabled = on
end

---@param tag string
function glow.set_predicate(tag)
	predicate = tag
end

function glow.setup(self)
	self.predicates[predicate] = render.predicate({ predicate })
end

return glow
