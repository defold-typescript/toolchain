local http_mod = require("asobi.http")

local M = {}

function M.get_friends(client, status, limit, callback)
	local query = {limit = limit or 50}
	if status then query.status = status end
	http_mod.get(client, "/api/v1/friends", query, callback)
end

function M.add_friend(client, friend_id, callback)
	http_mod.post(client, "/api/v1/friends", {friend_id = friend_id}, callback)
end

function M.accept_friend(client, friend_id, callback)
	http_mod.put(client, "/api/v1/friends/" .. friend_id, {status = "accepted"}, callback)
end

function M.block_friend(client, friend_id, callback)
	http_mod.put(client, "/api/v1/friends/" .. friend_id, {status = "blocked"}, callback)
end

function M.remove_friend(client, friend_id, callback)
	http_mod.delete(client, "/api/v1/friends/" .. friend_id, callback)
end

function M.create_group(client, name, description, max_members, open, callback)
	http_mod.post(client, "/api/v1/groups", {
		name = name,
		description = description or "",
		max_members = max_members or 50,
		open = open or false,
	}, callback)
end

function M.get_group(client, group_id, callback)
	http_mod.get(client, "/api/v1/groups/" .. group_id, nil, callback)
end

function M.join_group(client, group_id, callback)
	http_mod.post(client, "/api/v1/groups/" .. group_id .. "/join", {}, callback)
end

function M.leave_group(client, group_id, callback)
	http_mod.post(client, "/api/v1/groups/" .. group_id .. "/leave", {}, callback)
end

function M.update_friend(client, friend_id, status, callback)
	http_mod.put(client, "/api/v1/friends/" .. friend_id, {status = status}, callback)
end

function M.update_group(client, group_id, fields, callback)
	http_mod.put(client, "/api/v1/groups/" .. group_id, fields, callback)
end

function M.get_group_members(client, group_id, callback)
	http_mod.get(client, "/api/v1/groups/" .. group_id .. "/members", nil, callback)
end

function M.update_member_role(client, group_id, player_id, role, callback)
	http_mod.put(client, "/api/v1/groups/" .. group_id .. "/members/" .. player_id .. "/role",
		{role = role}, callback)
end

function M.remove_member(client, group_id, player_id, callback)
	http_mod.delete(client, "/api/v1/groups/" .. group_id .. "/members/" .. player_id, callback)
end

function M.get_chat_history(client, channel_id, limit, callback)
	local query = nil
	if limit then query = {limit = limit} end
	http_mod.get(client, "/api/v1/chat/" .. channel_id .. "/history", query, callback)
end

return M
