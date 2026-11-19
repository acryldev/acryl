/** Values supported by the portable SQL drivers. */
export type SqlValue = null | number | bigint | string | Uint8Array;

/**
 * Asynchronous SQL operations shared by a database and its transaction handles.
 *
 * `exec` runs SQL text without bindings and may contain several statements. `run`, `get`, and `all`
 * execute one statement with positional bindings. Adapters may cache prepared statements by SQL text,
 * so callers pass values as bindings instead of interpolating them. `run` resolves the number of rows
 * the statement changed.
 */
export interface DbExecutor {
	exec(sql: string): Promise<void>;
	run(sql: string, ...params: SqlValue[]): Promise<{ readonly changes: number }>;
	get<T extends object>(sql: string, ...params: SqlValue[]): Promise<T | undefined>;
	all<T extends object>(sql: string, ...params: SqlValue[]): Promise<T[]>;
}

/**
 * Minimal portable SQL database facade.
 *
 * All operations are asynchronous so adapters may execute outside the caller's runtime.
 *
 * `transaction` passes the callback a transaction handle. All work in the transaction
 * must use that handle; the handle is invalid after the callback settles. Adapters must
 * queue unrelated operations and other transactions until the transaction finishes. The
 * returned promise settles after commit or rollback. Calling the database itself (including
 * `transaction`) from inside a callback therefore waits for that transaction and
 * never settles.
 *
 * When the callback rejects, the adapter must roll the transaction back before rejecting
 * with that same error. If rollback fails, it must reject with a different error (for
 * example an `AggregateError`) so callers cannot mistake the callback error for a
 * guaranteed rollback.
 *
 * Closing is the adapter's: the plugin that opened a database closes it, so the facade an
 * app receives has no `close`.
 */
export interface Db extends DbExecutor {
	transaction<T>(callback: (transaction: DbExecutor) => Promise<T>): Promise<T>;
}
