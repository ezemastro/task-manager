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
  console.log('Iniciando migración: agregar intermediate_date e intermediate_date_note a la tabla stages...');

  // Agregar columna intermediate_date
  db.run(`
    ALTER TABLE stages 
    ADD COLUMN intermediate_date TEXT
  `, (err) => {
    if (err) {
      console.error('Error al agregar columna intermediate_date:', err.message);
      // Si el error es que la columna ya existe, continuamos
      if (!err.message.includes('duplicate column name')) {
        db.close();
        process.exit(1);
      } else {
        console.log('La columna intermediate_date ya existe, continuando...');
      }
    } else {
      console.log('✓ Columna intermediate_date agregada exitosamente.');
    }
  });

  // Agregar columna intermediate_date_note
  db.run(`
    ALTER TABLE stages 
    ADD COLUMN intermediate_date_note TEXT
  `, (err) => {
    if (err) {
      console.error('Error al agregar columna intermediate_date_note:', err.message);
      // Si el error es que la columna ya existe, continuamos
      if (!err.message.includes('duplicate column name')) {
        db.close();
        process.exit(1);
      } else {
        console.log('La columna intermediate_date_note ya existe, continuando...');
      }
    } else {
      console.log('✓ Columna intermediate_date_note agregada exitosamente.');
    }
    
    // Cerrar la base de datos después de completar todas las operaciones
    console.log('\n✅ Migración completada exitosamente.');
    console.log('Las siguientes columnas han sido agregadas a la tabla stages:');
    console.log('  - intermediate_date (TEXT): Fecha intermedia de la etapa');
    console.log('  - intermediate_date_note (TEXT): Comentario/nota para la fecha intermedia');
    
    db.close((err) => {
      if (err) {
        console.error('Error al cerrar la base de datos:', err.message);
        process.exit(1);
      }
      console.log('\nConexión a la base de datos cerrada.');
    });
  });
});
