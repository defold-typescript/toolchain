/** @noSelfInFile **/

/**
 * Counts events and reports them in batches.
 * @see {@link https://github.com/example/fixture-fork|Github Source}
 * @noResolution
 */
declare module 'tally.tally' {
	export function push(...args: ((...args: any[]) => unknown)[]): void;
	export function flush(options?: {
		verbose?: boolean,
		pattern?: string,
	}): void;
}
