/**
 * Migración: Eliminar columna user_name de audit_logs
 * 
 * Esta migración elimina la columna user_name de la tabla audit_logs
 * ya que ahora obtenemos el nombre del usuario mediante JOIN con la tabla users
 * 
 * Fecha: 2025-12-04
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Determinar la ruta de la base de datos
const dataDir = process.env.DB_PATH || (fs.existsSync('/app/data') ? '/app/data' : '.');
const dbPath = path.join(dataDir, 'database.sqlite');

console.log('🔄 Iniciando migración: Eliminar user_name de audit_logs');
console.log('📁 Ruta de base de datos:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error al conectar con la base de datos:', err);
    process.exit(1);
  }
  console.log('✅ Conectado a la base de datos');
});

db.serialize(() => {
  // Verificar si la columna user_name existe
  db.all("PRAGMA table_info(audit_logs)", [], (err, columns) => {
    if (err) {
      console.error('❌ Error al obtener información de la tabla:', err);
      db.close();
      process.exit(1);
    }

    const hasUserName = columns.some(col => col.name === 'user_name');

    if (!hasUserName) {
      console.log('ℹ️  La columna user_name no existe, la migración ya fue aplicada o no es necesaria');
      db.close();
      return;
    }

    console.log('📋 Columna user_name encontrada, procediendo con la migración...');

    // SQLite no soporta DROP COLUMN directamente, necesitamos recrear la tabla
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        console.error('❌ Error al iniciar transacción:', err);
        db.close();
        process.exit(1);
      }

      // 1. Crear tabla temporal sin user_name
      db.run(`
        CREATE TABLE audit_logs_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          organization_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id INTEGER,
          details TEXT,
          ip_address TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `, (err) => {
        if (err) {
          console.error('❌ Error al crear tabla temporal:', err);
          db.run('ROLLBACK');
          db.close();
          process.exit(1);
        }

        console.log('✅ Tabla temporal creada');

        // 2. Copiar datos (sin user_name)
        db.run(`
          INSERT INTO audit_logs_new 
          (id, organization_id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
          SELECT id, organization_id, user_id, action, entity_type, entity_id, details, ip_address, created_at
          FROM audit_logs
        `, (err) => {
          if (err) {
            console.error('❌ Error al copiar datos:', err);
            db.run('ROLLBACK');
            db.close();
            process.exit(1);
          }

          console.log('✅ Datos copiados a la tabla temporal');

          // 3. Eliminar tabla original
          db.run('DROP TABLE audit_logs', (err) => {
            if (err) {
              console.error('❌ Error al eliminar tabla original:', err);
              db.run('ROLLBACK');
              db.close();
              process.exit(1);
            }

            console.log('✅ Tabla original eliminada');

            // 4. Renombrar tabla temporal
            db.run('ALTER TABLE audit_logs_new RENAME TO audit_logs', (err) => {
              if (err) {
                console.error('❌ Error al renombrar tabla:', err);
                db.run('ROLLBACK');
                db.close();
                process.exit(1);
              }

              console.log('✅ Tabla renombrada');

              // 5. Recrear índices
              db.run(`
                CREATE INDEX IF NOT EXISTS idx_audit_logs_organization 
                ON audit_logs(organization_id, created_at DESC)
              `, (err) => {
                if (err) {
                  console.error('❌ Error al crear índice de organización:', err);
                  db.run('ROLLBACK');
                  db.close();
                  process.exit(1);
                }

                db.run(`
                  CREATE INDEX IF NOT EXISTS idx_audit_logs_user 
                  ON audit_logs(user_id, created_at DESC)
                `, (err) => {
                  if (err) {
                    console.error('❌ Error al crear índice de usuario:', err);
                    db.run('ROLLBACK');
                    db.close();
                    process.exit(1);
                  }

                  db.run(`
                    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity 
                    ON audit_logs(entity_type, entity_id)
                  `, (err) => {
                    if (err) {
                      console.error('❌ Error al crear índice de entidad:', err);
                      db.run('ROLLBACK');
                      db.close();
                      process.exit(1);
                    }

                    console.log('✅ Índices recreados');

                    // Confirmar transacción
                    db.run('COMMIT', (err) => {
                      if (err) {
                        console.error('❌ Error al confirmar transacción:', err);
                        db.run('ROLLBACK');
                        db.close();
                        process.exit(1);
                      }

                      console.log('✅ Migración completada exitosamente');
                      console.log('📊 La columna user_name ha sido eliminada de audit_logs');
                      console.log('📝 Los nombres de usuario ahora se obtienen mediante JOIN');

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
          });
        });
      });
    });
  });
});
