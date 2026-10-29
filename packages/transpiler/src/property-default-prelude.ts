// Lua that runs inside the property-default sandbox. `install_sandbox` strips
// file, process and loader access from the standard libraries, adds the
// Defold stand-ins a default may use, and returns a reader for their values
// plus the chunk-backed `require`.
export const PROPERTY_DEFAULT_PRELUDE = `
local function install_sandbox(chunks, resource_kinds)
  local G = _G
  local error, type, select, ipairs, rawget, setmetatable, pcall, xpcall, load =
    error, type, select, ipairs, rawget, setmetatable, pcall, xpcall, load
  local raw_tostring, format, unpack, sin, cos =
    tostring, string.format, table.unpack, math.sin, math.cos
  local SUFFIX = " is not available when computing a property default"

  local function unavailable(name)
    error(name .. SUFFIX, 0)
  end

  for _, name in ipairs({ "dofile", "loadfile", "load", "loadstring", "print", "warn", "collectgarbage" }) do
    G[name] = nil
  end
  for _, member in ipairs({ { string, "string", "dump" }, { math, "math", "random" }, { math, "math", "randomseed" } }) do
    local qualified = member[2] .. "." .. member[3]
    member[1][member[3]] = function()
      unavailable(qualified)
    end
  end

  -- LuaJIT spellings TSTL's Lua 5.1 output and lualib read.
  G.unpack = unpack
  math.atan2 = math.atan

  G.tostring = function(value)
    if type(value) == "number" then
      return format("%.14g", value)
    end
    return raw_tostring(value)
  end

  -- The time limit raises a userdata error, and project code cannot make
  -- userdata, so rethrowing it keeps a pcall loop from swallowing the limit.
  local function rethrow_limit(ok, ...)
    if not ok and type((...)) == "userdata" then
      error((...), 0)
    end
    return ok, ...
  end
  G.pcall = function(f, ...)
    return rethrow_limit(pcall(f, ...))
  end
  G.xpcall = function(f, handler, ...)
    return rethrow_limit(xpcall(f, function(e)
      if type(e) == "userdata" then
        return e
      end
      return handler(e)
    end, ...))
  end
  -- A finalizer runs outside any caller, so an error there, the time limit's
  -- included, never stops the evaluation.
  G.setmetatable = function(t, mt)
    if type(mt) == "table" and rawget(mt, "__gc") ~= nil then
      unavailable("__gc")
    end
    return setmetatable(t, mt)
  end

  local LOADING = {}
  local loaded = {}
  local function module_standin(name)
    local label = "module '" .. name .. "'"
    local function refuse()
      unavailable(label)
    end
    return setmetatable({}, { __index = refuse, __newindex = refuse, __call = refuse })
  end
  local function require(name)
    local cached = loaded[name]
    if cached == LOADING then
      error("module '" .. raw_tostring(name) .. "' requires itself while loading", 0)
    end
    if cached ~= nil then
      return cached
    end
    local source = type(name) == "string" and chunks[name] or nil
    if source == nil then
      cached = module_standin(raw_tostring(name))
      loaded[name] = cached
      return cached
    end
    local chunk, message = load(source, "=" .. name, "t", G)
    if chunk == nil then
      error(message, 0)
    end
    loaded[name] = LOADING
    local result = chunk(name)
    if result == nil then
      result = true
    end
    loaded[name] = result
    return result
  end
  G.require = require

  local records = setmetatable({}, { __mode = "k" })
  local SIZE = { vector3 = 3, vector4 = 4, quat = 4 }
  local SLOT = {
    vector3 = { x = 1, y = 2, z = 3 },
    vector4 = { x = 1, y = 2, z = 3, w = 4 },
    quat = { x = 1, y = 2, z = 3, w = 4 },
  }
  local vector_mt = {}

  local function new_vector(kind, x, y, z, w)
    local vector = setmetatable({}, vector_mt)
    records[vector] = { kind = kind, x, y, z, w }
    return vector
  end
  local function vector_record(value)
    local record = records[value]
    if record ~= nil and SIZE[record.kind] ~= nil then
      return record
    end
    return nil
  end
  local function slot_of(record, key)
    local slot = SLOT[record.kind][key]
    if slot == nil then
      error(record.kind .. " has no component '" .. raw_tostring(key) .. "'", 0)
    end
    return slot
  end
  local function same_kind_vectors(a, b, operation)
    local left, right = vector_record(a), vector_record(b)
    if left == nil or right == nil or left.kind ~= right.kind or left.kind == "quat" then
      error("cannot " .. operation .. " " .. (left and left.kind or type(a)) .. " and " .. (right and right.kind or type(b)), 0)
    end
    return left, right
  end

  vector_mt.__index = function(vector, key)
    local record = records[vector]
    return record[slot_of(record, key)]
  end
  vector_mt.__newindex = function(vector, key, value)
    local record = records[vector]
    local slot = slot_of(record, key)
    if type(value) ~= "number" then
      error(record.kind .. "." .. raw_tostring(key) .. " must be a number", 0)
    end
    record[slot] = value
  end
  vector_mt.__add = function(a, b)
    local l, r = same_kind_vectors(a, b, "add")
    return new_vector(l.kind, l[1] + r[1], l[2] + r[2], l[3] + r[3], l[4] and l[4] + r[4])
  end
  vector_mt.__sub = function(a, b)
    local l, r = same_kind_vectors(a, b, "subtract")
    return new_vector(l.kind, l[1] - r[1], l[2] - r[2], l[3] - r[3], l[4] and l[4] - r[4])
  end
  vector_mt.__unm = function(a)
    local v = same_kind_vectors(a, a, "negate")
    return new_vector(v.kind, -v[1], -v[2], -v[3], v[4] and -v[4])
  end
  vector_mt.__mul = function(a, b)
    if type(a) == "number" then
      a, b = b, a
    end
    local l = vector_record(a)
    if l ~= nil and l.kind ~= "quat" and type(b) == "number" then
      return new_vector(l.kind, l[1] * b, l[2] * b, l[3] * b, l[4] and l[4] * b)
    end
    local r = vector_record(b)
    if l ~= nil and r ~= nil and l.kind == "quat" and r.kind == "quat" then
      local x1, y1, z1, w1 = l[1], l[2], l[3], l[4]
      local x2, y2, z2, w2 = r[1], r[2], r[3], r[4]
      return new_vector(
        "quat",
        w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
        w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
        w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
        w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2
      )
    end
    error("cannot multiply " .. (l and l.kind or type(a)) .. " and " .. (r and r.kind or type(b)), 0)
  end
  vector_mt.__eq = function(a, b)
    local l, r = vector_record(a), vector_record(b)
    if l == nil or r == nil or l.kind ~= r.kind then
      return false
    end
    for i = 1, SIZE[l.kind] do
      if l[i] ~= r[i] then
        return false
      end
    end
    return true
  end
  vector_mt.__tostring = function(vector)
    local record = records[vector]
    local parts = {}
    for i = 1, SIZE[record.kind] do
      parts[i] = format("%.14g", record[i])
    end
    return "vmath." .. record.kind .. "(" .. table.concat(parts, ", ") .. ")"
  end

  local value_mt = {}
  local function new_value(kind, value, resource)
    local object = setmetatable({}, value_mt)
    records[object] = { kind = kind, value = value, resource = resource }
    return object
  end
  value_mt.__eq = function(a, b)
    local l, r = records[a], records[b]
    return l ~= nil and r ~= nil and l.kind == r.kind and l.value == r.value and l.resource == r.resource
  end
  value_mt.__tostring = function(object)
    local record = records[object]
    return record.kind .. ": [" .. raw_tostring(record.value) .. "]"
  end

  local function vector_constructor(kind, zero)
    local name = "vmath." .. kind
    return function(...)
      local count = select("#", ...)
      if count == 0 then
        return new_vector(kind, unpack(zero))
      end
      if count == 1 then
        local copy = vector_record((...))
        if copy ~= nil and copy.kind == kind then
          return new_vector(kind, copy[1], copy[2], copy[3], copy[4])
        end
        local n = ...
        if kind ~= "quat" and type(n) == "number" then
          return new_vector(kind, n, n, n, SIZE[kind] == 4 and n or nil)
        end
      elseif count == SIZE[kind] then
        for i = 1, count do
          if type((select(i, ...))) ~= "number" then
            error(name .. " expects numbers", 0)
          end
        end
        return new_vector(kind, ...)
      end
      error(name .. " cannot take these arguments", 0)
    end
  end
  local function rotation(axis)
    local name = "vmath.quat_rotation_" .. axis
    return function(angle)
      if type(angle) ~= "number" then
        error(name .. " expects a number", 0)
      end
      local s, c = sin(angle / 2), cos(angle / 2)
      if axis == "x" then
        return new_vector("quat", s, 0, 0, c)
      elseif axis == "y" then
        return new_vector("quat", 0, s, 0, c)
      end
      return new_vector("quat", 0, 0, s, c)
    end
  end

  local function url(...)
    local count = select("#", ...)
    for i = 1, count do
      if type((select(i, ...))) ~= "string" then
        error("msg.url expects strings", 0)
      end
    end
    if count == 0 then
      return new_value("url", "")
    end
    if count == 1 then
      return new_value("url", (...))
    end
    if count == 3 then
      local socket, path, fragment = ...
      local text = path
      if socket ~= "" then
        text = socket .. ":" .. text
      end
      if fragment ~= "" then
        text = text .. "#" .. fragment
      end
      return new_value("url", text)
    end
    error("msg.url takes no argument, one string or three strings", 0)
  end

  local function namespace(name, members)
    return setmetatable(members, {
      __index = function(_, key)
        unavailable(name .. "." .. raw_tostring(key))
      end,
    })
  end

  local resource_members = {}
  for _, kind in ipairs(resource_kinds) do
    resource_members[kind] = function(path)
      if path ~= nil and type(path) ~= "string" then
        error("resource." .. kind .. " expects a path string", 0)
      end
      return new_value("resource", path, kind)
    end
  end

  G.vmath = namespace("vmath", {
    vector3 = vector_constructor("vector3", { 0, 0, 0 }),
    vector4 = vector_constructor("vector4", { 0, 0, 0, 0 }),
    quat = vector_constructor("quat", { 0, 0, 0, 1 }),
    quat_rotation_x = rotation("x"),
    quat_rotation_y = rotation("y"),
    quat_rotation_z = rotation("z"),
  })
  G.msg = namespace("msg", { url = url })
  G.resource = namespace("resource", resource_members)
  G.hash = function(value)
    if type(value) ~= "string" then
      error("hash expects a string", 0)
    end
    return new_value("hash", value)
  end

  setmetatable(G, {
    __index = function(_, key)
      unavailable(raw_tostring(key))
    end,
  })

  return function(value)
    return records[value]
  end, require
end
`;

