const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🔄 Migrando tabla comments para usar user_id...\n');

db.serialize(() => {
  // Verificar si la columna user_id ya existe
  db.all("PRAGMA table_info(comments)", (err, columns) => {
    if (err) {
      console.error('❌ Error al obtener info de comments:', err);
      db.close();
      return;
    }

    const hasUserId = columns.some(col => col.name === 'user_id');

    if (hasUserId) {
      console.log('✓ La columna user_id ya existe en comments');
      db.close();
      return;
    }

    console.log('Recreando tabla comments con user_id...');
    
    // Obtener comentarios existentes
    db.all('SELECT * FROM comments', (err, comments) => {
      if (err) {
        console.error('❌ Error al leer comentarios:', err);
        db.close();
        return;
      }

      // Crear tabla temporal
      db.run(`
        CREATE TABLE comments_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stage_id INTEGER NOT NULL,
          user_id INTEGER,
          content TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (stage_id) REFERENCES stages(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `, (err) => {
        if (err) {
          console.error('❌ Error al crear comments_new:', err);
          db.close();
          return;
        }

        if (comments.length > 0) {
          // Obtener el primer usuario para asignar a comentarios antiguos
          db.get('SELECT id FROM users LIMIT 1', (err, firstUser) => {
            if (err) {
              console.error('❌ Error al obtener usuario:', err);
              db.close();
              return;
            }

            const defaultUserId = firstUser ? firstUser.id : null;

            // Insertar comentarios existentes (sin el campo author)
            const stmt = db.prepare(`
              INSERT INTO comments_new (id, stage_id, user_id, content, created_at)
              VALUES (?, ?, ?, ?, ?)
            `);

            comments.forEach(comment => {
              stmt.run(
                comment.id,
                comment.stage_id,
                defaultUserId,
                comment.content,
                comment.created_at
              );
            });

            stmt.finalize((err) => {
              if (err) {
                console.error('❌ Error al insertar datos:', err);
                db.close();
                return;
              }

              finalizeMigration(comments.length);
            });
          });
        } else {
          finalizeMigration(0);
        }
      });
    });
  });
});

function finalizeMigration(count) {
  // Eliminar tabla vieja y renombrar
  db.run('DROP TABLE comments', (err) => {
    if (err) {
      console.error('❌ Error al eliminar tabla comments:', err);
      db.close();
      return;
    }

    db.run('ALTER TABLE comments_new RENAME TO comments', (err) => {
      if (err) {
        console.error('❌ Error al renombrar tabla:', err);
      } else {
        console.log(`✅ Tabla comments actualizada exitosamente (${count} comentarios migrados)`);
        console.log('   - Campo "author" eliminado');
        console.log('   - Campo "user_id" agregado con referencia a users');
      }
      
      db.close();
    });
  });
}
