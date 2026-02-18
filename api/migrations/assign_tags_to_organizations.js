/**
 * Migración: Asignar tags existentes a organizaciones
 * 
 * NOTA: Esta migración asigna todos los tags existentes sin organization_id
 * a la primera organización disponible o los elimina si no hay organizaciones.
 * 
 * Los tags que se creen de ahora en adelante serán específicos de cada organización.
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

      console.log('📊 Conectado a la base de datos para migración de tags');

      db.serialize(() => {
        // Primero verificar si la columna organization_id ya existe en tags
        db.all("PRAGMA table_info(tags)", (err, columns) => {
          if (err) {
            console.error('Error al verificar estructura de tags:', err);
            db.close();
            reject(err);
            return;
          }

          const hasOrgId = columns.some(col => col.name === 'organization_id');
          
          if (!hasOrgId) {
            console.log('⚠️  La tabla tags NO tiene la columna organization_id');
            console.log('➕  Agregando columna organization_id...');
            
            // Agregar la columna organization_id
            db.run(
              'ALTER TABLE tags ADD COLUMN organization_id INTEGER',
              (err) => {
                if (err) {
                  console.error('Error al agregar columna organization_id:', err);
                  db.close();
                  reject(err);
                  return;
                }
                
                console.log('✅ Columna organization_id agregada exitosamente');
                
                // Ahora proceder a asignar valores
                assignOrganizationsToTags(db, resolve, reject);
              }
            );
            return;
          }

          console.log('✅ La columna organization_id ya existe');
          // Proceder a asignar valores
          assignOrganizationsToTags(db, resolve, reject);
        });
      });
    });
  });
}

function assignOrganizationsToTags(db, resolve, reject) {
  // Verificar cuántos tags hay sin organization_id (NULL o 0)
  db.get(
    'SELECT COUNT(*) as count FROM tags WHERE organization_id IS NULL OR organization_id = 0',
    (err, row) => {
      if (err) {
        console.error('Error al contar tags:', err);
        db.close();
        reject(err);
        return;
      }

      const orphanTagsCount = row.count;
      console.log(`\n📋 Tags sin organización: ${orphanTagsCount}`);

      if (orphanTagsCount === 0) {
        console.log('✅ Todos los tags ya tienen organización asignada');
        db.close();
        resolve();
        return;
      }

      // Asignar todos los tags a la organización con ID 1
      const targetOrgId = 1;
      console.log(`📌 Asignando tags a la organización ID: ${targetOrgId}`);
      
      db.run(
        'UPDATE tags SET organization_id = ? WHERE organization_id IS NULL OR organization_id = 0',
        [targetOrgId],
        function(err) {
          if (err) {
            console.error('Error al asignar tags a organización:', err);
            db.close();
            reject(err);
            return;
          }

          console.log(`✅ ${this.changes} tags asignados a la organización ${targetOrgId}`);
          
          // Ahora agregar la foreign key constraint y unique constraint si no existen
          console.log('\n🔧 Verificando constraints...');
          
          // SQLite no permite agregar constraints a tablas existentes de forma directa
          // Necesitamos recrear la tabla con los constraints
          recreateTableWithConstraints(db, resolve, reject);
        }
      );
    }
  );
}

function recreateTableWithConstraints(db, resolve, reject) {
  // Verificar si ya tiene los constraints
  db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='tags'", (err, table) => {
    if (err) {
      console.error('Error al verificar constraints:', err);
      db.close();
      reject(err);
      return;
    }

    const tableSql = table.sql;
    
    // Verificar si ya tiene FOREIGN KEY y UNIQUE
    if (tableSql.includes('FOREIGN KEY') && tableSql.includes('UNIQUE')) {
      console.log('✅ Los constraints ya existen');
      db.close();
      resolve();
      return;
    }

    console.log('➕ Agregando constraints (recreando tabla)...');

    db.serialize(() => {
      // Crear tabla temporal con los constraints correctos
      db.run(`
        CREATE TABLE tags_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          organization_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          color TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          UNIQUE(organization_id, name)
        )
      `, (err) => {
        if (err) {
          console.error('Error al crear tabla nueva:', err);
          db.close();
          reject(err);
          return;
        }

        // Copiar datos de la tabla vieja a la nueva
        db.run(`
          INSERT INTO tags_new (id, organization_id, name, color, created_at)
          SELECT id, organization_id, name, color, created_at FROM tags
        `, (err) => {
          if (err) {
            console.error('Error al copiar datos:', err);
            db.close();
            reject(err);
            return;
          }

          // Eliminar tabla vieja
          db.run('DROP TABLE tags', (err) => {
            if (err) {
              console.error('Error al eliminar tabla vieja:', err);
              db.close();
              reject(err);
              return;
            }

            // Renombrar tabla nueva
            db.run('ALTER TABLE tags_new RENAME TO tags', (err) => {
              if (err) {
                console.error('Error al renombrar tabla:', err);
                db.close();
                reject(err);
                return;
              }

              console.log('✅ Tabla tags recreada con constraints correctos');
              db.close();
              resolve();
            });
          });
        });
      });
    });
  });
}

// Ejecutar si se llama directamente
if (require.main === module) {
  console.log('🔄 Iniciando migración: Asignar tags a organizaciones...\n');
  
  runMigration()
    .then(() => {
      console.log('\n✅ Migración completada exitosamente');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ Error en la migración:', err);
      process.exit(1);
    });
}

module.exports = { runMigration };
