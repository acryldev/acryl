/** Validate a prefix before using it as part of a SQL identifier. */
export function validateSchemaPrefix(prefix: string): void {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(prefix)) {
		throw new Error(`Invalid SQL schema prefix ${JSON.stringify(prefix)}`);
	}
	if (prefix.toLowerCase().startsWith("sqlite_")) {
		throw new Error(`SQL schema prefix ${JSON.stringify(prefix)} is reserved`);
	}
}
