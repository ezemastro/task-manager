/**
 * Migración: Sistema de autenticación global
 * 
 * Migra de autenticación por organización a autenticación global
 * - Crea tabla accounts con email/password global
 * - Crea tabla organization_members para membresías
 * - Actualiza tabla users para referenciar accounts por email
 * - Migra datos existentes
 * 
 * Fecha: 2026-01-05
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = process.env.DB_PATH || (fs.existsSync('/app/data') ? '/app/data' : '.');
const dbPath = path.join(dataDir, 'database.sqlite');

console.log('🔄 Iniciando migración: Sistema de autenticación global');
console.log('📁 Ruta de base de datos:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error al conectar con la base de datos:', err);
    process.exit(1);
  }
  console.log('✅ Conectado a la base de datos');
});

db.serialize(() => {
  // Verificar si ya se migró
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'", [], (err, row) => {
    if (err) {
      console.error('❌ Error al verificar migración:', err);
      db.close();
      process.exit(1);
    }

    if (row) {
      console.log('ℹ️  La migración ya fue aplicada');
      db.close();
      return;
    }

    console.log('📋 Iniciando migración...');

    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        console.error('❌ Error al iniciar transacción:', err);
        db.close();
        process.exit(1);
      }

      // 1. Crear tabla accounts
      db.run(`
        CREATE TABLE accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          console.error('❌ Error al crear tabla accounts:', err);
          db.run('ROLLBACK');
          db.close();
          process.exit(1);
        }
        console.log('✅ Tabla accounts creada');

        // 2. Crear tabla organization_members
        db.run(`
          CREATE TABLE organization_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            organization_id INTEGER NOT NULL,
            role TEXT DEFAULT 'member',
            scopes TEXT DEFAULT '[]',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
            FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
            UNIQUE(account_id, organization_id)
          )
        `, (err) => {
          if (err) {
            console.error('❌ Error al crear tabla organization_members:', err);
            db.run('ROLLBACK');
            db.close();
            process.exit(1);
          }
          console.log('✅ Tabla organization_members creada');

          // 3. Migrar usuarios existentes a accounts
          db.all(`SELECT DISTINCT email, name, password_hash FROM users WHERE email IS NOT NULL AND password_hash IS NOT NULL`, [], (err, users) => {
            if (err) {
              console.error('❌ Error al leer usuarios:', err);
              db.run('ROLLBACK');
              db.close();
              process.exit(1);
            }

            if (users.length === 0) {
              console.log('ℹ️  No hay usuarios con email para migrar');
              continueWithUserTableMigration();
              return;
            }

            console.log(`📊 Migrando ${users.length} cuentas de usuario...`);

            let processedAccounts = 0;
            const accountStmt = db.prepare('INSERT INTO accounts (email, password_hash, name) VALUES (?, ?, ?)');

            users.forEach((user) => {
              accountStmt.run([user.email, user.password_hash, user.name], (err) => {
                if (err && !err.message.includes('UNIQUE constraint')) {
                  console.error('❌ Error al migrar cuenta:', err);
                }
                processedAccounts++;
                
                if (processedAccounts === users.length) {
                  accountStmt.finalize();
                  console.log(`✅ ${users.length} cuentas migradas a accounts`);
                  createOrganizationMembers();
                }
              });
            });
          });

          function createOrganizationMembers() {
            // 4. Crear membresías en organization_members
            db.all(`
              SELECT u.email, u.organization_id, u.role, u.scopes, a.id as account_id 
              FROM users u 
              INNER JOIN accounts a ON u.email = a.email 
              WHERE u.email IS NOT NULL
            `, [], (err, memberships) => {
              if (err) {
                console.error('❌ Error al leer membresías:', err);
                db.run('ROLLBACK');
                db.close();
                process.exit(1);
              }

              if (memberships.length === 0) {
                console.log('ℹ️  No hay membresías para crear');
                continueWithUserTableMigration();
                return;
              }

              console.log(`📊 Creando ${memberships.length} membresías...`);

              let processedMembers = 0;
              const memberStmt = db.prepare('INSERT OR IGNORE INTO organization_members (account_id, organization_id, role, scopes) VALUES (?, ?, ?, ?)');

              memberships.forEach((member) => {
                memberStmt.run([member.account_id, member.organization_id, member.role || 'member', member.scopes || '[]'], (err) => {
                  if (err) {
                    console.error('⚠️  Error al crear membresía:', err);
                  }
                  processedMembers++;
                  
                  if (processedMembers === memberships.length) {
                    memberStmt.finalize();
                    console.log(`✅ ${memberships.length} membresías creadas`);
                    continueWithUserTableMigration();
                  }
                });
              });
            });
          }

          function continueWithUserTableMigration() {
            // 5. Crear nueva tabla users
            db.run(`
              CREATE TABLE users_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                organization_id INTEGER NOT NULL,
                account_email TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
                FOREIGN KEY (account_email) REFERENCES accounts(email) ON DELETE CASCADE,
                UNIQUE(organization_id, account_email)
              )
            `, (err) => {
              if (err) {
                console.error('❌ Error al crear tabla users_new:', err);
                db.run('ROLLBACK');
                db.close();
                process.exit(1);
              }
              console.log('✅ Tabla users_new creada');

              // 6. Migrar datos de users a users_new
              db.run(`
                INSERT INTO users_new (id, organization_id, account_email, name, role, created_at)
                SELECT id, organization_id, 
                       COALESCE(email, 'user' || id || '@local.temp') as account_email,
                       name, role, created_at
                FROM users
              `, (err) => {
                if (err) {
                  console.error('❌ Error al migrar datos de users:', err);
                  db.run('ROLLBACK');
                  db.close();
                  process.exit(1);
                }
                console.log('✅ Datos migrados a users_new');

                // 7. Eliminar tabla users antigua
                db.run('DROP TABLE users', (err) => {
                  if (err) {
                    console.error('❌ Error al eliminar tabla users:', err);
                    db.run('ROLLBACK');
                    db.close();
                    process.exit(1);
                  }
                  console.log('✅ Tabla users antigua eliminada');

                  // 8. Renombrar users_new a users
                  db.run('ALTER TABLE users_new RENAME TO users', (err) => {
                    if (err) {
                      console.error('❌ Error al renombrar tabla:', err);
                      db.run('ROLLBACK');
                      db.close();
                      process.exit(1);
                    }
                    console.log('✅ Tabla renombrada a users');

                    // Confirmar transacción
                    db.run('COMMIT', (err) => {
                      if (err) {
                        console.error('❌ Error al confirmar transacción:', err);
                        db.run('ROLLBACK');
                        db.close();
                        process.exit(1);
                      }

                      console.log('✅ Migración completada exitosamente');
                      console.log('📊 Sistema de autenticación global activado');
                      console.log('👥 Los usuarios ahora pueden pertenecer a múltiples organizaciones');

                      db.close((err) => {
                        if (err) {
                          console.error('❌ Error al cerrar la base de datos:', err);
                          process.exit(1);
                        }
                        console.log('✅ Base de datos cerrada');
                        process.exit(0);
                      });
                    });
                  });
                });
              });
            });
          }
        });
      });
    });
  });
});
