import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const MIGRATIONS_DIR = process.env.NODE_ENV === 'production'
  ? path.join('/app', 'migrations')
  : path.join(__dirname, '..', 'migrations');

const MIGRATIONS_LOG = process.env.NODE_ENV === 'production'
  ? '/app/data/migrations.log'
  : path.join(__dirname, '..', 'migrations.log');

interface MigrationLog {
  migrations: string[];
}

function loadMigrationsLog(): MigrationLog {
  try {
    if (fs.existsSync(MIGRATIONS_LOG)) {
      const content = fs.readFileSync(MIGRATIONS_LOG, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.warn('⚠️  No se pudo leer el log de migraciones, se creará uno nuevo');
  }
  return { migrations: [] };
}

function saveMigrationsLog(log: MigrationLog): void {
  const logDir = path.dirname(MIGRATIONS_LOG);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  fs.writeFileSync(MIGRATIONS_LOG, JSON.stringify(log, null, 2), 'utf-8');
}

export async function runMigrations(): Promise<void> {
  console.log('🔄 Ejecutando migraciones...');
  
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('📁 No existe el directorio de migraciones, saltando...');
    return;
  }

  // Leer archivos de migración (.js)
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.js') && !file.startsWith('README'))
    .sort(); // Orden alfabético para ejecutar en secuencia

  if (files.length === 0) {
    console.log('✅ No hay migraciones pendientes');
    return;
  }

  const log = loadMigrationsLog();
  const pendingMigrations = files.filter(file => !log.migrations.includes(file));

  if (pendingMigrations.length === 0) {
    console.log('✅ Todas las migraciones ya fueron ejecutadas');
    return;
  }

  console.log(`📋 Migraciones pendientes: ${pendingMigrations.length}`);

  for (const file of pendingMigrations) {
    const migrationPath = path.join(MIGRATIONS_DIR, file);
    console.log(`\n🔧 Ejecutando: ${file}`);
    
    try {
      // Ejecutar la migración usando node
      execSync(`node "${migrationPath}"`, {
        stdio: 'inherit',
        env: { ...process.env }
      });
      
      // Marcar como completada
      log.migrations.push(file);
      saveMigrationsLog(log);
      
      console.log(`✅ ${file} completada exitosamente`);
    } catch (error) {
      console.error(`❌ Error ejecutando ${file}:`);
      console.error(error);
      throw new Error(`Migración fallida: ${file}`);
    }
  }

  console.log('\n✅ Todas las migraciones ejecutadas exitosamente\n');
}
