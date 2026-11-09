local http_mod = require("asobi.http")

local M = {}

function M.get_top(client, leaderboard_id, limit, callback)
	http_mod.get(client, "/api/v1/leaderboards/" .. leaderboard_id,
		{limit = limit or 100}, callback)
end

function M.get_around_player(client, leaderboard_id, player_id, range_size, callback)
	http_mod.get(client, "/api/v1/leaderboards/" .. leaderboard_id .. "/around/" .. player_id,
		{range = range_size or 5}, callback)
end

function M.get_around_self(client, leaderboard_id, range_size, callback)
	M.get_around_player(client, leaderboard_id, client.player_id, range_size, callback)
end

function M.submit_score(client, leaderboard_id, score, sub_score, callback)
	http_mod.post(client, "/api/v1/leaderboards/" .. leaderboard_id,
		{score = score, sub_score = sub_score or 0}, callback)
end

return M
