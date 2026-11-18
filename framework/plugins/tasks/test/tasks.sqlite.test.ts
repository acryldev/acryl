// The same tests, against the SQLite store: the backend must not change what the tasks plugin does.
process.env.TASKS_TEST_STORE = 'sqlite'
await import('./tasks.test.ts')
