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
		__call(patt?: unknown, pos?: unknown): void;
		test(patt?: unknown): void;
		expected(patt?: unknown, name?: unknown): void;
		pos2loc(pos?: unknown): void;
		error(fmt?: unknown): void;
		opterror(opt?: unknown, msg?: unknown): void;
		whitespace(): void;
		comment(): void;
		line_end(opt?: unknown): void;
		eof(): void;
		keyword(kw?: unknown, opt?: unknown): void;
		ident(name?: unknown, opt?: unknown): void;
		full_ident(name?: unknown, opt?: unknown): void;
		integer(opt?: unknown): void;
		number(opt?: unknown): void;
		quote(opt?: unknown): void;
		structure(opt?: unknown): void;
		array(opt?: unknown): void;
		constant(opt?: unknown): void;
		option_name(): void;
		type_name(): void;
		__call(patt?: unknown, pos?: unknown): void;
		test(patt?: unknown): void;
		expected(patt?: unknown, name?: unknown): void;
		pos2loc(pos?: unknown): void;
		error(fmt?: unknown): void;
		opterror(opt?: unknown, msg?: unknown): void;
		whitespace(): void;
		comment(): void;
		line_end(opt?: unknown): void;
		eof(): void;
		keyword(kw?: unknown, opt?: unknown): void;
		ident(name?: unknown, opt?: unknown): void;
		full_ident(name?: unknown, opt?: unknown): void;
		integer(opt?: unknown): void;
		number(opt?: unknown): void;
		quote(opt?: unknown): void;
		table(opt?: unknown): void;
		constant(opt?: unknown): void;
		option_name(): void;
		type_name(): void;
	}
	interface Parser {
		error(msg?: unknown): void;
		addpath(path?: unknown): void;
		parsefile(name?: unknown): void;
		parse(src?: unknown, name?: unknown): void;
		resolve(lex?: unknown, info?: unknown): void;
		compile(s?: unknown, name?: unknown): void;
		compilefile(fn?: unknown): void;
		load(s?: unknown, name?: unknown): void;
		loadfile(fn?: unknown): void;
		error(msg?: unknown): void;
		addpath(path?: unknown): void;
		parsefile(name?: unknown): void;
		parse(src?: unknown, name?: unknown): void;
		resolve(lex?: unknown, info?: unknown): void;
		compile(s?: unknown, name?: unknown): void;
		compilefile(fn?: unknown): void;
		load(s?: unknown, name?: unknown): void;
		loadfile(fn?: unknown): void;
	}
	interface toplevel {
		package(lex?: unknown, info?: unknown): void;
		"import"(lex?: unknown, info?: unknown): void;
		message(lex?: unknown, info?: unknown): void;
		"enum"(lex?: unknown, info?: unknown): void;
		option(lex?: unknown, info?: unknown): void;
		extend(lex?: unknown, info?: unknown): void;
		service(lex?: unknown, info?: unknown): void;
		package(lex?: unknown, info?: unknown): void;
		"import"(lex?: unknown, info?: unknown): void;
		message(lex?: unknown, info?: unknown): void;
		"enum"(lex?: unknown, info?: unknown): void;
		option(lex?: unknown, info?: unknown): void;
		extend(lex?: unknown, info?: unknown): void;
		service(lex?: unknown, info?: unknown): void;
	}
	interface msg_body {
		message(lex?: unknown, info?: unknown): void;
		"enum"(lex?: unknown, info?: unknown): void;
		extend(lex?: unknown, info?: unknown): void;
		extensions(lex?: unknown, info?: unknown): void;
		reserved(lex?: unknown, info?: unknown): void;
		oneof(lex?: unknown, info?: unknown): void;
		option(lex?: unknown, info?: unknown): void;
		message(lex?: unknown, info?: unknown): void;
		"enum"(lex?: unknown, info?: unknown): void;
		extend(lex?: unknown, info?: unknown): void;
		extensions(lex?: unknown, info?: unknown): void;
		reserved(lex?: unknown, info?: unknown): void;
		oneof(lex?: unknown, info?: unknown): void;
	}
	interface svr_body {
		rpc(lex?: unknown, info?: unknown): void;
		option(lex?: unknown, info?: unknown): void;
		rpc(lex?: unknown, info?: unknown): void;
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
