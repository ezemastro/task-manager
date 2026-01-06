const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.NODE_ENV === 'production'
  ? '/app/data/database.sqlite'
  : path.join(__dirname, '..', 'database.sqlite');

console.log('🔄 Iniciando migración: Agregar verificación de email y reset de contraseña');
console.log('📁 Ruta de base de datos:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error al conectar a la base de datos:', err);
    process.exit(1);
  }
  console.log('✅ Conectado a la base de datos');
});

db.serialize(() => {
  // Verificar si las columnas ya existen
  db.all("PRAGMA table_info(accounts)", [], (err, columns) => {
    if (err) {
      console.error('❌ Error al verificar columnas:', err);
      db.close();
      process.exit(1);
    }

    const hasEmailVerified = columns.some(col => col.name === 'email_verified');
    const hasVerificationToken = columns.some(col => col.name === 'verification_token');

    if (hasEmailVerified && hasVerificationToken) {
      console.log('✅ Las columnas ya existen en accounts');
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
        CREATE TABLE accounts_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          email_verified INTEGER DEFAULT 0,
          verification_token TEXT,
          verification_token_expires DATETIME,
          reset_token TEXT,
          reset_token_expires DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          console.error('❌ Error al crear tabla temporal:', err);
          db.run('ROLLBACK;');
          db.close();
          process.exit(1);
        }
        console.log('✅ Tabla temporal creada');

        // Copiar datos existentes (marcar todos los usuarios existentes como verificados)
        db.run(`
          INSERT INTO accounts_new 
          (id, email, password_hash, name, email_verified, created_at, updated_at)
          SELECT id, email, password_hash, name, 1, created_at, updated_at
          FROM accounts
        `, (err) => {
          if (err) {
            console.error('❌ Error al copiar datos:', err);
            db.run('ROLLBACK;');
            db.close();
            process.exit(1);
          }
          console.log('✅ Datos copiados (usuarios existentes marcados como verificados)');

          // Eliminar tabla antigua
          db.run('DROP TABLE accounts', (err) => {
            if (err) {
              console.error('❌ Error al eliminar tabla antigua:', err);
              db.run('ROLLBACK;');
              db.close();
              process.exit(1);
            }
            console.log('✅ Tabla antigua eliminada');

            // Renombrar tabla nueva
            db.run('ALTER TABLE accounts_new RENAME TO accounts', (err) => {
              if (err) {
                console.error('❌ Error al renombrar tabla:', err);
                db.run('ROLLBACK;');
                db.close();
                process.exit(1);
              }
              console.log('✅ Tabla renombrada');

              // Commit de la transacción
              db.run('COMMIT;', (err) => {
                if (err) {
                  console.error('❌ Error al hacer commit:', err);
                  db.run('ROLLBACK;');
                  db.close();
                  process.exit(1);
                }

                console.log('✅ Migración completada exitosamente');
                console.log('📊 Columnas agregadas:');
                console.log('   - email_verified (INTEGER)');
                console.log('   - verification_token (TEXT)');
                console.log('   - verification_token_expires (DATETIME)');
                console.log('   - reset_token (TEXT)');
                console.log('   - reset_token_expires (DATETIME)');
                
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
