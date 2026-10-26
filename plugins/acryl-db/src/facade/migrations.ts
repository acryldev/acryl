import type { Db } from "./database.ts";
import { validateSchemaPrefix } from "./schema.ts";

export type Migration = {
	readonly version: number;
	readonly statements: readonly string[];
};

type SchemaRow = { readonly version: number | bigint };

/**
 * Apply all pending migrations atomically, tracking their version in the named metadata table.
 *
 * The bookkeeping SQL runs unchanged on SQLite and Postgres: no `STRICT` table, `ON CONFLICT DO NOTHING`
 * instead of `INSERT OR IGNORE`, and the version written as a checked integer rather than a binding,
 * since the two dialects spell placeholders differently.
 */
export async function applyMigrations(
	database: Db,
	migrations: readonly Migration[],
	options: { readonly table: string },
): Promise<void> {
	const { table } = options;
	validateSchemaPrefix(table);
	for (let index = 0; index < migrations.length; index++) {
		if (migrations[index]?.version !== index + 1) {
			throw new Error("Migrations must have contiguous versions starting at 1");
		}
	}

	await database.transaction(async (transaction) => {
		await transaction.exec(`CREATE TABLE IF NOT EXISTS ${table} (
			singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
			version INTEGER NOT NULL CHECK (version >= 0)
		)`);
		await transaction.exec(`INSERT INTO ${table} (singleton, version) VALUES (1, 0) ON CONFLICT DO NOTHING`);
		const row = await transaction.get<SchemaRow>(`SELECT version FROM ${table} WHERE singleton = 1`);
		if (row === undefined) throw new Error("Schema metadata is missing");
		const storedVersion = Number(row.version);
		const currentVersion = migrations.at(-1)?.version ?? 0;
		if (storedVersion > currentVersion) {
			throw new Error(`Schema version ${storedVersion} is newer than supported version ${currentVersion}`);
		}
		for (const migration of migrations) {
			if (migration.version <= storedVersion) continue;
			for (const statement of migration.statements) await transaction.exec(statement);
			await transaction.exec(`UPDATE ${table} SET version = ${String(migration.version)} WHERE singleton = 1`);
		}
	});
}
