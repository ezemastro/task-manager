const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.NODE_ENV === 'production'
  ? '/app/data/database.sqlite'
  : path.join(__dirname, '..', 'database.sqlite');

const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row);
    });
  });
}

async function main() {
  const candidateWhere = `
    p.status = 'completed'
    AND p.completed_date IS NULL
    AND a.entity_type = 'project'
    AND json_extract(a.details, '$.status') = 'completed'
  `;

  await run('BEGIN IMMEDIATE TRANSACTION');
  try {
    const before = await get(`
      SELECT COUNT(DISTINCT p.id) AS count
      FROM projects p
      JOIN audit_logs a ON a.entity_id = p.id
      WHERE ${candidateWhere}
    `);

    await run(`
      UPDATE projects
      SET completed_date = (
        SELECT MIN(a.created_at)
        FROM audit_logs a
        WHERE a.entity_type = 'project'
          AND a.entity_id = projects.id
          AND json_extract(a.details, '$.status') = 'completed'
      )
      WHERE status = 'completed'
        AND completed_date IS NULL
        AND EXISTS (
          SELECT 1
          FROM audit_logs a
          WHERE a.entity_type = 'project'
            AND a.entity_id = projects.id
            AND json_extract(a.details, '$.status') = 'completed'
        )
    `);

    const after = await get(`
      SELECT COUNT(*) AS count
      FROM projects
      WHERE status = 'completed' AND completed_date IS NOT NULL
    `);

    await run('COMMIT');
    console.log(JSON.stringify({ candidate_count: before.count, updated_count: before.count, completed_with_date: after.count }));
  } catch (error) {
    await run('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
