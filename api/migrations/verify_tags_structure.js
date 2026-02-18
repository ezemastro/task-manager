const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error:', err);
    return;
  }

  console.log('📊 Verificando estructura de la tabla tags:\n');

  // Ver estructura de la tabla
  db.all("PRAGMA table_info(tags)", (err, columns) => {
    if (err) {
      console.error('Error:', err);
      db.close();
      return;
    }

    console.log('Columnas de la tabla tags:');
    columns.forEach(col => {
      console.log(`  - ${col.name} (${col.type})${col.notnull ? ' NOT NULL' : ''}${col.pk ? ' PRIMARY KEY' : ''}`);
    });

    // Ver el SQL de creación
    db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='tags'", (err, table) => {
      if (err) {
        console.error('Error:', err);
        db.close();
        return;
      }

      console.log('\n📝 SQL de creación de la tabla:');
      console.log(table.sql);

      // Ver los datos
      db.all('SELECT * FROM tags', (err, tags) => {
        if (err) {
          console.error('Error:', err);
          db.close();
          return;
        }

        console.log('\n📦 Tags en la base de datos:');
        tags.forEach(tag => {
          console.log(`  - ID: ${tag.id}, Org: ${tag.organization_id}, Nombre: ${tag.name}, Color: ${tag.color}`);
        });

        db.close();
      });
    });
  });
});
