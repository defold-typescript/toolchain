/** @noResolution */
declare module 'proto.proto' {
	/**
	 * Download Defold annotations from here: https://github.com/astrochili/defold-annotations/releases/
	 * Logger interface
	 */
	interface proto_logger {
		trace: (logger: proto_logger, message: string, data: unknown | undefined) => void;
		debug: (logger: proto_logger, message: string, data: unknown | undefined) => void;
		info: (logger: proto_logger, message: string, data: unknown | undefined) => void;
		warn: (logger: proto_logger, message: string, data: unknown | undefined) => void;
		error: (logger: proto_logger, message: string, data: unknown | undefined) => void;
	}
	interface Lexer {
		__call(): void;
		test(): void;
		expected(): void;
		pos2loc(): void;
		error(): void;
		opterror(): void;
		whitespace(): void;
		comment(): void;
		line_end(): void;
		eof(): void;
		keyword(): void;
		ident(): void;
		full_ident(): void;
		integer(): void;
		number(): void;
		quote(): void;
		structure(): void;
		array(): void;
		constant(): void;
		option_name(): void;
		type_name(): void;
		__call(): void;
		test(): void;
		expected(): void;
		pos2loc(): void;
		error(): void;
		opterror(): void;
		whitespace(): void;
		comment(): void;
		line_end(): void;
		eof(): void;
		keyword(): void;
		ident(): void;
		full_ident(): void;
		integer(): void;
		number(): void;
		quote(): void;
		table(): void;
		constant(): void;
		option_name(): void;
		type_name(): void;
	}
	interface Parser {
		error(): void;
		addpath(): void;
		parsefile(): void;
		parse(): void;
		resolve(): void;
		compile(): void;
		compilefile(): void;
		load(): void;
		loadfile(): void;
		error(): void;
		addpath(): void;
		parsefile(): void;
		parse(): void;
		resolve(): void;
		compile(): void;
		compilefile(): void;
		load(): void;
		loadfile(): void;
	}
	interface toplevel {
		package(): void;
		"import"(): void;
		message(): void;
		enum(): void;
		option(): void;
		extend(): void;
		service(): void;
		package(): void;
		"import"(): void;
		message(): void;
		enum(): void;
		option(): void;
		extend(): void;
		service(): void;
	}
	interface msg_body {
		message(): void;
		enum(): void;
		extend(): void;
		extensions(): void;
		reserved(): void;
		oneof(): void;
		option(): void;
		message(): void;
		enum(): void;
		extend(): void;
		extensions(): void;
		reserved(): void;
		oneof(): void;
	}
	interface svr_body {
		rpc(): void;
		option(): void;
		rpc(): void;
	}
	interface proto {
	}
	/**
	 * Loads proto files from the specified paths in the game.project
	 * Under the "proto.proto_paths" key in the game.project
	 */
	export function init(this: void, proto_config_or_path: LuaTable | string): void;
	/**
	 * Set the logger instance
	 */
	export function set_logger(this: void, logger_instance?: proto_logger | undefined): void;
	/**
	 * Create a new instance of the proto message
	 */
	export function get(this: void, proto_type: string): LuaTable;
	/**
	 * Encode data to bytes
	 */
	export function encode(this: void, proto_type: string, data: LuaTable): string;
	/**
	 * Decode bytes to lua table
	 */
	export function decode(this: void, proto_type: string, bytes?: string | undefined): LuaTable;
	/**
	 * Verify data to match the proto_type. Return data with all default values according to proto_type, remove extra fields
	 */
	export function verify(this: void, proto_type: string, data: LuaTable): LuaTable;
	/**
	 * Update data to match the proto_type.
	 * - All default values will be added to the data if they are not present
	 * - All extra fields will be removed from the data
	 */
	export function update_with_default_messages(this: void, proto_type: string, data: LuaTable): void;
}
