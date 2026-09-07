// Fix FK defects that block user management:
// 1. users.account_email had a FK to accounts(email), which made it
//    impossible to invite a user whose email has no account yet (the invite
//    flow relies on the user row existing before the account is created).
// 2. audit_logs.user_id was NOT NULL with a FK ON DELETE SET NULL — a
//    contradiction that made deleting any user with audit activity fail.
// Both tables are recreated with the corrected schema; data is preserved.

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
  await run('PRAGMA foreign_keys=OFF');
  await run('BEGIN IMMEDIATE TRANSACTION');
  try {
    // --- Recreate users without the accounts(email) FK ---
    await run(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        account_email TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        UNIQUE(organization_id, account_email)
      )
    `);
    await run(`
      INSERT INTO users_new (id, organization_id, account_email, name, role, created_at)
      SELECT id, organization_id, account_email, name, role, created_at FROM users
    `);
    await run('DROP TABLE users');
    await run('ALTER TABLE users_new RENAME TO users');

    // --- Recreate audit_logs with a nullable user_id (SET NULL now works) ---
    await run(`
      CREATE TABLE audit_logs_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        user_id INTEGER,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER,
        project_name TEXT,
        details TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await run(`
      INSERT INTO audit_logs_new (id, organization_id, user_id, action, entity_type, entity_id, project_name, details, ip_address, created_at)
      SELECT id, organization_id, user_id, action, entity_type, entity_id, project_name, details, ip_address, created_at FROM audit_logs
    `);
    await run('DROP TABLE audit_logs');
    await run('ALTER TABLE audit_logs_new RENAME TO audit_logs');

    await run(`
      CREATE INDEX idx_audit_logs_organization ON audit_logs(organization_id, created_at DESC)
    `);
    await run(`
      CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC)
    `);
    await run(`
      CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id)
    `);

    await run('COMMIT');

    const counts = await get(`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM audit_logs) AS audit_logs
    `);
    console.log(JSON.stringify({
      users_recreated: true,
      audit_logs_recreated: true,
      users_count: counts.users,
      audit_logs_count: counts.audit_logs,
    }));
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