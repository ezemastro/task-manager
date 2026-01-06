/**
 * Migración: Marcar usuarios existentes como verificados
 * 
 * NOTA: Esta migración marca todos los usuarios existentes como email_verified=1
 * para que no pierdan acceso con el nuevo sistema de verificación.
 * 
 * Los usuarios que se registren de ahora en adelante SÍ necesitarán verificar su email.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.NODE_ENV === 'production'
  ? '/app/data/database.sqlite'
  : path.join(__dirname, '..', 'database.sqlite');

function runMigration() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error al conectar a la base de datos:', err);
        reject(err);
        return;
      }

      console.log('📊 Conectado a la base de datos');

      db.serialize(() => {
        // Verificar cuántos usuarios hay sin verificar
        db.get(
          'SELECT COUNT(*) as count FROM accounts WHERE email_verified = 0',
          (err, row) => {
            if (err) {
              console.error('Error al contar usuarios:', err);
              db.close();
              reject(err);
              return;
            }

            const unverifiedCount = row.count;
            console.log(`\n📋 Usuarios sin verificar: ${unverifiedCount}`);

            if (unverifiedCount === 0) {
              console.log('✅ Todos los usuarios ya están verificados');
              db.close();
              resolve();
              return;
            }

            // Marcar todos los usuarios existentes como verificados
            db.run(
              `UPDATE accounts 
               SET email_verified = 1,
                   verification_token = NULL,
                   verification_token_expires = NULL
               WHERE email_verified = 0`,
              (err) => {
                if (err) {
                  console.error('❌ Error al actualizar usuarios:', err);
                  db.close();
                  reject(err);
                  return;
                }

                console.log(`✅ ${unverifiedCount} usuario(s) marcados como verificados`);
                console.log('\n🎉 Migración completada exitosamente');
                console.log('   Los usuarios existentes pueden seguir usando el sistema');
                console.log('   Los nuevos usuarios SÍ necesitarán verificar su email\n');

                db.close((err) => {
                  if (err) {
                    console.error('Error al cerrar la base de datos:', err);
                    reject(err);
                  } else {
                    resolve();
                  }
                });
              }
            );
          }
        );
      });
    });
  });
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = runMigration;
