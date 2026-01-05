const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.NODE_ENV === 'production'
  ? '/app/data/database.sqlite'
  : path.join(__dirname, '..', 'database.sqlite');

console.log('🔄 Iniciando migración: Agregar project_name a audit_logs');
console.log('📁 Ruta de base de datos:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error al conectar a la base de datos:', err);
    process.exit(1);
  }
  console.log('✅ Conectado a la base de datos');
});

db.serialize(() => {
  // Verificar si la columna ya existe
  db.all("PRAGMA table_info(audit_logs)", [], (err, columns) => {
    if (err) {
      console.error('❌ Error al verificar columnas:', err);
      db.close();
      process.exit(1);
    }

    const hasProjectName = columns.some(col => col.name === 'project_name');

    if (hasProjectName) {
      console.log('✅ La columna project_name ya existe en audit_logs');
      console.log('📋 Migración ya ejecutada previamente');
      db.close();
      return;
    }

    console.log('📋 Iniciando migración...');

    db.run('BEGIN TRANSACTION;', (err) => {
      if (err) {
        console.error('❌ Error al iniciar transacción:', err);
        db.close();
        process.exit(1);
      }

      // Crear tabla temporal con la nueva estructura
      db.run(`
        CREATE TABLE audit_logs_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          organization_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
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
      `, (err) => {
        if (err) {
          console.error('❌ Error al crear tabla temporal:', err);
          db.run('ROLLBACK;');
          db.close();
          process.exit(1);
        }
        console.log('✅ Tabla temporal creada');

        // Copiar datos existentes
        db.run(`
          INSERT INTO audit_logs_new 
          (id, organization_id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
          SELECT id, organization_id, user_id, action, entity_type, entity_id, details, ip_address, created_at
          FROM audit_logs
        `, (err) => {
          if (err) {
            console.error('❌ Error al copiar datos:', err);
            db.run('ROLLBACK;');
            db.close();
            process.exit(1);
          }
          console.log('✅ Datos copiados a tabla temporal');

          // Eliminar tabla antigua
          db.run('DROP TABLE audit_logs', (err) => {
            if (err) {
              console.error('❌ Error al eliminar tabla antigua:', err);
              db.run('ROLLBACK;');
              db.close();
              process.exit(1);
            }
            console.log('✅ Tabla antigua eliminada');

            // Renombrar tabla nueva
            db.run('ALTER TABLE audit_logs_new RENAME TO audit_logs', (err) => {
              if (err) {
                console.error('❌ Error al renombrar tabla:', err);
                db.run('ROLLBACK;');
                db.close();
                process.exit(1);
              }
              console.log('✅ Tabla renombrada');

              // Recrear índices
              db.run(`
                CREATE INDEX IF NOT EXISTS idx_audit_logs_organization 
                ON audit_logs(organization_id, created_at DESC)
              `, (err) => {
                if (err) {
                  console.error('❌ Error al crear índice de organización:', err);
                  db.run('ROLLBACK;');
                  db.close();
                  process.exit(1);
                }

                db.run(`
                  CREATE INDEX IF NOT EXISTS idx_audit_logs_user 
                  ON audit_logs(user_id, created_at DESC)
                `, (err) => {
                  if (err) {
                    console.error('❌ Error al crear índice de usuario:', err);
                    db.run('ROLLBACK;');
                    db.close();
                    process.exit(1);
                  }

                  db.run(`
                    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity 
                    ON audit_logs(entity_type, entity_id)
                  `, (err) => {
                    if (err) {
                      console.error('❌ Error al crear índice de entidad:', err);
                      db.run('ROLLBACK;');
                      db.close();
                      process.exit(1);
                    }

                    console.log('✅ Índices recreados');

                    // Commit de la transacción
                    db.run('COMMIT;', (err) => {
                      if (err) {
                        console.error('❌ Error al hacer commit:', err);
                        db.run('ROLLBACK;');
                        db.close();
                        process.exit(1);
                      }

                      console.log('✅ Migración completada exitosamente');
                      console.log('📊 Columna project_name agregada a audit_logs');
                      
                      db.close((err) => {
                        if (err) {
                          console.error('❌ Error al cerrar base de datos:', err);
                        } else {
                          console.log('✅ Base de datos cerrada');
                        }
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
