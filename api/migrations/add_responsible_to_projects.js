const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Ruta a la base de datos
const dbPath = path.join(__dirname, '..', 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err.message);
    process.exit(1);
  }
  console.log('Conectado a la base de datos SQLite.');
});

// Migración
db.serialize(() => {
  console.log('Iniciando migración: agregar responsible_id a la tabla projects...');

  // Agregar columna responsible_id
  db.run(`
    ALTER TABLE projects 
    ADD COLUMN responsible_id INTEGER REFERENCES users(id)
  `, (err) => {
    if (err) {
      console.error('Error al agregar columna responsible_id:', err.message);
      // Si el error es que la columna ya existe, continuamos
      if (!err.message.includes('duplicate column name')) {
        db.close();
        process.exit(1);
      } else {
        console.log('La columna responsible_id ya existe, continuando...');
      }
    } else {
      console.log('✓ Columna responsible_id agregada exitosamente.');
    }
    
    // Cerrar la base de datos después de completar la operación
    console.log('\n✅ Migración completada exitosamente.');
    console.log('La siguiente columna ha sido agregada a la tabla projects:');
    console.log('  - responsible_id (INTEGER): ID del usuario responsable del proyecto');
    
    db.close((err) => {
      if (err) {
        console.error('Error al cerrar la base de datos:', err.message);
        process.exit(1);
      }
      console.log('\nConexión a la base de datos cerrada.');
    });
  });
});
