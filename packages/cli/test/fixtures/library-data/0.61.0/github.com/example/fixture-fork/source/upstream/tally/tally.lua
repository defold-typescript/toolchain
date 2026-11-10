--- Counts events and reports them in batches.
--
-- @usage
--
--	local tally = require "tally.tally"
--
--	function init(self)
--		tally.push(on_first, on_second)
--		tally.flush()
--	end
--

local M = {}

local pending = {}

--- Add one or more event handlers
-- Each handler must be a function
function M.push(...)
	local args = {...}
	for _, handler in ipairs(args) do
		pending[#pending + 1] = handler
	end
end

--- Run every handler added via @{push}
function M.flush(options)
	options = options or {}
	for _, handler in ipairs(pending) do
		if not options.pattern or tostring(handler):match(options.pattern) then
			handler()
		end
	end
	pending = {}
end

return M