// Turns the captured properties table into one plain record per requested
// name, or names the first value that is not a Defold property type.
export const PROPERTY_DEFAULT_SERIALIZER = `
local serializer_globals, type, find, rawget, ipairs = _G, type, string.find, rawget, ipairs
local function serialize_properties(record_of, names)
  local properties = rawget(serializer_globals, "____properties")
  if type(properties) ~= "table" or record_of(properties) ~= nil then
    return { error = "the script assigned no table to ____properties" }
  end
  local function refuse(name, reason)
    return nil, { error = name .. " " .. reason, name = name }
  end
  local function text(name, value)
    if find(value, "\\0", 1, true) then
      return refuse(name, "contains a NUL character")
    end
    return value
  end
  local function serialize(name, value)
    local value_type = type(value)
    if value_type == "number" then
      if value ~= value then
        return refuse(name, "is NaN, which is not a property value")
      end
      return { kind = "number", value = value }
    end
    if value_type == "boolean" then
      return { kind = "boolean", value = value }
    end
    if value_type == "string" then
      local checked, failure = text(name, value)
      if checked == nil then
        return nil, failure
      end
      return { kind = "string", value = checked }
    end
    local record = value_type == "table" and record_of(value) or nil
    if record == nil then
      if value == nil then
        return refuse(name, "has no value")
      end
      return refuse(name, "is a " .. value_type .. ", which is not a property type")
    end
    if record.kind == "resource" then
      if record.value == nil then
        return { kind = "resource", resource = record.resource }
      end
      local path, failure = text(name, record.value)
      if path == nil then
        return nil, failure
      end
      return { kind = "resource", resource = record.resource, path = path }
    end
    if record.kind == "hash" or record.kind == "url" then
      local checked, failure = text(name, record.value)
      if checked == nil then
        return nil, failure
      end
      return { kind = record.kind, value = checked }
    end
    local components = { record[1], record[2], record[3], record[4] }
    return { kind = record.kind, value = components }
  end

  local values = {}
  for index, name in ipairs(names) do
    local value, failure = serialize(name, properties[name])
    if value == nil then
      return failure
    end
    values[index] = value
  end
  return { values = values }
end
`;

export const PROPERTY_DEFAULT_EVALUATION = `${PROPERTY_DEFAULT_PRELUDE}
${PROPERTY_DEFAULT_SERIALIZER}
local pcall, error = pcall, error
return function(chunks, resource_kinds, entry, names)
  local ok, result = pcall(function()
    local record_of, require = install_sandbox(chunks, resource_kinds)
    require(entry)
    return serialize_properties(record_of, names)
  end)
  if ok then
    return result
  end
  if type(result) == "userdata" then
    error(result, 0)
  end
  if type(result) == "table" and type(rawget(result, "message")) == "string" then
    return { error = rawget(result, "message") }
  end
  if type(result) ~= "string" then
    return { error = "the script raised a " .. type(result) .. " as an error" }
  end
  return { error = result }
end
`;
