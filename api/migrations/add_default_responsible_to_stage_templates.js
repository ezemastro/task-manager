const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🔄 Agregando columna default_responsible_id a stage_templates...\n');

db.serialize(() => {
  // Verificar si la columna ya existe
  db.all("PRAGMA table_info(stage_templates)", (err, columns) => {
    if (err) {
      console.error('❌ Error al obtener info de stage_templates:', err);
      db.close();
      return;
    }

    const hasDefaultResponsible = columns.some(col => col.name === 'default_responsible_id');

    if (hasDefaultResponsible) {
      console.log('✓ La columna default_responsible_id ya existe en stage_templates');
      db.close();
      return;
    }

    console.log('Agregando columna default_responsible_id...');
    
    db.run(`
      ALTER TABLE stage_templates 
      ADD COLUMN default_responsible_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    `, (err) => {
      if (err) {
        console.error('❌ Error al agregar columna:', err);
      } else {
        console.log('✅ Columna default_responsible_id agregada exitosamente');
      }
      
      db.close();
    });
  });
});
