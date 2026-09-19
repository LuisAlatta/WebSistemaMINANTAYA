export function executeAtomically(
  db: D1Database,
  statements: D1PreparedStatement[],
): Promise<D1Result<unknown>[]> {
  return db.batch(statements);
}
