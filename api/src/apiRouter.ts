import { Router, type Request, type Response } from "express";
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import { authMiddleware, requireSuperAdmin } from './middleware';

export const apiRouter = Router();

// Proteger todas las rutas del API con autenticación
apiRouter.use(authMiddleware);

// Suma N días hábiles (lunes a viernes) a una fecha, salteando sábados y
// domingos. Se usa para calcular la fecha límite estimada por defecto de una
// etapa a partir de su fecha de inicio y la duración de su plantilla.
function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      remaining -= 1;
    }
  }
  return result;
}

// Tipos de proyecto. Cada tipo tiene su propia lista de etapas predefinidas
// (stage_templates.project_type) que se copian al crear un proyecto de ese tipo.
export const PROJECT_TYPES = ['obra_nueva', 'carteles', 'reforma'] as const;
export type ProjectType = typeof PROJECT_TYPES[number];
const LEGACY_TEMPLATES_PROJECT_TYPE: ProjectType = 'obra_nueva';

function isProjectType(value: unknown): value is ProjectType {
  return typeof value === 'string' && (PROJECT_TYPES as readonly string[]).includes(value);
}

// Agrega la columna project_type a projects y stage_templates si falta.
// Las plantillas anteriores a los tipos (project_type NULL) quedan para
// "obra nueva" y se copian a los demás tipos, para que cada tipo arranque con
// la misma lista y se pueda organizar por separado. Es idempotente: una vez
// asignado el tipo, no quedan plantillas en NULL para volver a copiar.
function ensureProjectTypeColumns(onDone: () => void = () => {}) {
  const addColumnIfMissing = (table: string, done: () => void) => {
    db.all(`PRAGMA table_info(${table})`, (err, columns: Array<{ name: string }>) => {
      if (err) {
        console.error(`Error al verificar project_type en ${table}:`, err.message);
        return;
      }
      if (columns.some((column) => column.name === 'project_type')) return done();
      db.run(`ALTER TABLE ${table} ADD COLUMN project_type TEXT`, (alterErr) => {
        if (alterErr) {
          console.error(`Error al agregar project_type a ${table}:`, alterErr.message);
          return;
        }
        done();
      });
    });
  };

  addColumnIfMissing('projects', () => {});
  addColumnIfMissing('stage_templates', () => {
    const copyLegacy = PROJECT_TYPES
      .filter((type) => type !== LEGACY_TEMPLATES_PROJECT_TYPE)
      .map((type) => `
        INSERT INTO stage_templates (organization_id, name, order_number, default_responsible_id, estimated_duration_days, project_type)
        SELECT organization_id, name, order_number, default_responsible_id, estimated_duration_days, '${type}'
        FROM stage_templates WHERE project_type IS NULL;`)
      .join('\n');
    db.exec(
      `BEGIN;
       ${copyLegacy}
       UPDATE stage_templates SET project_type = '${LEGACY_TEMPLATES_PROJECT_TYPE}' WHERE project_type IS NULL;
       COMMIT;`,
      (execErr) => {
        if (execErr) {
          console.error('Error al asignar tipo a las etapas predefinidas:', execErr.message);
          db.exec('ROLLBACK', () => onDone());
          return;
        }
        onDone();
      }
    );
  });
}

// ==================== ATRIBUTOS DE ETAPA ====================
// Se configuran una vez por empresa en las etapas predefinidas y se copian a
// cada etapa de proyecto al crearlo:
// - stage_kind: 'execution' (tarea) o 'control'.
// - milestone: función especial de la etapa ('delivery' marca la entrega real,
//   'client_closing' el cierre administrativo del cliente). Reemplaza buscar
//   las etapas por nombre, así renombrarlas no rompe los controles.
// - is_required: no se puede borrar de un proyecto.
// - counts_work_time: suma al total de días de trabajo del resumen.
export const STAGE_KINDS = ['execution', 'control'] as const;
export const STAGE_MILESTONES = ['delivery', 'client_closing'] as const;
type StageMilestone = typeof STAGE_MILESTONES[number];

// Nombres con los que se identificaban estas etapas antes de los atributos;
// solo se usan una vez, para marcar las etapas existentes.
const LEGACY_MILESTONE_STAGE_NAMES: Record<StageMilestone, string> = {
  delivery: 'entrega completa y revisada',
  client_closing: 'cierre por parte de cliente',
};

const STAGE_ATTRIBUTE_COLUMNS = [
  ['stage_kind', "TEXT NOT NULL DEFAULT 'execution'"],
  ['milestone', 'TEXT'],
  ['is_required', 'INTEGER NOT NULL DEFAULT 0'],
  ['counts_work_time', 'INTEGER NOT NULL DEFAULT 1'],
] as const;

// "No aplica": una etapa (típicamente obligatoria) que no corresponde a un
// trabajo puntual se resuelve con un motivo escrito y queda registrado quién
// y cuándo lo decidió. Cuenta como resuelta para poder completar el proyecto.
const NOT_APPLICABLE_COLUMNS = [
  ['not_applicable', 'INTEGER NOT NULL DEFAULT 0'],
  ['not_applicable_reason', 'TEXT'],
  ['not_applicable_by', 'INTEGER'],
  ['not_applicable_at', 'DATETIME'],
] as const;

// Causas de retraso / espera. Las del lado del cliente (cliente, falta de
// información, cambio de arquitectura) se descuentan del retraso como
// "atribuible al cliente"; el resto (interna, otra, sin causa) es "del estudio".
const DELAY_CAUSES = ['client', 'internal', 'missing_info', 'architecture_change', 'other'] as const;
type DelayCause = typeof DELAY_CAUSES[number];
const CLIENT_SIDE_CAUSES: ReadonlySet<string> = new Set(['client', 'missing_info', 'architecture_change']);
const isDelayCause = (value: unknown): value is DelayCause => typeof value === 'string' && (DELAY_CAUSES as readonly string[]).includes(value);

// Causa declarada cuando una etapa supera su fecha estimada.
const DELAY_CAUSE_COLUMNS = [
  ['delay_cause', 'TEXT'],
  ['delay_cause_note', 'TEXT'],
  ['delay_cause_by', 'INTEGER'],
  ['delay_cause_at', 'DATETIME'],
] as const;

function ensureDelayCauseColumns() {
  db.all('PRAGMA table_info(stages)', (err, columns: Array<{ name: string }>) => {
    if (err) {
      console.error('Error al verificar columnas de causa de retraso en stages:', err.message);
      return;
    }
    DELAY_CAUSE_COLUMNS
      .filter(([name]) => !columns.some((column) => column.name === name))
      .forEach(([name, type]) => {
        db.run(`ALTER TABLE stages ADD COLUMN ${name} ${type}`, (alterErr) => {
          if (alterErr) console.error(`Error al agregar ${name} a stages:`, alterErr.message);
        });
      });
  });
}

// ---- Historial de cambios de la fecha comprometida (deadline) ----
// projects.deadline es la fecha vigente que ve el equipo. projects.committed_deadline
// es la que usa el indicador de retrasos: la original, que solo cambia cuando el
// cambio se marca como "acordado con el cliente". Cada cambio queda registrado
// con usuario, fecha, valor anterior, valor nuevo y motivo (obligatorio).
const DEADLINE_CHANGE_MIN_REASON = 5;

function ensureDeadlineHistory() {
  db.run(`
    CREATE TABLE IF NOT EXISTS project_deadline_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      old_deadline TEXT,
      new_deadline TEXT,
      reason TEXT,
      agreed_with_client INTEGER NOT NULL DEFAULT 0,
      changed_by INTEGER,
      changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_deadline_changes_project ON project_deadline_changes(project_id, changed_at)');
  db.all('PRAGMA table_info(projects)', (err, columns: Array<{ name: string }>) => {
    if (err) {
      console.error('Error al verificar committed_deadline en projects:', err.message);
      return;
    }
    if (columns.some((column) => column.name === 'committed_deadline')) return;
    db.run('ALTER TABLE projects ADD COLUMN committed_deadline TEXT', (alterErr) => {
      if (alterErr) return console.error('Error al agregar committed_deadline a projects:', alterErr.message);
      // Una sola vez: la fecha actual de cada proyecto pasa a ser la comprometida original.
      db.run('UPDATE projects SET committed_deadline = deadline WHERE committed_deadline IS NULL', (fillErr) => {
        if (fillErr) console.error('Error al completar committed_deadline:', fillErr.message);
      });
    });
  });
}

// Valida causa + nota (la nota es obligatoria cuando la causa es "Otra").
function parseCauseInput(body: any): { cause: DelayCause; note: string | null } | { error: string } {
  const cause = body?.cause;
  if (!isDelayCause(cause)) {
    return { error: 'Elegí la causa: Cliente, Interna, Falta de información, Cambio de arquitectura u Otra.' };
  }
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  if (cause === 'other' && note.length < 3) {
    return { error: 'Si la causa es "Otra", escribí una breve descripción.' };
  }
  return { cause, note: note || null };
}

function ensureNotApplicableColumns() {
  db.all('PRAGMA table_info(stages)', (err, columns: Array<{ name: string }>) => {
    if (err) {
      console.error('Error al verificar columnas de "No aplica" en stages:', err.message);
      return;
    }
    NOT_APPLICABLE_COLUMNS
      .filter(([name]) => !columns.some((column) => column.name === name))
      .forEach(([name, type]) => {
        db.run(`ALTER TABLE stages ADD COLUMN ${name} ${type}`, (alterErr) => {
          if (alterErr) console.error(`Error al agregar ${name} a stages:`, alterErr.message);
        });
      });
  });
}

function ensureStageAttributeColumns() {
  ensureNotApplicableColumns();
  ensureDelayCauseColumns();
  ['stage_templates', 'stages'].forEach((table) => {
    db.all(`PRAGMA table_info(${table})`, (err, columns: Array<{ name: string }>) => {
      if (err) {
        console.error(`Error al verificar atributos de etapa en ${table}:`, err.message);
        return;
      }
      const missing = STAGE_ATTRIBUTE_COLUMNS.filter(([name]) => !columns.some((column) => column.name === name));
      if (missing.length === 0) return;
      const needsBackfill = missing.some(([name]) => name === 'milestone');
      let pending = missing.length;
      missing.forEach(([name, type]) => {
        db.run(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`, (alterErr) => {
          if (alterErr) console.error(`Error al agregar ${name} a ${table}:`, alterErr.message);
          pending -= 1;
          if (pending === 0 && needsBackfill) backfillLegacyMilestones(table);
        });
      });
    });
  });
}

// Marca una única vez (al crear la columna) las etapas que antes se
// reconocían por nombre. El cierre del cliente queda como etapa de control
// que no suma tiempo de trabajo (es espera del cliente).
function backfillLegacyMilestones(table: string) {
  db.all(`SELECT id, name FROM ${table}`, (err, rows: Array<{ id: number; name: string }>) => {
    if (err) {
      console.error(`Error al marcar funciones de etapa en ${table}:`, err.message);
      return;
    }
    const idsFor = (milestone: StageMilestone) => rows
      .filter((row) => normalizeStageName(row.name) === LEGACY_MILESTONE_STAGE_NAMES[milestone])
      .map((row) => row.id);
    const update = (ids: number[], setSql: string, params: unknown[]) => {
      if (ids.length === 0) return;
      db.run(`UPDATE ${table} SET ${setSql} WHERE id IN (${ids.map(() => '?').join(',')})`, [...params, ...ids], (updateErr) => {
        if (updateErr) console.error(`Error al marcar funciones de etapa en ${table}:`, updateErr.message);
      });
    };
    update(idsFor('delivery'), 'milestone = ?', ['delivery']);
    update(idsFor('client_closing'), "milestone = ?, stage_kind = 'control', counts_work_time = 0", ['client_closing']);
  });
}

// Normaliza los atributos recibidos en el body; devuelve un error legible si
// alguno es inválido. Solo incluye los campos presentes.
function parseStageAttributes(body: Record<string, unknown>): { values: Record<string, unknown>; error?: string } {
  const values: Record<string, unknown> = {};
  if (body.stage_kind !== undefined) {
    if (!(STAGE_KINDS as readonly unknown[]).includes(body.stage_kind)) return { values, error: 'Tipo de etapa inválido (execution o control)' };
    values.stage_kind = body.stage_kind;
  }
  if (body.milestone !== undefined) {
    if (body.milestone !== null && body.milestone !== '' && !(STAGE_MILESTONES as readonly unknown[]).includes(body.milestone)) {
      return { values, error: 'Función de etapa inválida (delivery o client_closing)' };
    }
    values.milestone = body.milestone || null;
  }
  if (body.is_required !== undefined) values.is_required = body.is_required ? 1 : 0;
  if (body.counts_work_time !== undefined) values.counts_work_time = body.counts_work_time ? 1 : 0;
  return { values };
}

// Una función (entrega / cierre) la tiene una sola etapa por tipo de proyecto:
// al asignarla a una, se quita de las demás.
function clearMilestoneFromOtherTemplates(templateId: number, done: (err: Error | null) => void) {
  db.run(
    `UPDATE stage_templates SET milestone = NULL
     WHERE id != ? AND milestone IS NOT NULL
       AND (organization_id, project_type, milestone) = (SELECT organization_id, project_type, milestone FROM stage_templates WHERE id = ?)`,
    [templateId, templateId],
    (err) => done(err),
  );
}

// Email del super administrador global (dueño de la plataforma).
const SUPER_ADMIN_EMAIL = 'marcelomastropietro@gmail.com';

// Database setup - usar directorio de datos si existe (Docker), sino usar raíz
const dataDir = process.env.DB_PATH || (fs.existsSync('/app/data') ? '/app/data' : '.');
const dbPath = path.join(dataDir, 'database.sqlite');

// Crear directorio si no existe
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

console.log('Ruta de base de datos:', dbPath);

export const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al conectar con la base de datos:', err);
  } else {
    console.log('Conectado a la base de datos SQLite');
    initializeDatabase();
  }
});

// Initialize database tables
function initializeDatabase() {
  db.serialize(() => {
    // Foreign-key cascades (including stage_tags when deleting a tag) are
    // disabled by default for each SQLite connection.
    db.run('PRAGMA foreign_keys = ON', (err) => {
      if (err) console.error('No se pudieron habilitar las claves foráneas:', err.message);
      else console.log('Claves foráneas SQLite habilitadas');
    });
    // Habilitar WAL: mejora vida de la SD-card y concurrencia de lectura
    db.exec("PRAGMA journal_mode=WAL", (err: Error | null) => {
      if (err) console.error('No se pudo habilitar WAL:', err.message);
      else console.log('WAL habilitado (journal_mode=wal)');
    });

    // Tabla de cuentas de usuario (autenticación global)
    db.run(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_super_admin INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Compatibilidad para bases existentes creadas antes de is_super_admin.
    // El sembrado corre solo después de confirmar la columna (callback del
    // ALTER) para no depender del orden de ejecución de node-sqlite3.
    db.all('PRAGMA table_info(accounts)', (err, columns: Array<{ name: string }>) => {
      if (err) {
        console.error('Error al verificar las columnas de accounts:', err.message);
        return;
      }
      const seedSuperAdmin = () => {
        db.run(
          'UPDATE accounts SET is_super_admin = 1 WHERE LOWER(email) = ? AND is_super_admin = 0',
          [SUPER_ADMIN_EMAIL],
          (seedErr) => {
            if (seedErr) console.error('Error al sembrar el super administrador:', seedErr.message);
          }
        );
      };
      if (!columns.some((column) => column.name === 'is_super_admin')) {
        db.run('ALTER TABLE accounts ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0', (alterErr) => {
          if (alterErr) console.error('Error al agregar is_super_admin a accounts:', alterErr.message);
          else seedSuperAdmin();
        });
      } else {
        seedSuperAdmin();
      }
    });

    // Tabla de organizaciones
    db.run(`
      CREATE TABLE IF NOT EXISTS organizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de membresías (relación accounts-organizations)
    db.run(`
      CREATE TABLE IF NOT EXISTS organization_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        organization_id INTEGER NOT NULL,
        role TEXT DEFAULT 'member',
        scopes TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        UNIQUE(account_id, organization_id)
      )
    `);

    // Tabla de usuarios (ahora vinculada a accounts por email)
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        account_email TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (account_email) REFERENCES accounts(email) ON DELETE CASCADE,
        UNIQUE(organization_id, account_email)
      )
    `);

    // Tabla de clientes
    db.run(`
      CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        preferences TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
      )
    `);

    // Compatibilidad también para bases de desarrollo antiguas sin preferences.
    db.all('PRAGMA table_info(clients)', (err, columns: Array<{ name: string }>) => {
      if (err) {
        console.error('Error al verificar las columnas de clients:', err.message);
        return;
      }
      const existingColumns = new Set(columns.map((column) => column.name));
      if (!existingColumns.has('preferences')) {
        db.run('ALTER TABLE clients ADD COLUMN preferences TEXT', (alterErr) => {
          if (alterErr) console.error('Error al agregar preferences a clients:', alterErr.message);
        });
      }
    });

    // Tabla de proyectos
    db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        contact TEXT,
        client_id INTEGER,
        responsible_id INTEGER,
        deadline DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active',
        completed_date DATETIME,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
        FOREIGN KEY (responsible_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Mantener compatibles las bases SQLite creadas antes de agregar contacto.
    db.all('PRAGMA table_info(projects)', (err, columns: Array<{ name: string }>) => {
      if (err) {
        console.error('Error al verificar la columna contact en projects:', err.message);
        return;
      }

      const missingColumns = [
        ['contact', 'TEXT'],
        ['completed_date', 'DATETIME'],
      ] as const;
      missingColumns.filter(([name]) => !columns.some((column) => column.name === name)).forEach(([name, type]) => {
        db.run(`ALTER TABLE projects ADD COLUMN ${name} ${type}`, (alterErr) => {
          if (alterErr) console.error(`Error al agregar la columna ${name} a projects:`, alterErr.message);
        });
      });
    });

    ensureDeadlineHistory();

    // Tabla de plantillas de etapas
    db.run(`
      CREATE TABLE IF NOT EXISTS stage_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        order_number INTEGER NOT NULL,
        default_responsible_id INTEGER,
        estimated_duration_days INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (default_responsible_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Tipo de proyecto (obra nueva / carteles / reforma) en proyectos y plantillas.
    // Después (cuando ya existen las copias por tipo) se agregan los atributos
    // de etapa: tipo, función, obligatoria y si suma tiempo de trabajo.
    ensureProjectTypeColumns(() => ensureStageAttributeColumns());

    // Tabla de etapas
    db.run(`
      CREATE TABLE IF NOT EXISTS stages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        template_id INTEGER,
        name TEXT NOT NULL,
        responsible_id INTEGER,
        start_date DATETIME,
        intermediate_date DATETIME,
        estimated_end_date DATETIME,
        completed_date DATETIME,
        order_number INTEGER NOT NULL,
        is_completed BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (template_id) REFERENCES stage_templates(id) ON DELETE SET NULL,
        FOREIGN KEY (responsible_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Ciclos repetibles de trabajo dentro de cada etapa
    db.run(`
      CREATE TABLE IF NOT EXISTS stage_cycles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        project_id INTEGER NOT NULL,
        stage_id INTEGER NOT NULL,
        cycle_number INTEGER NOT NULL,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        started_by INTEGER,
        ended_at DATETIME,
        ended_by INTEGER,
        deadline_used DATETIME,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (stage_id) REFERENCES stages(id) ON DELETE CASCADE,
        FOREIGN KEY (started_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (ended_by) REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE(stage_id, cycle_number)
      )
    `);
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_stage_cycles_one_open ON stage_cycles(stage_id) WHERE ended_at IS NULL');
    db.run('CREATE INDEX IF NOT EXISTS idx_stage_cycles_stage_history ON stage_cycles(stage_id, cycle_number DESC)');
    db.run('CREATE INDEX IF NOT EXISTS idx_stage_cycles_organization ON stage_cycles(organization_id, project_id, stage_id)');

    // Períodos de espera: de una etapa ("En espera") o del proyecto entero
    // (stage_id NULL, cuando se paraliza). Los días se cuentan solos entre
    // started_at y ended_at (o hoy, si sigue abierto).
    db.run(`
      CREATE TABLE IF NOT EXISTS stage_holds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        project_id INTEGER NOT NULL,
        stage_id INTEGER,
        cause TEXT,
        note TEXT,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        started_by INTEGER,
        ended_at DATETIME,
        ended_by INTEGER,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (stage_id) REFERENCES stages(id) ON DELETE CASCADE,
        FOREIGN KEY (started_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (ended_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_stage_holds_one_open_stage ON stage_holds(stage_id) WHERE stage_id IS NOT NULL AND ended_at IS NULL');
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_stage_holds_one_open_project ON stage_holds(project_id) WHERE stage_id IS NULL AND ended_at IS NULL');
    db.run('CREATE INDEX IF NOT EXISTS idx_stage_holds_project ON stage_holds(organization_id, project_id)');
    db.all('PRAGMA table_info(stage_cycles)', (cycleTableErr, cycleColumns: Array<{ name: string }>) => {
      if (!cycleTableErr && cycleColumns.length > 0 && !cycleColumns.some((column) => column.name === 'deadline_used')) {
        db.run('ALTER TABLE stage_cycles ADD COLUMN deadline_used DATETIME', (alterErr) => {
          if (alterErr) console.error('Error al agregar deadline_used a stage_cycles:', alterErr.message);
        });
      }
    });

    // Tabla de etiquetas
    db.run(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        color TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        UNIQUE(organization_id, name)
      )
    `);

    // Tabla de relación etapa-etiqueta
    db.run(`
      CREATE TABLE IF NOT EXISTS stage_tags (
        stage_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (stage_id, tag_id),
        FOREIGN KEY (stage_id) REFERENCES stages(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )
    `);

    // Catálogo de etiquetas de proyecto (independiente de las etiquetas de etapas)
    db.run(`
      CREATE TABLE IF NOT EXISTS project_tag_options (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        color TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        UNIQUE(organization_id, name)
      )
    `);

    // Tabla de relación proyecto-etiqueta de proyecto
    db.run(`
      CREATE TABLE IF NOT EXISTS project_tag_assignments (
        project_id INTEGER NOT NULL,
        project_tag_id INTEGER NOT NULL,
        PRIMARY KEY (project_id, project_tag_id),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (project_tag_id) REFERENCES project_tag_options(id) ON DELETE CASCADE
      )
    `);

    // Migración única: si existe la tabla legacy project_tags, copiar sus datos
    // al catálogo separado de etiquetas de proyecto y luego eliminarla. En
    // instalaciones nuevas la tabla legacy no existe y la migración se omite.
    // Debe ejecutarse dentro de serialize() para que las tablas nuevas ya existan.
    db.get(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_tags'",
      (legacyErr: Error | null, legacyRow: any) => {
        if (legacyErr) {
          console.error('Error al verificar la tabla legacy project_tags:', legacyErr.message);
          return;
        }
        if (!legacyRow) {
          // Instalación nueva: no hay tabla legacy que migrar.
          return;
        }
        db.run(
          `INSERT OR IGNORE INTO project_tag_options (organization_id, name, color)
           SELECT DISTINCT t.organization_id, t.name, t.color
           FROM project_tags pt INNER JOIN tags t ON t.id = pt.tag_id`,
          (insErr) => {
            if (insErr) {
              console.error('Error al migrar opciones de etiquetas de proyecto:', insErr.message);
              return;
            }
            db.run(
              `INSERT OR IGNORE INTO project_tag_assignments (project_id, project_tag_id)
               SELECT pt.project_id, pto.id
               FROM project_tags pt
               INNER JOIN tags t ON t.id = pt.tag_id
               INNER JOIN project_tag_options pto ON pto.organization_id = t.organization_id AND pto.name = t.name`,
              (assignErr) => {
                if (assignErr) {
                  console.error('Error al migrar asignaciones de etiquetas de proyecto:', assignErr.message);
                  return;
                }
                db.run('DROP TABLE project_tags', (dropErr) => {
                  if (dropErr) {
                    console.error('Error al eliminar la tabla legacy project_tags:', dropErr.message);
                    return;
                  }
                  console.log('Migración de project_tags completada y tabla legacy eliminada');
                });
              }
            );
          }
        );
      }
    );

    // Tabla de comentarios
    db.run(`
      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stage_id INTEGER NOT NULL,
        user_id INTEGER,
        content TEXT NOT NULL,
        author TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (stage_id) REFERENCES stages(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Tabla de auditoría
    db.run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
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
    `);

    // Crear índices para mejorar el rendimiento de las consultas de auditoría
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_organization 
      ON audit_logs(organization_id, created_at DESC)
    `);
    
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user 
      ON audit_logs(user_id, created_at DESC)
    `);
    
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_entity 
      ON audit_logs(entity_type, entity_id)
    `);

    // Insertar usuarios de ejemplo si la tabla está vacía
    // db.get('SELECT COUNT(*) as count FROM users', [], (err, row: any) => {
    //   if (!err && row.count === 0) {
    //     const defaultUsers = [
    //       ['Juan Pérez', 'juan.perez@example.com', 'Ingeniero Civil'],
    //       ['María García', 'maria.garcia@example.com', 'Arquitecta'],
    //       ['Carlos Rodríguez', 'carlos.rodriguez@example.com', 'Gerente de Proyecto'],
    //       ['Ana Martínez', 'ana.martinez@example.com', 'Ingeniera'],
    //       ['Luis Fernández', 'luis.fernandez@example.com', 'Supervisor'],
    //     ];

    //     const insertUser = db.prepare('INSERT INTO users (name, email, role) VALUES (?, ?, ?)');
    //     defaultUsers.forEach(user => {
    //       insertUser.run(user);
    //     });
    //     insertUser.finalize();
    //     console.log('Usuarios de ejemplo creados');
    //   }
    // });
  });
}

// ==================== AUDIT LOG HELPER ====================

interface AuditLogParams {
  organizationId: number;
  userId: number;
  action: string;
  entityType: string;
  entityId?: number;
  projectName?: string;
  details?: string;
  ipAddress?: string;
}

function logAudit(params: AuditLogParams) {
  const { organizationId, userId, action, entityType, entityId, projectName, details, ipAddress } = params;
  
  const sql = `
    INSERT INTO audit_logs 
    (organization_id, user_id, action, entity_type, entity_id, project_name, details, ip_address) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  db.run(sql, [
    organizationId,
    userId,
    action,
    entityType,
    entityId || null,
    projectName || null,
    details || null,
    ipAddress || null
  ], (err) => {
    if (err) {
      console.error('Error al registrar auditoría:', err);
    }
  });
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function businessCalendarDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  // Deadlines are date-only business values and must not be shifted.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return dateOnly(raw);

  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const timestamp = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}Z`;
  const parsed = new Date(timestamp);
  if (!Number.isFinite(parsed.getTime())) return null;

  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(parsed);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (values.year && values.month && values.day) {
      return `${values.year}-${values.month}-${values.day}`;
    }
  } catch {
    // Fall back to Argentina's deterministic UTC-03:00 offset if ICU/timezone data is unavailable.
  }

  const fallback = new Date(parsed.getTime() - 3 * 60 * 60 * 1000);
  return `${fallback.getUTCFullYear()}-${String(fallback.getUTCMonth() + 1).padStart(2, '0')}-${String(fallback.getUTCDate()).padStart(2, '0')}`;
}

function cycleComparison(endedAt: string, deadline: string | null) {
  const finishedDate = businessCalendarDate(endedAt);
  const deadlineDate = dateOnly(deadline);
  if (!finishedDate || !deadlineDate) {
    return { status: 'sin_fecha', days_early: 0, days_late: 0 };
  }
  const deadlineMillis = Date.parse(`${deadlineDate}T00:00:00Z`);
  const finishedMillis = Date.parse(`${finishedDate}T00:00:00Z`);
  if (!Number.isFinite(deadlineMillis) || !Number.isFinite(finishedMillis)) {
    return { status: 'sin_fecha', days_early: 0, days_late: 0 };
  }
  const difference = Math.round((deadlineMillis - finishedMillis) / 86400000);
  return difference >= 0
    ? { status: 'early', days_early: difference, days_late: 0 }
    : { status: 'late', days_early: 0, days_late: Math.abs(difference) };
}

// ==================== FECHAS DE ENTREGA Y RETRASO ====================
// El retraso se mide entre la fecha comprometida (projects.deadline) y la
// entrega real (cuando se completa la etapa "Entrega completa y revisada").
// El cierre administrativo ("Cierre por parte de cliente") se informa pero no
// cuenta para el retraso, porque depende del cliente.
// Las etapas se identifican por su función (stages.milestone), no por nombre.

function normalizeStageName(name: string | null | undefined): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

interface DeliveryStageRow {
  milestone: string | null;
  is_completed: number | boolean | null;
  completed_date: string | null;
}

type DeliveryStatus = 'on_time' | 'late' | 'pending' | 'overdue' | 'no_commitment';

export interface DeliveryInfo {
  /** Fecha que usa el indicador: la original o la última acordada con el cliente. */
  committed_date: string | null;
  /** Fecha vigente del proyecto (puede haberse movido sin acuerdo con el cliente). */
  current_deadline: string | null;
  delivered_date: string | null;
  closed_date: string | null;
  status: DeliveryStatus;
  delay_days: number;
  attribution?: DelayAttribution | null;
}

function completedStageDate(stages: DeliveryStageRow[], milestone: StageMilestone): string | null {
  const dates = stages
    .filter((stage) => stage.milestone === milestone && stage.is_completed && stage.completed_date)
    .map((stage) => stage.completed_date as string)
    .sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

function daysBetweenCalendarDates(from: string, to: string): number | null {
  const fromMillis = Date.parse(`${from}T00:00:00Z`);
  const toMillis = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromMillis) || !Number.isFinite(toMillis)) return null;
  return Math.round((toMillis - fromMillis) / 86400000);
}

function computeDeliveryInfo(
  project: { deadline: string | null; committed_deadline?: string | null; status?: string | null; completed_date?: string | null },
  stages: DeliveryStageRow[],
  now: Date = new Date(),
): DeliveryInfo {
  const deliveredAt = completedStageDate(stages, 'delivery');
  const closedAt = completedStageDate(stages, 'client_closing')
    ?? (project.status === 'completed' ? project.completed_date ?? null : null);
  const committed = dateOnly(project.committed_deadline ?? project.deadline);
  const delivered = businessCalendarDate(deliveredAt);
  const base = {
    committed_date: committed,
    current_deadline: dateOnly(project.deadline),
    delivered_date: delivered,
    closed_date: businessCalendarDate(closedAt),
  };

  if (!committed) return { ...base, status: 'no_commitment', delay_days: 0 };

  if (delivered) {
    const delay = daysBetweenCalendarDates(committed, delivered) ?? 0;
    return delay > 0
      ? { ...base, status: 'late', delay_days: delay }
      : { ...base, status: 'on_time', delay_days: 0 };
  }

  const today = businessCalendarDate(now.toISOString());
  const overdueBy = today ? daysBetweenCalendarDates(committed, today) ?? 0 : 0;
  return overdueBy > 0
    ? { ...base, status: 'overdue', delay_days: overdueBy }
    : { ...base, status: 'pending', delay_days: 0 };
}

// ---- Retraso atribuible: estudio vs. cliente ----
// Días "del cliente" = unión (sin contar dos veces el mismo día) de:
//  - los períodos en espera (de etapa o del proyecto) con causa del lado del cliente;
//  - los días que una etapa estuvo vencida con causa del lado del cliente
//    (desde su fecha estimada hasta que se completó).
// Se cuentan hasta la entrega (u hoy) y nunca superan el retraso total.
// El resto del retraso es atribuible al estudio.
interface HoldRow {
  stage_id: number | null;
  cause: string | null;
  started_at: string;
  ended_at: string | null;
}

interface DelayCauseStageRow {
  delay_cause?: string | null;
  estimated_end_date?: string | null;
  completed_date?: string | null;
  is_completed?: number | boolean | null;
}

export interface DelayAttribution {
  client_days: number;
  studio_days: number;
}

function addCalendarDays(days: Set<string>, from: string | null, toExclusive: string | null, limit: string) {
  if (!from || !toExclusive) return;
  const end = toExclusive < limit ? toExclusive : limit;
  let cursor = Date.parse(`${from}T00:00:00Z`);
  const endMillis = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(cursor) || !Number.isFinite(endMillis)) return;
  // Tope de seguridad (10 años) ante fechas mal cargadas.
  for (let i = 0; cursor < endMillis && i < 3660; i++, cursor += 86400000) {
    days.add(new Date(cursor).toISOString().slice(0, 10));
  }
}

function computeDelayAttribution(
  info: DeliveryInfo,
  holds: HoldRow[],
  stages: DelayCauseStageRow[],
  now: Date = new Date(),
): DelayAttribution | null {
  if ((info.status !== 'late' && info.status !== 'overdue') || info.delay_days <= 0) return null;
  const today = businessCalendarDate(now.toISOString()) as string;
  const limit = info.delivered_date ?? today;
  const clientDays = new Set<string>();
  holds
    .filter((hold) => hold.cause && CLIENT_SIDE_CAUSES.has(hold.cause))
    .forEach((hold) => addCalendarDays(clientDays, businessCalendarDate(hold.started_at), businessCalendarDate(hold.ended_at) ?? today, limit));
  stages
    .filter((stage) => stage.delay_cause && CLIENT_SIDE_CAUSES.has(stage.delay_cause) && stage.estimated_end_date)
    .forEach((stage) => addCalendarDays(
      clientDays,
      dateOnly(stage.estimated_end_date),
      stage.is_completed ? businessCalendarDate(stage.completed_date) : today,
      limit,
    ));
  const clientShare = Math.min(info.delay_days, clientDays.size);
  return { client_days: clientShare, studio_days: info.delay_days - clientShare };
}

function calendarDurationDays(startedAt: string | null | undefined, endedAt: string | null | undefined): number | null {
  const startedDate = businessCalendarDate(startedAt);
  const finishedDate = businessCalendarDate(endedAt || new Date().toISOString());
  if (!startedDate || !finishedDate) return null;
  const startedMillis = Date.parse(`${startedDate}T00:00:00Z`);
  const finishedMillis = Date.parse(`${finishedDate}T00:00:00Z`);
  if (!Number.isFinite(startedMillis) || !Number.isFinite(finishedMillis)) return null;
  return Math.max(0, Math.round((finishedMillis - startedMillis) / 86400000));
}

// Resumen anual de proyectos completados y actividad de la organización.
// Indicadores del Manual de Calidad, todos leídos del Resumen:
// - Objetivo 1.1: % de proyectos entregados a tiempo en el año (entrega real
//   vs. fecha comprometida; el cierre del cliente no cuenta).
// - Días promedio de retraso de los entregados tarde.
// - Objetivo 1.3 (denominador): proyectos completados en el año.
// - Fidelización B2B: clientes con más de 2 proyectos iniciados en el año.
// Filtros: año y, opcionalmente, tipo de trabajo (project_type).
const RECURRING_CLIENT_MIN_PROJECTS = 3; // "más de 2 proyectos"

const summaryDbAll = <T = any>(sql: string, params: unknown[]) => new Promise<T[]>((resolve, reject) => {
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve((rows || []) as T[])));
});

interface SummaryFilters {
  year: number;
  currentYear: number;
  projectType: string | null;
}

// Año pedido (o el actual en Argentina) y tipo de trabajo validado.
function parseSummaryFilters(query: Request['query']): SummaryFilters | { error: string } {
  const requestedYear = Number(query.year);
  const currentYear = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
  }).format(new Date()));
  const year = Number.isInteger(requestedYear) && requestedYear >= 1900 && requestedYear <= 3000
    ? requestedYear
    : currentYear;
  const projectType = query.project_type;
  if (projectType !== undefined && projectType !== '' && !isProjectType(projectType)) {
    return { error: 'Tipo de proyecto inválido' };
  }
  return { year, currentYear, projectType: isProjectType(projectType) ? projectType : null };
}

const projectYearExpression = (column: string) => `CASE WHEN length(${column}) = 10 THEN substr(${column}, 1, 4) ELSE strftime('%Y', datetime(${column}, '-3 hours')) END`;

apiRouter.get('/summary', async (req: Request, res: Response) => {
  const filters = parseSummaryFilters(req.query);
  if ('error' in filters) return res.status(400).json({ error: filters.error });
  try {
    res.json(await buildSummary(req.user!.organizationId, filters));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Error al calcular el resumen' });
  }
});

async function buildSummary(organizationId: number, { year, currentYear, projectType }: SummaryFilters) {
  const typeFilter = projectType ? ' AND p.project_type = ?' : '';
  const typeParams = projectType ? [projectType] : [];
  const yearExpression = projectYearExpression;

  const countsSql = `
    SELECT
      SUM(CASE WHEN ${yearExpression('p.created_at')} = ? THEN 1 ELSE 0 END) as created_count,
      SUM(CASE WHEN ${yearExpression('p.completed_date')} = ? THEN 1 ELSE 0 END) as completed_count
    FROM projects p
    WHERE p.organization_id = ?${typeFilter}
  `;
  const stagesSql = `
    SELECT
      s.name as stage_name,
      COALESCE(SUM(CASE
        WHEN sc.started_at IS NULL THEN 0
        ELSE MAX(0, CAST(ROUND(
          julianday(date(COALESCE(sc.ended_at, CURRENT_TIMESTAMP), '-3 hours'))
          - julianday(date(sc.started_at, '-3 hours'))
        ) AS INTEGER))
      END), 0) as total_days,
      COALESCE(SUM(CASE
        WHEN sc.ended_at IS NOT NULL
          AND sc.started_at IS NOT NULL
          AND sc.deadline_used IS NOT NULL
          AND date(sc.ended_at, '-3 hours') > date(sc.deadline_used, '-3 hours')
        THEN 1 ELSE 0
      END), 0) as delayed_cycles,
      MAX(COALESCE(s.counts_work_time, 1)) as counts_work_time,
      MAX(CASE WHEN s.stage_kind = 'control' THEN 1 ELSE 0 END) as is_control
    FROM projects p
    INNER JOIN stages s ON s.project_id = p.id
    LEFT JOIN stage_cycles sc ON sc.stage_id = s.id AND sc.project_id = p.id
    WHERE p.organization_id = ? AND ${yearExpression('p.completed_date')} = ?${typeFilter}
    GROUP BY s.name
    ORDER BY MIN(s.order_number), s.name
  `;
  const yearsSql = `
    SELECT DISTINCT year FROM (
      SELECT ${yearExpression('p.created_at')} as year FROM projects p WHERE p.organization_id = ?
      UNION
      SELECT ${yearExpression('p.completed_date')} as year FROM projects p WHERE p.organization_id = ?
    ) WHERE year IS NOT NULL ORDER BY year DESC
  `;
  // Entregas del año: proyectos cuya etapa de entrega se completó en `year`.
  const deliveryStagesSql = `
    SELECT p.id as project_id, p.deadline, p.committed_deadline, p.status, p.completed_date as project_completed_date,
           s.milestone, s.is_completed, s.completed_date, s.delay_cause, s.estimated_end_date
    FROM projects p
    INNER JOIN stages s ON s.project_id = p.id
    WHERE p.organization_id = ?${typeFilter}
  `;
  // Períodos de espera (de etapas y de proyectos paralizados).
  const holdsSql = `
    SELECT h.project_id, h.stage_id, h.cause, h.started_at, h.ended_at
    FROM stage_holds h
    INNER JOIN projects p ON p.id = h.project_id
    WHERE p.organization_id = ?${typeFilter}
  `;
  // Clientes con proyectos iniciados (creados) en el año.
  const clientsSql = `
    SELECT c.id, c.name, COUNT(p.id) as projects
    FROM projects p
    INNER JOIN clients c ON c.id = p.client_id
    WHERE p.organization_id = ? AND ${yearExpression('p.created_at')} = ?${typeFilter}
    GROUP BY c.id, c.name
    ORDER BY projects DESC, c.name
  `;

  {
    const [[counts], stages, deliveryRows, years, clients, holdRows] = await Promise.all([
      summaryDbAll(countsSql, [String(year), String(year), organizationId, ...typeParams]),
      summaryDbAll(stagesSql, [organizationId, String(year), ...typeParams]),
      summaryDbAll(deliveryStagesSql, [organizationId, ...typeParams]),
      summaryDbAll(yearsSql, [organizationId, organizationId]),
      summaryDbAll<{ id: number; name: string; projects: number }>(clientsSql, [organizationId, String(year), ...typeParams]),
      summaryDbAll<HoldRow & { project_id: number }>(holdsSql, [organizationId, ...typeParams]),
    ]);
    const holdsByProject = new Map<number, HoldRow[]>();
    holdRows.forEach((hold) => {
      const list = holdsByProject.get(hold.project_id) ?? [];
      list.push(hold);
      holdsByProject.set(hold.project_id, list);
    });

    const byProject = new Map<number, { project: any; stages: Array<DeliveryStageRow & DelayCauseStageRow> }>();
    deliveryRows.forEach((row) => {
      const entry = byProject.get(row.project_id) ?? {
        project: { deadline: row.deadline, committed_deadline: row.committed_deadline, status: row.status, completed_date: row.project_completed_date },
        stages: [],
      };
      entry.stages.push({
        milestone: row.milestone,
        is_completed: row.is_completed,
        completed_date: row.completed_date,
        delay_cause: row.delay_cause,
        estimated_end_date: row.estimated_end_date,
      } as DeliveryStageRow & DelayCauseStageRow);
      byProject.set(row.project_id, entry);
    });
    const deliveredThisYear = Array.from(byProject.entries())
      .map(([projectId, { project, stages: projectStages }]) => {
        const info = computeDeliveryInfo(project, projectStages);
        info.attribution = computeDelayAttribution(info, holdsByProject.get(projectId) ?? [], projectStages);
        return info;
      })
      .filter((info) => info.delivered_date?.startsWith(`${year}-`));
    const measured = deliveredThisYear.filter((info) => info.status === 'on_time' || info.status === 'late');
    const lateDeliveries = measured.filter((info) => info.status === 'late');
    const totalDelayDays = lateDeliveries.reduce((sum, info) => sum + info.delay_days, 0);
    const clientDelayDays = lateDeliveries.reduce((sum, info) => sum + (info.attribution?.client_days ?? 0), 0);
    // Días en espera dentro del año, por causa (sin causa = 'unspecified').
    const yearStart = `${year}-01-01`;
    const nextYearStart = `${year + 1}-01-01`;
    const today = businessCalendarDate(new Date().toISOString()) as string;
    const holdDaysByCause: Record<string, number> = {};
    holdRows.forEach((hold) => {
      const days = new Set<string>();
      const from = businessCalendarDate(hold.started_at);
      addCalendarDays(days, from && from > yearStart ? from : yearStart, businessCalendarDate(hold.ended_at) ?? today, nextYearStart);
      if (!from || days.size === 0) return;
      const key = hold.cause ?? 'unspecified';
      holdDaysByCause[key] = (holdDaysByCause[key] ?? 0) + days.size;
    });
    const recurringClients = clients
      .filter((client) => Number(client.projects) >= RECURRING_CLIENT_MIN_PROJECTS)
      .map((client) => ({ id: client.id, name: client.name, projects: Number(client.projects) }));

    const availableYears = Array.from(new Set([
      currentYear,
      ...years.map((row) => Number(row.year)).filter((value) => Number.isInteger(value)),
    ])).sort((a, b) => b - a);

    return {
      year,
      project_type: projectType,
      available_years: availableYears,
      projects_created: Number(counts?.created_count || 0),
      projects_completed: Number(counts?.completed_count || 0),
      stages: stages.map((stage) => ({
        stage_name: stage.stage_name,
        total_days: Number(stage.total_days || 0),
        delayed_cycles: Number(stage.delayed_cycles || 0),
        counts_work_time: Boolean(stage.counts_work_time),
        is_control: Boolean(stage.is_control),
      })),
      // Días de trabajo: solo las etapas que suman tiempo (excluye p. ej.
      // la espera del cierre del cliente).
      work_days: stages
        .filter((stage) => stage.counts_work_time)
        .reduce((sum, stage) => sum + Number(stage.total_days || 0), 0),
      deliveries: {
        delivered: deliveredThisYear.length,
        with_commitment: measured.length,
        late: lateDeliveries.length,
        on_time: measured.length - lateDeliveries.length,
        on_time_percentage: measured.length > 0 ? Math.round(((measured.length - lateDeliveries.length) / measured.length) * 100) : null,
        late_percentage: measured.length > 0 ? Math.round((lateDeliveries.length / measured.length) * 100) : null,
        total_delay_days: totalDelayDays,
        average_delay_days: lateDeliveries.length > 0 ? Math.round((totalDelayDays / lateDeliveries.length) * 10) / 10 : null,
        // Retraso separado por origen (cliente: Cliente, Falta de información,
        // Cambio de arquitectura; estudio: el resto).
        client_delay_days: clientDelayDays,
        studio_delay_days: totalDelayDays - clientDelayDays,
        client_delay_percentage: totalDelayDays > 0 ? Math.round((clientDelayDays / totalDelayDays) * 100) : null,
        studio_delay_percentage: totalDelayDays > 0 ? 100 - Math.round((clientDelayDays / totalDelayDays) * 100) : null,
      },
      hold_days_by_cause: holdDaysByCause,
      recurring_clients: {
        min_projects: RECURRING_CLIENT_MIN_PROJECTS,
        count: recurringClients.length,
        clients_with_projects: clients.length,
        clients: recurringClients,
      },
    };
  }
}

// ==================== EXPORTAR A EXCEL (evidencia para el SGC) ====================
// Un archivo .xlsx con las mediciones del año: indicadores del Resumen,
// proyectos (fechas, estados, retrasos), etapas, esperas y cambios de fecha.
// Proyectos incluidos: los activos en algún momento del año (creados hasta fin
// de año y no completados antes de que empiece).

const PROJECT_STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  paused: 'Paralizado',
  completed: 'Completado',
};
const PROJECT_TYPE_EXPORT_LABELS: Record<string, string> = {
  obra_nueva: 'Obra nueva',
  carteles: 'Carteles',
  reforma: 'Reforma',
};
const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  on_time: 'A tiempo',
  late: 'Tarde',
  pending: 'En plazo',
  overdue: 'Vencido sin entregar',
  no_commitment: 'Sin fecha comprometida',
};
const DELAY_CAUSE_EXPORT_LABELS: Record<string, string> = {
  client: 'Cliente',
  internal: 'Interna',
  missing_info: 'Falta de información',
  architecture_change: 'Cambio de arquitectura',
  other: 'Otra',
};
const causeLabel = (cause: string | null | undefined) => (cause ? DELAY_CAUSE_EXPORT_LABELS[cause] ?? cause : 'Sin causa');
const causeSide = (cause: string | null | undefined) => (cause && CLIENT_SIDE_CAUSES.has(cause) ? 'Cliente' : 'Estudio');

// AAAA-MM-DD -> fecha de Excel (sin hora, sin corrimiento de zona).
function excelDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return year && month && day ? new Date(Date.UTC(year, month - 1, day)) : null;
}

// Timestamp del backend -> "dd/mm/aaaa hh:mm" en hora de Argentina.
function argentinaDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const raw = String(value).trim();
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const parsed = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}Z`);
  if (!Number.isFinite(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(parsed);
}

type ExportColumn = { header: string; key: string; width?: number; date?: boolean };

apiRouter.get('/export/year', async (req: Request, res: Response) => {
  const filters = parseSummaryFilters(req.query);
  if ('error' in filters) return res.status(400).json({ error: filters.error });
  const organizationId = req.user!.organizationId;
  const { year, projectType } = filters;
  const typeFilter = projectType ? ' AND p.project_type = ?' : '';
  const scopeParams = [organizationId, String(year), String(year), ...(projectType ? [projectType] : [])];
  const activeInYear = `${projectYearExpression('p.created_at')} <= ? AND (p.completed_date IS NULL OR ${projectYearExpression('p.completed_date')} >= ?)`;

  try {
    const [summary, projects, stages, holds, changes, [organization], [exporter]] = await Promise.all([
      buildSummary(organizationId, filters),
      summaryDbAll(`
        SELECT p.*, c.name as client_name, u.name as responsible_name
        FROM projects p
        LEFT JOIN clients c ON c.id = p.client_id
        LEFT JOIN users u ON u.id = p.responsible_id
        WHERE p.organization_id = ? AND ${activeInYear}${typeFilter}
        ORDER BY p.created_at, p.id
      `, scopeParams),
      summaryDbAll(`
        SELECT s.*, u.name as responsible_name
        FROM stages s
        INNER JOIN projects p ON p.id = s.project_id
        LEFT JOIN users u ON u.id = s.responsible_id
        WHERE p.organization_id = ? AND ${activeInYear}${typeFilter}
        ORDER BY s.project_id, s.order_number
      `, scopeParams),
      summaryDbAll(`
        SELECT h.*, s.name as stage_name, su.name as started_by_name, eu.name as ended_by_name
        FROM stage_holds h
        INNER JOIN projects p ON p.id = h.project_id
        LEFT JOIN stages s ON s.id = h.stage_id
        LEFT JOIN users su ON su.id = h.started_by
        LEFT JOIN users eu ON eu.id = h.ended_by
        WHERE p.organization_id = ? AND ${activeInYear}${typeFilter}
        ORDER BY h.started_at
      `, scopeParams),
      summaryDbAll(`
        SELECT dc.*, u.name as changed_by_name
        FROM project_deadline_changes dc
        INNER JOIN projects p ON p.id = dc.project_id
        LEFT JOIN users u ON u.id = dc.changed_by
        WHERE p.organization_id = ? AND ${activeInYear}${typeFilter}
        ORDER BY dc.changed_at, dc.id
      `, scopeParams),
      summaryDbAll('SELECT name FROM organizations WHERE id = ?', [organizationId]),
      summaryDbAll('SELECT name FROM users WHERE id = ?', [req.user!.userId]),
    ]);

    const projectNames = new Map<number, string>(projects.map((project) => [project.id, project.name]));
    const stagesByProject = new Map<number, any[]>();
    stages.forEach((stage) => stagesByProject.set(stage.project_id, [...(stagesByProject.get(stage.project_id) ?? []), stage]));
    const holdsByProject = new Map<number, any[]>();
    holds.forEach((hold) => holdsByProject.set(hold.project_id, [...(holdsByProject.get(hold.project_id) ?? []), hold]));
    const changesByProject = new Map<number, number>();
    changes.forEach((change) => changesByProject.set(change.project_id, (changesByProject.get(change.project_id) ?? 0) + 1));
    const holdDays = (hold: any) => calendarDurationDays(hold.started_at, hold.ended_at) ?? 0;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MasGestión';
    workbook.created = new Date();
    const addSheet = (name: string, columns: ExportColumn[], rows: Array<Record<string, unknown>>) => {
      const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
      sheet.columns = columns.map((column) => ({
        header: column.header,
        key: column.key,
        width: column.width ?? Math.max(12, column.header.length + 2),
        ...(column.date ? { style: { numFmt: 'dd/mm/yyyy' } } : {}),
      }));
      sheet.getRow(1).font = { bold: true };
      sheet.addRows(rows);
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    };

    // 1) Indicadores (los mismos del Resumen)
    const deliveries = summary.deliveries;
    const indicators = workbook.addWorksheet('Indicadores');
    indicators.columns = [{ width: 52 }, { width: 22 }, { width: 80 }];
    indicators.addRows([
      ['Exportación de mediciones — MasGestión'],
      ['Organización', organization?.name ?? ''],
      ['Año', year],
      ['Tipo de trabajo', projectType ? PROJECT_TYPE_EXPORT_LABELS[projectType] ?? projectType : 'Todos'],
      ['Exportado por', exporter?.name ?? ''],
      ['Fecha de exportación', argentinaDateTime(new Date().toISOString())],
      [],
      ['Indicador', 'Valor', 'Detalle'],
      ['Entregados a tiempo (objetivo 1.1)', deliveries.on_time_percentage != null ? `${deliveries.on_time_percentage}%` : '—', `${deliveries.on_time} de ${deliveries.with_commitment} entregas con fecha comprometida (no incluye el cierre del cliente)`],
      ['Entregas tarde', deliveries.late, ''],
      ['Retraso promedio (días)', deliveries.average_delay_days ?? '—', 'Promedio de los proyectos entregados tarde'],
      ['Días de retraso totales', deliveries.total_delay_days, ''],
      ['Retraso atribuible al estudio (días)', deliveries.studio_delay_days, deliveries.studio_delay_percentage != null ? `${deliveries.studio_delay_percentage}%` : ''],
      ['Retraso atribuible al cliente (días)', deliveries.client_delay_days, deliveries.client_delay_percentage != null ? `${deliveries.client_delay_percentage}% · causas Cliente, Falta de información y Cambio de arquitectura` : ''],
      ['Proyectos completados (denominador objetivo 1.3)', summary.projects_completed, ''],
      ['Proyectos creados', summary.projects_created, ''],
      ['Clientes recurrentes (más de 2 proyectos en el año)', summary.recurring_clients.count, summary.recurring_clients.clients.map((client) => `${client.name} (${client.projects})`).join(', ')],
      ['Días de trabajo (etapas que suman tiempo)', summary.work_days, ''],
      [],
      ['Días en espera por causa', 'Días', 'Atribuible a'],
      ...Object.entries(summary.hold_days_by_cause).map(([cause, days]) => [cause === 'unspecified' ? 'Sin causa' : causeLabel(cause), days, cause === 'unspecified' ? 'Estudio' : causeSide(cause)]),
      [],
      ['El retraso se mide contra la fecha comprometida original o la última acordada con el cliente (ver hoja "Cambios de fecha").'],
    ]);
    indicators.getRow(1).font = { bold: true, size: 14 };
    indicators.eachRow((row) => {
      const first = String(row.getCell(1).value ?? '');
      if (first === 'Indicador' || first === 'Días en espera por causa') row.font = { bold: true };
    });

    // 2) Proyectos
    addSheet('Proyectos', [
      { header: 'ID', key: 'id', width: 7 },
      { header: 'Proyecto', key: 'name', width: 34 },
      { header: 'Tipo', key: 'type' },
      { header: 'Cliente', key: 'client', width: 24 },
      { header: 'Responsable', key: 'responsible', width: 20 },
      { header: 'Estado', key: 'status' },
      { header: 'Creado', key: 'created', date: true },
      { header: 'Fecha comprometida (indicador)', key: 'committed', date: true, width: 16 },
      { header: 'Fecha vigente', key: 'current', date: true },
      { header: 'Cambios de fecha', key: 'changes' },
      { header: 'Entregada', key: 'delivered', date: true },
      { header: 'Cerrada', key: 'closed', date: true },
      { header: 'Resultado de la entrega', key: 'delivery_status', width: 22 },
      { header: 'Días de retraso', key: 'delay' },
      { header: 'Retraso estudio (días)', key: 'studio' },
      { header: 'Retraso cliente (días)', key: 'client_delay' },
      { header: 'Días en espera', key: 'hold_days' },
      { header: 'Completado', key: 'completed', date: true },
      { header: 'Etapas completadas', key: 'stages_done' },
      { header: 'Etapas totales', key: 'stages_total' },
      { header: 'Obligatorias pendientes', key: 'required_pending', width: 30 },
    ], projects.map((project) => {
      const projectStages = stagesByProject.get(project.id) ?? [];
      const projectHolds = holdsByProject.get(project.id) ?? [];
      const info = computeDeliveryInfo(project, projectStages);
      const attribution = computeDelayAttribution(info, projectHolds, projectStages);
      return {
        id: project.id,
        name: project.name,
        type: project.project_type ? PROJECT_TYPE_EXPORT_LABELS[project.project_type] ?? project.project_type : '',
        client: project.client_name ?? 'Sin cliente',
        responsible: project.responsible_name ?? 'Sin responsable',
        status: PROJECT_STATUS_LABELS[project.status] ?? project.status,
        created: excelDate(businessCalendarDate(project.created_at)),
        committed: excelDate(info.committed_date),
        current: excelDate(info.current_deadline),
        changes: changesByProject.get(project.id) ?? 0,
        delivered: excelDate(info.delivered_date),
        closed: excelDate(info.closed_date),
        delivery_status: DELIVERY_STATUS_LABELS[info.status],
        delay: info.delay_days,
        studio: attribution?.studio_days ?? 0,
        client_delay: attribution?.client_days ?? 0,
        hold_days: projectHolds.reduce((sum, hold) => sum + holdDays(hold), 0),
        completed: excelDate(businessCalendarDate(project.completed_date)),
        stages_done: projectStages.filter((stage) => stage.is_completed).length,
        stages_total: projectStages.length,
        required_pending: projectStages
          .filter((stage) => stage.is_required && !stage.is_completed && !stage.not_applicable)
          .map((stage) => stage.name).join(', '),
      };
    }));

    // 3) Etapas
    const today = businessCalendarDate(new Date().toISOString()) as string;
    addSheet('Etapas', [
      { header: 'Proyecto', key: 'project', width: 30 },
      { header: 'Orden', key: 'order', width: 8 },
      { header: 'Etapa', key: 'name', width: 30 },
      { header: 'Tipo', key: 'kind' },
      { header: 'Obligatoria', key: 'required' },
      { header: 'Responsable', key: 'responsible', width: 20 },
      { header: 'Estado', key: 'status' },
      { header: 'Inicio', key: 'start', date: true },
      { header: 'Fin estimado', key: 'estimated', date: true },
      { header: 'Completada', key: 'completed', date: true },
      { header: 'Superó la fecha estimada', key: 'overdue' },
      { header: 'Causa del retraso', key: 'delay_cause', width: 22 },
      { header: 'Atribuible a', key: 'delay_side' },
      { header: 'Nota de la causa', key: 'delay_note', width: 30 },
      { header: 'Días en espera', key: 'hold_days' },
      { header: 'Motivo "No aplica"', key: 'na_reason', width: 30 },
    ], stages.map((stage) => {
      const stageHolds = (holdsByProject.get(stage.project_id) ?? []).filter((hold) => hold.stage_id === stage.id);
      const estimated = dateOnly(stage.estimated_end_date);
      const end = stage.is_completed ? businessCalendarDate(stage.completed_date) : today;
      const overdue = Boolean(estimated && end && end > estimated && !stage.not_applicable);
      const onHold = stageHolds.some((hold) => !hold.ended_at);
      return {
        project: projectNames.get(stage.project_id) ?? '',
        order: stage.order_number,
        name: stage.name,
        kind: stage.stage_kind === 'control' ? 'Control' : 'Ejecución',
        required: stage.is_required ? 'Sí' : 'No',
        responsible: stage.responsible_name ?? '',
        status: stage.is_completed ? 'Completada' : stage.not_applicable ? 'No aplica' : onHold ? 'En espera' : stage.start_date ? 'En curso' : 'Pendiente',
        start: excelDate(businessCalendarDate(stage.start_date)),
        estimated: excelDate(estimated),
        completed: excelDate(businessCalendarDate(stage.completed_date)),
        overdue: overdue ? 'Sí' : 'No',
        delay_cause: stage.delay_cause ? causeLabel(stage.delay_cause) : overdue ? 'Sin indicar' : '',
        delay_side: stage.delay_cause ? causeSide(stage.delay_cause) : '',
        delay_note: stage.delay_cause_note ?? '',
        hold_days: stageHolds.reduce((sum, hold) => sum + holdDays(hold), 0),
        na_reason: stage.not_applicable ? stage.not_applicable_reason ?? '' : '',
      };
    }));

    // 4) Esperas (etapas en espera y proyectos paralizados)
    addSheet('Esperas', [
      { header: 'Proyecto', key: 'project', width: 30 },
      { header: 'Etapa', key: 'stage', width: 30 },
      { header: 'Causa', key: 'cause', width: 22 },
      { header: 'Atribuible a', key: 'side' },
      { header: 'Nota', key: 'note', width: 30 },
      { header: 'Desde', key: 'from', width: 18 },
      { header: 'Hasta', key: 'to', width: 18 },
      { header: 'Días', key: 'days', width: 8 },
      { header: 'Puesta por', key: 'by', width: 20 },
      { header: 'Reanudada por', key: 'ended_by', width: 20 },
    ], holds.map((hold) => ({
      project: projectNames.get(hold.project_id) ?? '',
      stage: hold.stage_id ? hold.stage_name ?? '' : 'Proyecto paralizado',
      cause: causeLabel(hold.cause),
      side: causeSide(hold.cause),
      note: hold.note ?? '',
      from: argentinaDateTime(hold.started_at),
      to: hold.ended_at ? argentinaDateTime(hold.ended_at) : 'Sigue en espera',
      days: holdDays(hold),
      by: hold.started_by_name ?? '',
      ended_by: hold.ended_by_name ?? '',
    })));

    // 5) Cambios de fecha comprometida
    addSheet('Cambios de fecha', [
      { header: 'Proyecto', key: 'project', width: 30 },
      { header: 'Fecha anterior', key: 'old', date: true, width: 14 },
      { header: 'Fecha nueva', key: 'new', date: true, width: 14 },
      { header: 'Acordado con el cliente', key: 'agreed', width: 14 },
      { header: 'Motivo', key: 'reason', width: 40 },
      { header: 'Usuario', key: 'by', width: 20 },
      { header: 'Fecha del cambio', key: 'at', width: 18 },
    ], changes.map((change) => ({
      project: projectNames.get(change.project_id) ?? '',
      old: excelDate(dateOnly(change.old_deadline)),
      new: excelDate(dateOnly(change.new_deadline)),
      agreed: change.agreed_with_client ? 'Sí' : 'No',
      reason: change.reason ?? '',
      by: change.changed_by_name ?? '',
      at: argentinaDateTime(change.changed_at),
    })));

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `masgestion-mediciones-${year}${projectType ? `-${projectType}` : ''}.xlsx`;
    logAudit({
      organizationId,
      userId: req.user!.userId,
      action: 'EXPORT',
      entityType: 'summary',
      details: JSON.stringify({ year, project_type: projectType, projects: projects.length }),
      ipAddress: req.ip,
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(Buffer.from(buffer as ArrayBuffer));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Error al exportar' });
  }
});

// ==================== AUDIT LOGS ENDPOINTS ====================

// Obtener logs de auditoría con filtros
apiRouter.get('/audit-logs', (req: Request, res: Response) => {
  const { user_id, entity_type, entity_id, action, from_date, to_date, limit = 100 } = req.query;
  const organizationId = req.user!.organizationId;

  let sql = `
    SELECT 
      a.*,
      u.name as user_name
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    WHERE a.organization_id = ?
  `;
  const params: any[] = [organizationId];

  if (user_id) {
    sql += ' AND a.user_id = ?';
    params.push(user_id);
  }

  if (entity_type) {
    sql += ' AND a.entity_type = ?';
    params.push(entity_type);
  }

  if (entity_id) {
    sql += ' AND a.entity_id = ?';
    params.push(entity_id);
  }

  if (action) {
    sql += ' AND a.action = ?';
    params.push(action);
  }

  if (from_date) {
    sql += ' AND a.created_at >= ?';
    params.push(from_date);
  }

  if (to_date) {
    sql += ' AND a.created_at <= ?';
    params.push(to_date);
  }

  sql += ' ORDER BY a.created_at DESC LIMIT ?';
  params.push(Number(limit));

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Obtener estadísticas de auditoría
apiRouter.get('/audit-logs/stats', (req: Request, res: Response) => {
  const organizationId = req.user!.organizationId;

  const sql = `
    SELECT 
      COUNT(*) as total_actions,
      COUNT(DISTINCT user_id) as unique_users,
      COUNT(DISTINCT DATE(created_at)) as active_days,
      entity_type,
      action,
      COUNT(*) as count
    FROM audit_logs
    WHERE organization_id = ?
    GROUP BY entity_type, action
    ORDER BY count DESC
  `;

  db.all(sql, [organizationId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// ==================== CLIENTS ENDPOINTS ====================

// GET all clients
apiRouter.get('/clients', (req: Request, res: Response) => {
  const organizationId = req.user!.organizationId;
  db.all('SELECT id, organization_id, name, preferences, created_at FROM clients WHERE organization_id = ? ORDER BY name', [organizationId], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// GET single client
apiRouter.get('/clients/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  db.get('SELECT id, organization_id, name, preferences, created_at FROM clients WHERE id = ?', [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Cliente no encontrado' });
      return;
    }
    res.json(row);
  });
});

// POST create client
apiRouter.post('/clients', (req: Request, res: Response) => {
  const { name, preferences } = req.body;
  const organizationId = req.user!.organizationId;
  
  if (!name) {
    res.status(400).json({ error: 'El nombre del cliente es requerido' });
    return;
  }

  db.run(
    'INSERT INTO clients (organization_id, name, preferences) VALUES (?, ?, ?)',
    [organizationId, name, preferences || null],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      const clientId = this.lastID;
      
      logAudit({
        organizationId,
        userId: req.user!.userId,
        action: 'CREATE',
        entityType: 'client',
        entityId: clientId,
        details: JSON.stringify({ name, preferences }),
        ipAddress: req.ip
      });
      
      res.status(201).json({ id: clientId, name, preferences });
    }
  );
});

// PUT update client
apiRouter.put('/clients/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, preferences } = req.body;
  const organizationId = req.user!.organizationId;

  db.run(
    'UPDATE clients SET name = ?, preferences = ? WHERE id = ?',
    [name, preferences, id],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: 'Cliente no encontrado' });
        return;
      }
      
      logAudit({
        organizationId,
        userId: req.user!.userId,
        action: 'UPDATE',
        entityType: 'client',
        entityId: Number(id),
        details: JSON.stringify({ name, preferences }),
        ipAddress: req.ip
      });
      
      res.json({ id, name, preferences });
    }
  );
});

// DELETE client
apiRouter.delete('/clients/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const organizationId = req.user!.organizationId;
  
  db.run('DELETE FROM clients WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'Cliente no encontrado' });
      return;
    }
    
    logAudit({
      organizationId,
      userId: req.user!.userId,
      action: 'DELETE',
      entityType: 'client',
      entityId: Number(id),
      ipAddress: req.ip
    });
    
    res.json({ message: 'Cliente eliminado correctamente' });
  });
});

// ==================== STAGE TEMPLATES ENDPOINTS ====================

// GET all stage templates
apiRouter.get('/stage-templates', (req: Request, res: Response) => {
  const organizationId = req.user!.organizationId;
  const { project_type } = req.query;
  if (project_type !== undefined && !isProjectType(project_type)) {
    res.status(400).json({ error: 'Tipo de proyecto inválido' });
    return;
  }
  const sql = `
    SELECT st.*, u.name as default_responsible_name
    FROM stage_templates st
    LEFT JOIN users u ON st.default_responsible_id = u.id
    WHERE st.organization_id = ?${project_type ? ' AND st.project_type = ?' : ''}
    ORDER BY st.order_number
  `;
  const params: any[] = project_type ? [organizationId, project_type] : [organizationId];

  db.all(sql, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// GET single stage template
apiRouter.get('/stage-templates/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const sql = `
    SELECT st.*, u.name as default_responsible_name 
    FROM stage_templates st
    LEFT JOIN users u ON st.default_responsible_id = u.id
    WHERE st.id = ?
  `;
  
  db.get(sql, [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Plantilla de etapa no encontrada' });
      return;
    }
    res.json(row);
  });
});

// POST create stage template
apiRouter.post('/stage-templates', (req: Request, res: Response) => {
  const { name, order_number, default_responsible_id, estimated_duration_days, project_type } = req.body;
  const organizationId = req.user!.organizationId;

  if (!name || order_number === undefined) {
    res.status(400).json({ error: 'El nombre y el orden son requeridos' });
    return;
  }
  if (!isProjectType(project_type)) {
    res.status(400).json({ error: 'El tipo de proyecto es requerido (obra_nueva, carteles o reforma)' });
    return;
  }

  const attributes = parseStageAttributes(req.body);
  if (attributes.error) {
    res.status(400).json({ error: attributes.error });
    return;
  }
  const attrs = {
    stage_kind: 'execution',
    milestone: null as string | null,
    is_required: 0,
    // Las etapas de control no suman tiempo de trabajo salvo que se indique.
    counts_work_time: attributes.values.stage_kind === 'control' ? 0 : 1,
    ...attributes.values,
  };

  db.run(
    'INSERT INTO stage_templates (organization_id, name, order_number, default_responsible_id, estimated_duration_days, project_type, stage_kind, milestone, is_required, counts_work_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [organizationId, name, order_number, default_responsible_id || null, estimated_duration_days || null, project_type, attrs.stage_kind, attrs.milestone, attrs.is_required, attrs.counts_work_time],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      const createdId = this.lastID;
      const respond = () => res.status(201).json({
        ...attrs,
        id: createdId,
        name,
        order_number,
        default_responsible_id,
        estimated_duration_days,
        project_type,
      });
      if (!attrs.milestone) return respond();
      clearMilestoneFromOtherTemplates(createdId, (clearErr) => {
        if (clearErr) return res.status(500).json({ error: clearErr.message });
        respond();
      });
    }
  );
});

// Reordenar plantillas de etapas
// DEBE estar antes de /stage-templates/:id para evitar conflictos de ruta
apiRouter.put('/stage-templates/reorder', (req: Request, res: Response) => {
  const { templates } = req.body;

  if (!templates || !Array.isArray(templates)) {
    return res.status(400).json({ error: 'Se requiere un array de plantillas' });
  }

  // Actualizar el order_number de cada plantilla (solo de esta organización)
  const organizationId = req.user!.organizationId;
  const stmt = db.prepare('UPDATE stage_templates SET order_number = ? WHERE id = ? AND organization_id = ?');

  try {
    templates.forEach((template: { id: number; order_number: number }) => {
      stmt.run(template.order_number, template.id, organizationId);
    });
    stmt.finalize();
    res.json({ message: 'Plantillas reordenadas exitosamente' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update stage template
apiRouter.put('/stage-templates/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, order_number, default_responsible_id, estimated_duration_days } = req.body;

  console.log('Update stage template request:', { id, name, order_number, default_responsible_id, estimated_duration_days });

  // Construir la consulta dinámicamente para permitir null
  const updates: string[] = [];
  const values: any[] = [];

  if (name !== undefined) {
    updates.push('name = ?');
    values.push(name);
  }
  if (order_number !== undefined) {
    updates.push('order_number = ?');
    values.push(order_number);
  }
  if (default_responsible_id !== undefined) {
    updates.push('default_responsible_id = ?');
    values.push(default_responsible_id);
  }
  if (estimated_duration_days !== undefined) {
    updates.push('estimated_duration_days = ?');
    values.push(estimated_duration_days);
  }
  const attributes = parseStageAttributes(req.body);
  if (attributes.error) {
    res.status(400).json({ error: attributes.error });
    return;
  }
  Object.entries(attributes.values).forEach(([column, value]) => {
    updates.push(`${column} = ?`);
    values.push(value);
  });

  if (updates.length === 0) {
    res.status(400).json({ error: 'No hay campos para actualizar' });
    return;
  }

  // Solo plantillas de la propia organización.
  values.push(id, req.user!.organizationId);

  db.run(
    `UPDATE stage_templates SET ${updates.join(', ')} WHERE id = ? AND organization_id = ?`,
    values,
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: 'Plantilla de etapa no encontrada' });
        return;
      }

      // Devolver la plantilla actualizada
      const respond = () => db.get('SELECT * FROM stage_templates WHERE id = ?', [id], (err, row) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json(row);
      });
      // "Obligatoria" también rige para los proyectos en curso (no completados)
      // que tienen esta etapa; los completados quedan como estaban.
      const propagateRequired = (next: () => void) => {
        if (attributes.values.is_required === undefined) return next();
        db.run(
          `UPDATE stages SET is_required = ?
           WHERE template_id = ? AND project_id IN (SELECT id FROM projects WHERE organization_id = ? AND status != 'completed')`,
          [attributes.values.is_required, id, req.user!.organizationId],
          (propagateErr) => {
            if (propagateErr) return res.status(500).json({ error: propagateErr.message });
            next();
          }
        );
      };
      propagateRequired(() => {
        if (!attributes.values.milestone) return respond();
        clearMilestoneFromOtherTemplates(Number(id), (clearErr) => {
          if (clearErr) return res.status(500).json({ error: clearErr.message });
          respond();
        });
      });
    }
  );
});

// DELETE stage template
apiRouter.delete('/stage-templates/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  
  db.run('DELETE FROM stage_templates WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'Plantilla de etapa no encontrada' });
      return;
    }
    res.json({ message: 'Plantilla de etapa eliminada correctamente' });
  });
});

// ==================== PROJECTS ENDPOINTS ====================

// Crear un nuevo proyecto
apiRouter.post('/projects', (req: Request, res: Response) => {
  const { name, description, contact, client_id, responsible_id, deadline, project_type } = req.body;
  const organizationId = req.user!.organizationId;

  if (!name) {
    return res.status(400).json({ error: 'El nombre del proyecto es requerido' });
  }
  if (!isProjectType(project_type)) {
    return res.status(400).json({ error: 'El tipo de proyecto es requerido (obra_nueva, carteles o reforma)' });
  }

  const normalizedContact = typeof contact === 'string' ? contact.trim() || null : null;
  const sql = 'INSERT INTO projects (organization_id, name, description, contact, client_id, responsible_id, deadline, project_type, committed_deadline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
  db.run(sql, [organizationId, name, description || null, normalizedContact, client_id || null, responsible_id || null, deadline || null, project_type, deadline || null], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    // Si hay plantillas de etapas de ESTA organización, crear las etapas iniciales
    const projectId = this.lastID;

    const finishSuccess = () => {
      logAudit({
        organizationId,
        userId: req.user!.userId,
        action: 'CREATE',
        entityType: 'project',
        entityId: projectId,
        projectName: name,
        details: JSON.stringify({ name, description, contact: normalizedContact, client_id, responsible_id, deadline, project_type }),
        ipAddress: req.ip
      });

      res.status(201).json({
        id: projectId,
        name,
        description,
        contact: normalizedContact,
        client_id,
        deadline,
        project_type,
        message: 'Proyecto creado exitosamente'
      });
    };

    // Solo las etapas predefinidas del tipo de este proyecto.
    db.all('SELECT * FROM stage_templates WHERE organization_id = ? AND project_type = ? ORDER BY order_number', [organizationId, project_type], (err, templates: any[]) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!templates || templates.length === 0) {
        finishSuccess();
        return;
      }

      const insertStage = db.prepare(
        'INSERT INTO stages (project_id, template_id, name, responsible_id, order_number, estimated_end_date, start_date, stage_kind, milestone, is_required, counts_work_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      let stageError: Error | null = null;
      let done = 0;
      const total = templates.length;

      templates.forEach((template, index) => {
        let estimatedEndDate = null;
        let startDate = null;
        
        // La primera etapa comienza inmediatamente
        if (index === 0) {
          startDate = new Date().toISOString();
        }
        
        // La primera etapa recibe su fecha límite estimada por defecto
        // contando días hábiles desde hoy; las siguientes quedan sin fecha
        // límite hasta que se inicien (se calcula en /stages/:id/start).
        if (index === 0 && template.estimated_duration_days) {
          estimatedEndDate = addBusinessDays(new Date(), template.estimated_duration_days).toISOString();
        }
        
        insertStage.run([
          projectId,
          template.id,
          template.name,
          template.default_responsible_id,
          template.order_number,
          estimatedEndDate,
          startDate,
          template.stage_kind ?? 'execution',
          template.milestone ?? null,
          template.is_required ? 1 : 0,
          template.counts_work_time === 0 ? 0 : 1,
        ], function (runErr) {
          if (runErr && !stageError) stageError = runErr;
          done += 1;
          if (done !== total) return;
          insertStage.finalize();
          if (stageError) {
            // Rollback: un proyecto sin sus etapas no debe quedar creado.
            db.run('DELETE FROM projects WHERE id = ?', [projectId], () => {
              res.status(500).json({ error: stageError!.message });
            });
            return;
          }
          finishSuccess();
        });
      });
    });
  });
});

// Obtener todos los proyectos con filtros
apiRouter.get('/projects', (req: Request, res: Response) => {
  const { name, has_completed_stages, has_pending_stages, status } = req.query;
  const organizationId = req.user!.organizationId;

  let sql = `
    SELECT 
      p.*,
      c.name as client_name,
      u.name as responsible_name,
      COUNT(DISTINCT s.id) as total_stages,
      COUNT(DISTINCT CASE WHEN s.is_completed = 1 THEN s.id END) as completed_stages,
      (SELECT name FROM stages WHERE project_id = p.id AND is_completed = 0 ORDER BY order_number LIMIT 1) as current_stage
    FROM projects p
    LEFT JOIN clients c ON p.client_id = c.id
    LEFT JOIN users u ON p.responsible_id = u.id
    LEFT JOIN stages s ON p.id = s.project_id
    WHERE p.organization_id = ?
  `;
  const params: any[] = [organizationId];

  if (name) {
    sql += ' AND p.name LIKE ?';
    params.push(`%${name}%`);
  }

  if (status) {
    sql += ' AND p.status = ?';
    params.push(status);
  } else {
    // Por defecto, solo mostrar proyectos activos (no completados ni paralizados)
    sql += ' AND p.status = ?';
    params.push('active');
  }

  sql += ' GROUP BY p.id';

  if (has_completed_stages === 'true') {
    sql += ' HAVING completed_stages > 0';
  }

  if (has_pending_stages === 'true') {
    sql += ' HAVING (total_stages - completed_stages) > 0';
  }

  db.all(sql, params, (err, rows: any[]) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    // Adjuntar las etiquetas de cada proyecto sin alterar el GROUP BY/HAVING.
    const projectIds = rows.map((row) => row.id);
    if (projectIds.length === 0) {
      return res.json(rows);
    }

    const tagsSql = `
      SELECT pta.project_id, t.id, t.name, t.color
      FROM project_tag_assignments pta
      INNER JOIN project_tag_options t ON t.id = pta.project_tag_id
      WHERE pta.project_id IN (${projectIds.map(() => '?').join(',')})
      ORDER BY t.name
    `;

    db.all(tagsSql, projectIds, (tagErr, tagRows: any[]) => {
      if (tagErr) {
        console.error('Error fetching project tags:', tagErr);
        return res.json(rows.map((row) => ({ ...row, tags: [] })));
      }

      const tagsByProject = new Map<number, any[]>();
      tagRows.forEach((tagRow) => {
        const list = tagsByProject.get(tagRow.project_id) ?? [];
        list.push({ id: tagRow.id, name: tagRow.name, color: tagRow.color });
        tagsByProject.set(tagRow.project_id, list);
      });

      const result = rows.map((row) => ({
        ...row,
        tags: tagsByProject.get(row.id) ?? [],
      }));
      res.json(result);
    });
  });
});

// Obtener un proyecto por ID con sus etapas
apiRouter.get('/projects/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  const projectSql = `
    SELECT p.*, c.name as client_name, u.name as responsible_name 
    FROM projects p
    LEFT JOIN clients c ON p.client_id = c.id
    LEFT JOIN users u ON p.responsible_id = u.id
    WHERE p.id = ?
  `;
  
  db.get(projectSql, [id], (err, project) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    const stagesSql = `
      SELECT 
        s.*,
        p.client_id,
        c.name as client_name,
        u.name as responsible_name,
        u.account_email as responsible_email,
        u.role as responsible_role,
        nau.name as not_applicable_by_name,
        dcu.name as delay_cause_by_name
      FROM stages s
      INNER JOIN projects p ON s.project_id = p.id
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN users u ON s.responsible_id = u.id
      LEFT JOIN users nau ON s.not_applicable_by = nau.id
      LEFT JOIN users dcu ON s.delay_cause_by = dcu.id
      WHERE s.project_id = ?
      ORDER BY s.order_number
    `;

    db.all(stagesSql, [id], (err, stages: any[]) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Para cada stage, obtener tags y comentarios
      const stagePromises = stages.map((stage) => {
        return new Promise((resolve) => {
          // Obtener tags con colores
          const tagsSql = `
            SELECT t.id, t.name, t.color
            FROM tags t
            INNER JOIN stage_tags st ON t.id = st.tag_id
            WHERE st.stage_id = ?
          `;
          
          // Obtener últimos 3 comentarios
          const commentsSql = `
            SELECT c.id, c.content, c.created_at, u.name as author, u.id as user_id
            FROM comments c
            LEFT JOIN users u ON c.user_id = u.id
            WHERE c.stage_id = ?
            ORDER BY c.created_at DESC
            LIMIT 3
          `;
          
          // Obtener conteo total de comentarios
          const commentsCountSql = `
            SELECT COUNT(*) as total
            FROM comments
            WHERE stage_id = ?
          `;
          
          db.all(tagsSql, [stage.id], (tagErr, tags) => {
            if (tagErr) {
              console.error('Error fetching tags:', tagErr);
              tags = [];
            }
            
            db.all(commentsSql, [stage.id], (commentErr, comments) => {
              if (commentErr) {
                console.error('Error fetching comments:', commentErr);
                comments = [];
              }
              
              db.get(commentsCountSql, [stage.id], (countErr, countResult: any) => {
                const comments_count = countErr ? 0 : (countResult?.total || 0);
                
                resolve({ 
                  ...stage, 
                  tags: tags || [],
                  recent_comments: comments || [],
                  comments_count
                });
              });
            });
          });
        });
      });
      
      Promise.all(stagePromises).then((parsedStages) => {
        // Obtener etiquetas a nivel de proyecto
        const projectTagsSql = `
          SELECT t.id, t.name, t.color
          FROM project_tag_options t
          INNER JOIN project_tag_assignments pta ON t.id = pta.project_tag_id
          WHERE pta.project_id = ?
          ORDER BY t.name
        `;

        db.all(projectTagsSql, [id], (projTagErr, projectTags: any[]) => {
          if (projTagErr) {
            console.error('Error fetching project tags:', projTagErr);
            projectTags = [];
          }

          const holdsSql = `
            SELECT h.id, h.stage_id, h.cause, h.note, h.started_at, h.ended_at,
                   su.name as started_by_name, eu.name as ended_by_name
            FROM stage_holds h
            LEFT JOIN users su ON su.id = h.started_by
            LEFT JOIN users eu ON eu.id = h.ended_by
            WHERE h.project_id = ?
            ORDER BY h.started_at
          `;
          db.all(holdsSql, [id], (holdsErr, holdRows: any[]) => {
            if (holdsErr) console.error('Error fetching holds:', holdsErr);
            const holds = (holdsErr ? [] : holdRows).map((hold) => ({
              ...hold,
              days: calendarDurationDays(hold.started_at, hold.ended_at) ?? 0,
            }));
            const delivery = computeDeliveryInfo(project as any, stages);
            delivery.attribution = computeDelayAttribution(delivery, holds, stages);
            const changesSql = `
              SELECT dc.id, dc.old_deadline, dc.new_deadline, dc.reason, dc.agreed_with_client, dc.changed_at, u.name as changed_by_name
              FROM project_deadline_changes dc
              LEFT JOIN users u ON u.id = dc.changed_by
              WHERE dc.project_id = ?
              ORDER BY dc.changed_at, dc.id
            `;
            db.all(changesSql, [id], (changesErr, changeRows: any[]) => {
            if (changesErr) console.error('Error fetching deadline changes:', changesErr);

            res.json({
              ...project,
              stages: (parsedStages as any[]).map((stage) => {
                const stageHolds = holds.filter((hold) => hold.stage_id === stage.id);
                return {
                  ...stage,
                  holds: stageHolds,
                  open_hold: stageHolds.find((hold) => !hold.ended_at) ?? null,
                  hold_days: stageHolds.reduce((sum, hold) => sum + hold.days, 0),
                };
              }),
              tags: projectTags || [],
              project_holds: holds.filter((hold) => hold.stage_id == null),
              deadline_changes: (changesErr ? [] : changeRows).map((change) => ({
                ...change,
                old_deadline: dateOnly(change.old_deadline),
                new_deadline: dateOnly(change.new_deadline),
                agreed_with_client: Boolean(change.agreed_with_client),
              })),
              delivery,
            });
            });
          });
        });
      });
    });
  });
});

// Actualizar un proyecto
apiRouter.put('/projects/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, contact, status, client_id, responsible_id, deadline, project_type, pause_cause, pause_note, deadline_change_reason, deadline_agreed_with_client } = req.body;
  const organizationId = req.user!.organizationId;

  if (project_type !== undefined && !isProjectType(project_type)) {
    return res.status(400).json({ error: 'Tipo de proyecto inválido (obra_nueva, carteles o reforma)' });
  }
  // Al paralizar se puede indicar la causa (la pantalla la pide siempre).
  let pauseCause: { cause: DelayCause; note: string | null } | null = null;
  if (status === 'paused' && pause_cause !== undefined && pause_cause !== null) {
    const parsed = parseCauseInput({ cause: pause_cause, note: pause_note });
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });
    pauseCause = parsed;
  }

  // No se puede completar un proyecto con etapas obligatorias pendientes
  // (ni completadas ni marcadas "No aplica"). Aplica a la pantalla y al asistente.
  const ensureRequiredStagesResolved = (next: () => void) => {
    if (status !== 'completed') return next();
    const pendingSql = `
      SELECT s.id, s.name FROM stages s
      INNER JOIN projects p ON s.project_id = p.id
      WHERE s.project_id = ? AND p.organization_id = ? AND p.status != 'completed'
        AND s.is_required = 1 AND COALESCE(s.is_completed, 0) = 0 AND COALESCE(s.not_applicable, 0) = 0
      ORDER BY s.order_number
    `;
    db.all(pendingSql, [id, organizationId], (pendingErr, pending: Array<{ id: number; name: string }>) => {
      if (pendingErr) return res.status(500).json({ error: pendingErr.message });
      if (pending.length > 0) {
        return res.status(409).json({
          error: `No se puede completar el proyecto: hay etapas obligatorias pendientes (${pending.map((s) => s.name).join(', ')}). Completalas o marcalas como "No aplica" con un motivo.`,
          pending_required_stages: pending,
        });
      }
      next();
    });
  };

  ensureRequiredStagesResolved(() => db.get('SELECT status, completed_date, deadline, committed_deadline FROM projects WHERE id = ? AND organization_id = ?', [id, organizationId], (lookupError, existingProject: any) => {
    if (lookupError) return res.status(500).json({ error: lookupError.message });
    if (!existingProject) return res.status(404).json({ error: 'Proyecto no encontrado' });

    // Cambio de la fecha comprometida: fijarla por primera vez no pide motivo;
    // moverla o quitarla, sí. Solo un cambio "acordado con el cliente" mueve
    // la fecha que usa el indicador de retrasos (committed_deadline).
    const previousDeadline = dateOnly(existingProject.deadline);
    const nextDeadline = deadline === undefined ? undefined : dateOnly(deadline);
    const deadlineChanged = deadline !== undefined && nextDeadline !== previousDeadline;
    // "Inicial" solo si nunca hubo fecha comprometida (evita quitarla y volver a
    // ponerla para saltear el motivo).
    const isInitialDeadline = deadlineChanged && !previousDeadline && !existingProject.committed_deadline;
    const changeReason = typeof deadline_change_reason === 'string' ? deadline_change_reason.trim() : '';
    const agreedWithClient = isInitialDeadline || deadline_agreed_with_client === true;
    if (deadlineChanged && !isInitialDeadline && changeReason.length < DEADLINE_CHANGE_MIN_REASON) {
      return res.status(400).json({
        error: 'Para cambiar la fecha comprometida escribí el motivo (al menos 5 caracteres) e indicá si fue acordado con el cliente.',
        requires_deadline_change_reason: true,
      });
    }

    const updates: string[] = [];
    const values: any[] = [];
    const normalizedContact = contact === undefined
      ? undefined
      : (typeof contact === 'string' ? contact.trim() || null : null);

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (contact !== undefined) {
      updates.push('contact = ?');
      values.push(normalizedContact);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
      if (status === 'completed' && existingProject.status !== 'completed') {
        updates.push('completed_date = CURRENT_TIMESTAMP');
      } else if (status !== 'completed' && existingProject.status === 'completed') {
        updates.push('completed_date = NULL');
      }
    }
    if (client_id !== undefined) {
      updates.push('client_id = ?');
      values.push(client_id);
    }
    if (responsible_id !== undefined) {
      updates.push('responsible_id = ?');
      values.push(responsible_id);
    }
    if (deadline !== undefined) {
      updates.push('deadline = ?');
      values.push(deadline);
      if (deadlineChanged && agreedWithClient) {
        updates.push('committed_deadline = ?');
        values.push(deadline || null);
      }
    }
    // Cambiar el tipo no modifica las etapas que el proyecto ya tiene.
    if (project_type !== undefined) {
      updates.push('project_type = ?');
      values.push(project_type);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id, organizationId);

    const sql = `UPDATE projects SET ${updates.join(', ')} WHERE id = ? AND organization_id = ?`;
    db.run(sql, values, function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Proyecto no encontrado' });

      if (deadlineChanged) {
        db.run(
          `INSERT INTO project_deadline_changes (organization_id, project_id, old_deadline, new_deadline, reason, agreed_with_client, changed_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [organizationId, id, existingProject.deadline ?? null, deadline || null, changeReason || (isInitialDeadline ? 'Fecha inicial' : null), agreedWithClient ? 1 : 0, req.user!.userId],
          (historyErr) => { if (historyErr) console.error('Error al registrar el cambio de fecha:', historyErr.message); },
        );
      }

      // Períodos de espera del proyecto: al paralizar se abre uno con la causa;
      // al reactivar o completar se cierra. Completar cierra también las esperas de etapas.
      const userId = req.user!.userId;
      if (status !== undefined && status !== existingProject.status) {
        if (existingProject.status === 'paused' || status === 'completed') {
          const onlyProjectHold = status === 'completed' ? '' : ' AND stage_id IS NULL';
          db.run(`UPDATE stage_holds SET ended_at = CURRENT_TIMESTAMP, ended_by = ? WHERE project_id = ? AND organization_id = ? AND ended_at IS NULL${onlyProjectHold}`,
            [userId, id, organizationId], (holdErr) => { if (holdErr) console.error('Error al cerrar esperas del proyecto:', holdErr.message); });
        }
        if (status === 'paused') {
          db.run('INSERT OR IGNORE INTO stage_holds (organization_id, project_id, stage_id, cause, note, started_by) VALUES (?, ?, NULL, ?, ?, ?)',
            [organizationId, id, pauseCause?.cause ?? null, pauseCause?.note ?? null, userId], (holdErr) => { if (holdErr) console.error('Error al registrar la paralización:', holdErr.message); });
        }
      }

    // Obtener nombre del proyecto si se actualizó
      db.get('SELECT name FROM projects WHERE id = ? AND organization_id = ?', [id, organizationId], (err, project: any) => {
        const projectName = (name || project?.name) as string;
      
      logAudit({
        organizationId,
        userId: req.user!.userId,
        action: 'UPDATE',
        entityType: 'project',
        entityId: Number(id),
        projectName: projectName,
          details: JSON.stringify({ name, description, contact: normalizedContact, status, client_id, responsible_id, deadline, project_type, pause_cause: pauseCause?.cause, pause_note: pauseCause?.note, ...(deadlineChanged ? { previous_deadline: existingProject.deadline ?? null, deadline_change_reason: changeReason || null, deadline_agreed_with_client: agreedWithClient } : {}) }),
        ipAddress: req.ip
      });
      });
      res.json({ message: 'Proyecto actualizado exitosamente' });
    });
  }));
});

// Eliminar un proyecto
apiRouter.delete('/projects/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const organizationId = req.user!.organizationId;

  // Obtener nombre antes de eliminar
  db.get('SELECT name FROM projects WHERE id = ?', [id], (err, project: any) => {
    const projectName = project?.name;
    
    const sql = 'DELETE FROM projects WHERE id = ?';
    db.run(sql, [id], function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Proyecto no encontrado' });
      }
      
      logAudit({
        organizationId,
        userId: req.user!.userId,
        action: 'DELETE',
        entityType: 'project',
        entityId: Number(id),
        projectName: projectName,
        ipAddress: req.ip
      });
      
      res.json({ message: 'Proyecto eliminado exitosamente' });
    });
  });
});

// ==================== USERS ENDPOINTS ====================

// Crear un nuevo usuario
apiRouter.post('/users', (req: Request, res: Response) => {
  const { name, email, role } = req.body;
  const organizationId = req.user!.organizationId;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre es requerido' });
  }

  // Email es opcional, pero si se proporciona no debe estar vacío
  const emailValue = email && email.trim() ? email.trim().toLowerCase() : null;

  const sql = 'INSERT INTO users (organization_id, name, account_email, role) VALUES (?, ?, ?, ?)';
  db.run(sql, [organizationId, name.trim(), emailValue, role?.trim() || null], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Ya existe un usuario con ese email en esta organización' });
      }
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({
      id: this.lastID,
      name: name.trim(),
      email: emailValue,
      role: role?.trim() || null,
      message: 'Usuario creado exitosamente'
    });
  });
});

// Obtener todos los usuarios
apiRouter.get('/users', (req: Request, res: Response) => {
  const { name, role } = req.query;
  const organizationId = req.user!.organizationId;
  
  let sql = 'SELECT u.id, u.name, u.account_email as email, u.role FROM users u WHERE u.organization_id = ?';
  const params: any[] = [organizationId];

  if (name) {
    sql += ' AND u.name LIKE ?';
    params.push(`%${name}%`);
  }

  if (role) {
    sql += ' AND u.role LIKE ?';
    params.push(`%${role}%`);
  }

  sql += ' ORDER BY u.name';

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Obtener un usuario por ID
apiRouter.get('/users/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  const sql = 'SELECT u.id, u.name, u.account_email as email, u.role, u.organization_id FROM users u WHERE u.id = ?';
  db.get(sql, [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json(row);
  });
});

// Actualizar un usuario
apiRouter.put('/users/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, email, role } = req.body;

  const emailValue = email ? email.trim().toLowerCase() : undefined;
  const sql = 'UPDATE users SET name = COALESCE(?, name), account_email = COALESCE(?, account_email), role = COALESCE(?, role) WHERE id = ?';
  db.run(sql, [name, emailValue, role, id], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Ya existe un usuario con ese email en esta organización' });
      }
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json({ message: 'Usuario actualizado exitosamente' });
  });
});

// Eliminar un usuario
apiRouter.delete('/users/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  const sql = 'DELETE FROM users WHERE id = ?';
  db.run(sql, [id], function (err) {
    if (err) {
      if (err.message.includes('FOREIGN KEY constraint failed')) {
        return res.status(400).json({ error: 'No se puede eliminar el usuario porque tiene etapas asignadas' });
      }
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json({ message: 'Usuario eliminado exitosamente' });
  });
});

// ==================== ADMIN ENDPOINTS ====================

// Parsear scopes de membresía (JSON) con fallback seguro.
function parseScopes(raw: string | null | undefined): string[] {
  try {
    return JSON.parse(raw || '[]');
  } catch {
    return [];
  }
}

// Listar todas las cuentas con sus membresías (solo super administrador).
apiRouter.get('/admin/accounts', requireSuperAdmin, (req: Request, res: Response) => {
  const sql = `
    SELECT a.id, a.email, a.name, a.created_at, a.is_super_admin,
           om.organization_id, om.role, om.scopes,
           o.name AS organization_name
    FROM accounts a
    LEFT JOIN organization_members om ON om.account_id = a.id
    LEFT JOIN organizations o ON o.id = om.organization_id
    ORDER BY a.id, o.name
  `;

  db.all(sql, [], (err, rows: any[]) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    // Agrupar filas por cuenta; nunca se selecciona password_hash.
    const accountsById = new Map<number, any>();
    (rows || []).forEach((row) => {
      let account = accountsById.get(row.id);
      if (!account) {
        account = {
          id: row.id,
          email: row.email,
          name: row.name,
          created_at: row.created_at,
          is_super_admin: Boolean(row.is_super_admin),
          organizations: [],
        };
        accountsById.set(row.id, account);
      }
      if (row.organization_id != null) {
        account.organizations.push({
          organizationId: row.organization_id,
          organizationName: row.organization_name,
          role: row.role,
          scopes: parseScopes(row.scopes),
        });
      }
    });

    res.json(Array.from(accountsById.values()));
  });
});

// ==================== STAGES ENDPOINTS ====================

function utcSqlTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);
}

function rollbackAndReport(error: Error, callback: (error: Error) => void) {
  db.run('ROLLBACK', (rollbackErr) => {
    callback(rollbackErr
      ? new Error(`${error.message}; además falló el rollback: ${rollbackErr.message}`)
      : error);
  });
}

function rollbackResponse(res: Response, status: number, message: string) {
  db.run('ROLLBACK', (rollbackErr) => {
    const error = rollbackErr ? `${message}; además falló el rollback: ${rollbackErr.message}` : message;
    res.status(status).json({ error });
  });
}

function openCycleForStage(stageId: number, organizationId: number, userId: number, ipAddress: string | undefined, callback: (error: Error | null, cycle?: any) => void) {
  db.serialize(() => {
    db.run('BEGIN IMMEDIATE TRANSACTION', (beginErr) => {
      if (beginErr) return callback(beginErr);
      db.get(`SELECT s.id, s.project_id, s.estimated_end_date, p.name as project_name
        FROM stages s INNER JOIN projects p ON p.id = s.project_id
        WHERE s.id = ? AND p.organization_id = ?`, [stageId, organizationId], (stageErr, stage: any) => {
        if (stageErr || !stage) {
          return rollbackAndReport(stageErr || new Error('Etapa no encontrada'), callback);
        }
        db.get('SELECT * FROM stage_cycles WHERE stage_id = ? AND organization_id = ? AND ended_at IS NULL', [stageId, organizationId], (openErr, existingCycle) => {
          if (openErr) return rollbackAndReport(openErr, callback);
          if (existingCycle) {
            return db.run('COMMIT', (commitErr) => callback(commitErr || null, existingCycle));
          }
          db.get('SELECT COALESCE(MAX(cycle_number), 0) + 1 as cycle_number FROM stage_cycles WHERE stage_id = ?', [stageId], (numberErr, result: any) => {
            if (numberErr) return rollbackAndReport(numberErr, callback);
            const startedAt = utcSqlTimestamp();
            db.run(`INSERT INTO stage_cycles (organization_id, project_id, stage_id, cycle_number, started_at, started_by, deadline_used)
              VALUES (?, ?, ?, ?, ?, ?, NULL)`, [organizationId, stage.project_id, stageId, result.cycle_number, startedAt, userId], function (insertErr) {
              if (insertErr) return rollbackAndReport(insertErr, callback);
              const cycle = { id: this.lastID, organization_id: organizationId, project_id: stage.project_id, stage_id: stageId, cycle_number: result.cycle_number, started_at: startedAt, started_by: userId, deadline_used: null, deadline_for_display: stage.estimated_end_date || null, cycle_status: 'open' };
              db.run('COMMIT', (commitErr) => {
                if (commitErr) return callback(commitErr);
                logAudit({ organizationId, userId, action: 'START', entityType: 'stage_cycle', entityId: cycle.id, projectName: stage.project_name, details: JSON.stringify({ stage_id: stageId, cycle_number: cycle.cycle_number, deadline_used: null }), ipAddress });
                callback(null, cycle);
              });
            });
          });
        });
      });
    });
  });
}

function completeStageAndCloseCycle(stageId: number, organizationId: number, userId: number, ipAddress: string | undefined, callback: (error: Error | null) => void) {
  db.serialize(() => {
    db.run('BEGIN IMMEDIATE TRANSACTION', (beginErr) => {
      if (beginErr) return callback(beginErr);
      db.get(`SELECT s.name, s.estimated_end_date, p.name as project_name FROM stages s INNER JOIN projects p ON p.id = s.project_id
        WHERE s.id = ? AND p.organization_id = ?`, [stageId, organizationId], (stageErr, stage: any) => {
        if (stageErr || !stage) return rollbackAndReport(stageErr || new Error('Etapa no encontrada'), callback);
        db.get('SELECT id, cycle_number FROM stage_cycles WHERE stage_id = ? AND organization_id = ? AND ended_at IS NULL', [stageId, organizationId], (cycleErr, cycle: any) => {
          if (cycleErr) return rollbackAndReport(cycleErr, callback);
          const finishCycle = (next: () => void) => {
            if (!cycle) return next();
            db.run('UPDATE stage_cycles SET ended_at = CURRENT_TIMESTAMP, ended_by = ?, deadline_used = ? WHERE id = ? AND ended_at IS NULL', [userId, stage.estimated_end_date || null, cycle.id], function (finishErr) {
              if (finishErr) return rollbackAndReport(finishErr, callback);
              if (this.changes === 0) return rollbackAndReport(new Error('El ciclo ya fue cerrado'), callback);
              next();
            });
          };
          finishCycle(() => {
            db.run('UPDATE stages SET is_completed = 1, completed_date = CURRENT_TIMESTAMP, not_applicable = 0, not_applicable_reason = NULL, not_applicable_by = NULL, not_applicable_at = NULL WHERE id = ?', [stageId], (completeErr) => {
              if (completeErr) return rollbackAndReport(completeErr, callback);
              // Completar la etapa cierra su espera abierta, si tenía.
              db.run('UPDATE stage_holds SET ended_at = CURRENT_TIMESTAMP, ended_by = ? WHERE stage_id = ? AND ended_at IS NULL', [userId, stageId], (holdErr) => {
              if (holdErr) return rollbackAndReport(holdErr, callback);
              db.run('COMMIT', (commitErr) => {
                if (commitErr) return callback(commitErr);
                if (cycle) logAudit({ organizationId, userId, action: 'END', entityType: 'stage_cycle', entityId: cycle.id, projectName: stage.project_name, details: JSON.stringify({ stage_id: stageId, cycle_number: cycle.cycle_number, deadline_used: stage.estimated_end_date || null }), ipAddress });
                logAudit({ organizationId, userId, action: 'COMPLETE', entityType: 'stage', entityId: stageId, projectName: stage.project_name, details: JSON.stringify({ stage_name: stage.name, project_name: stage.project_name }), ipAddress });
                callback(null);
              });
              });
            });
          });
        });
      });
    });
  });
}

// Historial de ciclos de una etapa (siempre limitado a la organización autenticada)
apiRouter.get('/stages/:id/cycles', (req: Request, res: Response) => {
  const stageId = Number(req.params.id);
  const organizationId = req.user!.organizationId;
  const sql = `
    SELECT sc.*, su.name as started_by_name, eu.name as ended_by_name,
      CASE WHEN sc.ended_at IS NULL THEN s.estimated_end_date ELSE sc.deadline_used END as deadline_for_display,
      CASE WHEN sc.ended_at IS NULL THEN 'open' ELSE 'closed' END as cycle_status
    FROM stage_cycles sc
    INNER JOIN stages s ON s.id = sc.stage_id
    INNER JOIN projects p ON p.id = sc.project_id AND p.organization_id = ?
    LEFT JOIN users su ON su.id = sc.started_by
    LEFT JOIN users eu ON eu.id = sc.ended_by
    WHERE sc.stage_id = ? AND sc.organization_id = ?
    ORDER BY sc.cycle_number DESC
  `;
  db.all(sql, [organizationId, stageId, organizationId], (err, rows: any[]) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json((rows || []).map((cycle) => ({
      ...cycle,
      duration_days: calendarDurationDays(cycle.started_at, cycle.ended_at),
      comparison: cycle.ended_at ? cycleComparison(cycle.ended_at, cycle.deadline_used) : null,
    })));
  });
});

// Abrir un nuevo ciclo. El índice parcial impide dos ciclos abiertos aun bajo concurrencia.
apiRouter.post('/stages/:id/cycles', (req: Request, res: Response) => {
  const stageId = Number(req.params.id);
  const organizationId = req.user!.organizationId;
  const userId = req.user!.userId;
  db.serialize(() => {
    db.run('BEGIN IMMEDIATE TRANSACTION', (beginErr) => {
      if (beginErr) return res.status(500).json({ error: beginErr.message });
      const stageSql = `SELECT s.id, s.name, s.project_id, s.start_date, s.is_completed, s.estimated_end_date, p.name as project_name
        FROM stages s INNER JOIN projects p ON p.id = s.project_id
        WHERE s.id = ? AND p.organization_id = ?`;
      db.get(stageSql, [stageId, organizationId], (stageErr, stage: any) => {
        if (stageErr || !stage) {
          return rollbackResponse(res, stageErr ? 500 : 404, stageErr?.message || 'Etapa no encontrada');
        }
        if (!stage.start_date || Boolean(stage.is_completed)) {
          return rollbackResponse(res, 400, 'La etapa debe estar en proceso para iniciar un ciclo');
        }
        db.get('SELECT id FROM stage_cycles WHERE stage_id = ? AND ended_at IS NULL', [stageId], (openErr, openCycle) => {
          if (openErr) return rollbackResponse(res, 500, openErr.message);
          if (openCycle) return rollbackResponse(res, 409, 'La etapa ya tiene un ciclo abierto');
          db.get('SELECT COALESCE(MAX(cycle_number), 0) + 1 as cycle_number FROM stage_cycles WHERE stage_id = ?', [stageId], (numberErr, result: any) => {
          if (numberErr) return rollbackResponse(res, 500, numberErr.message);
           const startedAt = utcSqlTimestamp();
           db.run(`INSERT INTO stage_cycles (organization_id, project_id, stage_id, cycle_number, started_at, started_by, deadline_used)
             VALUES (?, ?, ?, ?, ?, ?, NULL)`, [organizationId, stage.project_id, stageId, result.cycle_number, startedAt, userId], function (insertErr) {
            if (insertErr) {
              return rollbackResponse(res, 500, insertErr.message);
            }
            const cycleId = this.lastID;
            db.run('COMMIT', (commitErr) => {
              if (commitErr) return res.status(500).json({ error: commitErr.message });
               logAudit({ organizationId, userId, action: 'START', entityType: 'stage_cycle', entityId: cycleId, projectName: stage.project_name, details: JSON.stringify({ stage_id: stageId, cycle_number: result.cycle_number, deadline_used: null }), ipAddress: req.ip });
               res.status(201).json({ id: cycleId, organization_id: organizationId, project_id: stage.project_id, stage_id: stageId, cycle_number: result.cycle_number, started_at: startedAt, started_by: userId, deadline_used: null, deadline_for_display: stage.estimated_end_date || null, cycle_status: 'open' });
            });
          });
        });
        });
      });
    });
  });
});

// Cerrar un ciclo específico, sin cambiar el estado de completitud de la etapa.
apiRouter.put('/stages/:stageId/cycles/:cycleId/finish', (req: Request, res: Response) => {
  const stageId = Number(req.params.stageId);
  const cycleId = Number(req.params.cycleId);
  const organizationId = req.user!.organizationId;
  const userId = req.user!.userId;
  const lookup = `SELECT sc.*, s.name as stage_name, s.estimated_end_date, p.name as project_name
    FROM stage_cycles sc INNER JOIN stages s ON s.id = sc.stage_id
    INNER JOIN projects p ON p.id = sc.project_id AND p.organization_id = ?
    WHERE sc.id = ? AND sc.stage_id = ? AND sc.organization_id = ? AND sc.ended_at IS NULL`;
  db.get(lookup, [organizationId, cycleId, stageId, organizationId], (err, cycle: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!cycle) return res.status(404).json({ error: 'Ciclo abierto no encontrado' });
    db.run(`UPDATE stage_cycles SET ended_at = CURRENT_TIMESTAMP, ended_by = ?, deadline_used = ?
      WHERE id = ? AND ended_at IS NULL`, [userId, cycle.estimated_end_date || null, cycleId], function (updateErr) {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      if (this.changes === 0) return res.status(409).json({ error: 'El ciclo ya fue cerrado' });
      db.get(`SELECT sc.*, su.name as started_by_name, eu.name as ended_by_name
        FROM stage_cycles sc LEFT JOIN users su ON su.id = sc.started_by LEFT JOIN users eu ON eu.id = sc.ended_by WHERE sc.id = ?`, [cycleId], (selectErr, finished: any) => {
        if (selectErr) return res.status(500).json({ error: selectErr.message });
        const comparison = cycleComparison(finished.ended_at, finished.deadline_used);
        logAudit({ organizationId, userId, action: 'END', entityType: 'stage_cycle', entityId: cycleId, projectName: cycle.project_name, details: JSON.stringify({ stage_id: stageId, cycle_number: finished.cycle_number, deadline_used: finished.deadline_used, comparison }), ipAddress: req.ip });
        res.json({ ...finished, comparison });
      });
    });
  });
});

// Crear la siguiente etapa (debe ser después de completar la anterior)
apiRouter.post('/stages', (req: Request, res: Response) => {
  const { project_id, name, responsible_id, start_date, estimated_end_date } = req.body;

  if (!project_id || !name || !responsible_id) {
    return res.status(400).json({ 
      error: 'project_id, name y responsible_id son requeridos' 
    });
  }

  // Verificar que el proyecto existe
  db.get('SELECT id FROM projects WHERE id = ?', [project_id], (err, project) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    // Verificar que el usuario existe
    db.get('SELECT id FROM users WHERE id = ?', [responsible_id], (err, user) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      // Obtener el número de orden para la nueva etapa
      const orderSql = 'SELECT COALESCE(MAX(order_number), 0) + 1 as next_order FROM stages WHERE project_id = ?';
      db.get(orderSql, [project_id], (err, result: any) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const order_number = result.next_order;

        // Insertar la nueva etapa directamente (sin verificar etapas anteriores)
        // Normalizar fechas para evitar problemas de zona horaria
        const normalizedStartDate = start_date && !start_date.includes('T') 
          ? `${start_date}T12:00:00` 
          : start_date;
        const normalizedEstimatedEndDate = estimated_end_date && !estimated_end_date.includes('T')
          ? `${estimated_end_date}T12:00:00`
          : estimated_end_date;

        const sql = `
          INSERT INTO stages (project_id, name, responsible_id, start_date, estimated_end_date, order_number) 
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        db.run(sql, [project_id, name, responsible_id, normalizedStartDate, normalizedEstimatedEndDate, order_number], function (err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          res.status(201).json({
            id: this.lastID,
            project_id,
            name,
            responsible_id,
            start_date: normalizedStartDate,
            estimated_end_date: normalizedEstimatedEndDate,
            order_number,
            message: 'Etapa creada exitosamente'
          });
        });
      });
    });
  });
});

// Obtener todas las etapas con filtros avanzados
apiRouter.get('/stages', (req: Request, res: Response) => {
  const { 
    project_id, 
    responsible_id, 
    is_completed, 
    tag, 
    start_date_from, 
    start_date_to,
    estimated_end_date_from,
    estimated_end_date_to 
  } = req.query;

  const organizationId = req.user!.organizationId;

  let sql = `
    SELECT 
      s.*,
      u.name as responsible_name,
      u.account_email as responsible_email,
      u.role as responsible_role,
      p.name as project_name,
      p.client_id,
      c.name as client_name
    FROM stages s
    INNER JOIN projects p ON s.project_id = p.id
    LEFT JOIN users u ON s.responsible_id = u.id
    LEFT JOIN clients c ON p.client_id = c.id
    WHERE p.organization_id = ? AND p.status = 'active'
  `;
  const params: any[] = [organizationId];

  if (project_id) {
    sql += ' AND s.project_id = ?';
    params.push(project_id);
  }

  if (responsible_id) {
    sql += ' AND s.responsible_id = ?';
    params.push(responsible_id);
  }

  if (is_completed !== undefined) {
    sql += ' AND s.is_completed = ?';
    params.push(is_completed === 'true' ? 1 : 0);
  }

  if (tag) {
    sql += ` AND s.id IN (
      SELECT st.stage_id FROM stage_tags st
      INNER JOIN tags t ON st.tag_id = t.id
      WHERE t.name = ?
    )`;
    params.push(tag);
  }

  if (start_date_from) {
    sql += ' AND s.start_date >= ?';
    params.push(start_date_from);
  }

  if (start_date_to) {
    sql += ' AND s.start_date <= ?';
    params.push(start_date_to);
  }

  if (estimated_end_date_from) {
    sql += ' AND s.estimated_end_date >= ?';
    params.push(estimated_end_date_from);
  }

  if (estimated_end_date_to) {
    sql += ' AND s.estimated_end_date <= ?';
    params.push(estimated_end_date_to);
  }

  sql += ' ORDER BY s.project_id, s.order_number';

  db.all(sql, params, (err, stages: any[]) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    // Para cada stage, obtener tags y comentarios
    const stagePromises = stages.map((stage) => {
      return new Promise((resolve) => {
        const tagsSql = `
          SELECT t.id, t.name, t.color
          FROM tags t
          INNER JOIN stage_tags st ON t.id = st.tag_id
          WHERE st.stage_id = ?
        `;
        
        const commentsSql = `
          SELECT c.id, c.content, c.created_at, u.name as author, u.id as user_id
          FROM comments c
          LEFT JOIN users u ON c.user_id = u.id
          WHERE c.stage_id = ?
          ORDER BY c.created_at DESC
          LIMIT 3
        `;
        
        const commentsCountSql = `
          SELECT COUNT(*) as total
          FROM comments
          WHERE stage_id = ?
        `;
        
        db.all(tagsSql, [stage.id], (tagErr, tags) => {
          if (tagErr) {
            console.error('Error fetching tags:', tagErr);
            tags = [];
          }
          
          db.all(commentsSql, [stage.id], (commentErr, comments) => {
            if (commentErr) {
              console.error('Error fetching comments:', commentErr);
              comments = [];
            }
            
            db.get(commentsCountSql, [stage.id], (countErr, countResult: any) => {
              const comments_count = countErr ? 0 : (countResult?.total || 0);
              
              resolve({
                ...stage,
                tags: tags || [],
                recent_comments: comments || [],
                comments_count
              });
            });
          });
        });
      });
    });

    Promise.all(stagePromises).then((stagesWithData) => {
      res.json(stagesWithData);
    });
  });
});

// Obtener una etapa por ID con sus comentarios y etiquetas
apiRouter.get('/stages/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  const stageSql = `
    SELECT 
      s.*,
      u.name as responsible_name,
      u.account_email as responsible_email,
      u.role as responsible_role,
      p.name as project_name,
      p.client_id,
      c.name as client_name
    FROM stages s
    INNER JOIN projects p ON s.project_id = p.id
    LEFT JOIN users u ON s.responsible_id = u.id
    LEFT JOIN clients c ON p.client_id = c.id
    WHERE s.id = ?
  `;

  db.get(stageSql, [id], (err, stage) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!stage) {
      return res.status(404).json({ error: 'Etapa no encontrada' });
    }

    // Obtener etiquetas
    const tagsSql = `
      SELECT t.* FROM tags t
      INNER JOIN stage_tags st ON t.id = st.tag_id
      WHERE st.stage_id = ?
    `;

    db.all(tagsSql, [id], (err, tags) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      // Obtener comentarios
      const commentsSql = `
        SELECT c.*, COALESCE(u.name, 'Usuario') as author
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.stage_id = ?
        ORDER BY c.created_at DESC
      `;
      db.all(commentsSql, [id], (err, comments) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        res.json({ ...stage, tags, comments });
      });
    });
  });
});

// Completar una etapa
apiRouter.put('/stages/:id/complete', (req: Request, res: Response) => {
  const stageId = Number(req.params.id);
  completeStageAndCloseCycle(stageId, req.user!.organizationId, req.user!.userId, req.ip, (err) => {
    if (err) return res.status(err.message === 'Etapa no encontrada' ? 404 : 500).json({ error: err.message });
    res.json({ message: 'Etapa completada exitosamente' });
  });
});

// Iniciar una etapa manualmente
apiRouter.put('/stages/:id/start', (req: Request, res: Response) => {
  const stageId = Number(req.params.id);

  const sql = `UPDATE stages SET start_date = CURRENT_TIMESTAMP
    WHERE id = ? AND start_date IS NULL AND EXISTS (
      SELECT 1 FROM projects p WHERE p.id = stages.project_id AND p.organization_id = ?
    )`;
  db.run(sql, [stageId, req.user!.organizationId], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(400).json({ error: 'La etapa ya fue iniciada o no existe' });
    }
    
    openCycleForStage(stageId, req.user!.organizationId, req.user!.userId, req.ip, (cycleErr) => {
      if (cycleErr) {
        // Do not leave a started stage without its automatic first cycle.
        db.run('UPDATE stages SET start_date = NULL WHERE id = ? AND start_date IS NOT NULL AND is_completed = 0', [stageId], (resetErr) => {
          const message = resetErr
            ? `${cycleErr.message}; además no se pudo revertir el inicio: ${resetErr.message}`
            : cycleErr.message;
          res.status(500).json({ error: message });
        });
        return;
      }
      // Default estimated end date: when the stage came from a template with
      // a duration and no end date was set yet (not manually edited), compute
      // it from the real start date counting only business days.
      db.get(
        `SELECT s.start_date, t.estimated_duration_days
         FROM stages s
         LEFT JOIN stage_templates t ON s.template_id = t.id
         WHERE s.id = ?`,
        [stageId],
        (lookupErr, row: any) => {
          if (!lookupErr && row && row.estimated_duration_days && row.estimated_duration_days > 0) {
            const startDate = new Date(row.start_date);
            if (!Number.isNaN(startDate.getTime())) {
              const computedEnd = addBusinessDays(startDate, row.estimated_duration_days).toISOString();
              db.run(
                'UPDATE stages SET estimated_end_date = ? WHERE id = ? AND estimated_end_date IS NULL',
                [computedEnd, stageId],
                () => {
                  db.get('SELECT s.name, p.organization_id, p.name as project_name FROM stages s INNER JOIN projects p ON s.project_id = p.id WHERE s.id = ? AND p.organization_id = ?', [stageId, req.user!.organizationId], (auditErr, auditRow: any) => {
                    if (!auditErr && auditRow) logAudit({ organizationId: auditRow.organization_id, userId: req.user!.userId, action: 'START', entityType: 'stage', entityId: stageId, projectName: auditRow.project_name, details: JSON.stringify({ stage_name: auditRow.name, project_name: auditRow.project_name }), ipAddress: req.ip });
                  });
                  res.json({ message: 'Etapa iniciada exitosamente' });
                }
              );
              return;
            }
          }
          db.get('SELECT s.name, p.organization_id, p.name as project_name FROM stages s INNER JOIN projects p ON s.project_id = p.id WHERE s.id = ? AND p.organization_id = ?', [stageId, req.user!.organizationId], (lookupErr2, row2: any) => {
            if (!lookupErr2 && row2) logAudit({ organizationId: row2.organization_id, userId: req.user!.userId, action: 'START', entityType: 'stage', entityId: stageId, projectName: row2.project_name, details: JSON.stringify({ stage_name: row2.name, project_name: row2.project_name }), ipAddress: req.ip });
          });
          res.json({ message: 'Etapa iniciada exitosamente' });
        }
      );
    });
  });
});

// Volver una etapa a estado "no iniciada"
apiRouter.put('/stages/:id/unstart', (req: Request, res: Response) => {
  const stageId = Number(req.params.id);
  const organizationId = req.user!.organizationId;
  db.serialize(() => {
    db.run('BEGIN IMMEDIATE TRANSACTION', (beginErr) => {
      if (beginErr) return res.status(500).json({ error: beginErr.message });
      db.get(`SELECT s.name, s.start_date, s.is_completed, p.organization_id, p.name as project_name
        FROM stages s INNER JOIN projects p ON s.project_id = p.id
        WHERE s.id = ? AND p.organization_id = ?`, [stageId, organizationId], (lookupErr, stage: any) => {
        if (lookupErr || !stage) return rollbackResponse(res, lookupErr ? 500 : 400, lookupErr?.message || 'La etapa no está iniciada, ya está completada o no existe');
        if (!stage.start_date || Boolean(stage.is_completed)) return rollbackResponse(res, 400, 'La etapa no está iniciada, ya está completada o no existe');
        db.get('SELECT id FROM stage_cycles WHERE stage_id = ? AND organization_id = ? AND ended_at IS NULL', [stageId, organizationId], (cycleErr, openCycle) => {
          if (cycleErr) return rollbackResponse(res, 500, cycleErr.message);
          if (openCycle) return rollbackResponse(res, 409, 'Finalizá el ciclo actual antes de deshacer el inicio');
          db.run('UPDATE stages SET start_date = NULL WHERE id = ?', [stageId], (updateErr) => {
            if (updateErr) return rollbackResponse(res, 500, updateErr.message);
            db.run('COMMIT', (commitErr) => {
              if (commitErr) return res.status(500).json({ error: commitErr.message });
              logAudit({ organizationId, userId: req.user!.userId, action: 'UNSTART', entityType: 'stage', entityId: stageId, projectName: stage.project_name, details: JSON.stringify({ stage_name: stage.name, project_name: stage.project_name }), ipAddress: req.ip });
              res.json({ message: 'Etapa devuelta a estado no iniciada exitosamente' });
            });
          });
        });
      });
    });
  });
});

// Desmarcar una etapa como completada (reabrirla)
apiRouter.put('/stages/:id/uncomplete', (req: Request, res: Response) => {
  const { id } = req.params;

  const sql = 'UPDATE stages SET is_completed = 0, completed_date = NULL WHERE id = ? AND is_completed = 1';
  db.run(sql, [id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(400).json({ error: 'La etapa no está completada o no existe' });
    }
    
    db.get('SELECT s.name, p.organization_id, p.name as project_name FROM stages s INNER JOIN projects p ON s.project_id = p.id WHERE s.id = ?', [id], (err, row: any) => {
      if (!err && row) {
        logAudit({
          organizationId: row.organization_id,
          userId: req.user!.userId,
          action: 'UNCOMPLETE',
          entityType: 'stage',
          entityId: Number(id),
          projectName: row.project_name,
          details: JSON.stringify({ stage_name: row.name, project_name: row.project_name }),
          ipAddress: req.ip
        });
      }
    });
    
    res.json({ message: 'Etapa reabierta exitosamente' });
  });
});

// Marcar una etapa como "No aplica" (motivo obligatorio; se registra quién).
apiRouter.put('/stages/:id/not-applicable', (req: Request, res: Response) => {
  const { id } = req.params;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  const organizationId = req.user!.organizationId;

  if (reason.length < 5) {
    return res.status(400).json({ error: 'Escribí el motivo por el que la etapa no aplica (al menos 5 caracteres).' });
  }

  const lookupSql = `
    SELECT s.name, s.is_completed, p.name as project_name
    FROM stages s INNER JOIN projects p ON s.project_id = p.id
    WHERE s.id = ? AND p.organization_id = ?
  `;
  db.get(lookupSql, [id, organizationId], (err, stage: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!stage) return res.status(404).json({ error: 'Etapa no encontrada' });
    if (stage.is_completed) return res.status(400).json({ error: 'La etapa ya está completada.' });

    db.run(
      `UPDATE stages SET not_applicable = 1, not_applicable_reason = ?, not_applicable_by = ?, not_applicable_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [reason, req.user!.userId, id],
      (updateErr) => {
        if (updateErr) return res.status(500).json({ error: updateErr.message });
        logAudit({
          organizationId,
          userId: req.user!.userId,
          action: 'NOT_APPLICABLE',
          entityType: 'stage',
          entityId: Number(id),
          projectName: stage.project_name,
          details: JSON.stringify({ stage_name: stage.name, project_name: stage.project_name, reason }),
          ipAddress: req.ip,
        });
        res.json({ message: 'Etapa marcada como No aplica' });
      }
    );
  });
});

// Deshacer "No aplica".
apiRouter.delete('/stages/:id/not-applicable', (req: Request, res: Response) => {
  const { id } = req.params;
  const organizationId = req.user!.organizationId;
  const lookupSql = `
    SELECT s.name, s.not_applicable_reason, p.name as project_name, p.status as project_status
    FROM stages s INNER JOIN projects p ON s.project_id = p.id
    WHERE s.id = ? AND p.organization_id = ? AND s.not_applicable = 1
  `;
  db.get(lookupSql, [id, organizationId], (err, stage: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!stage) return res.status(404).json({ error: 'La etapa no está marcada como No aplica' });
    if (stage.project_status === 'completed') {
      return res.status(400).json({ error: 'El proyecto está completado: reabrilo antes de cambiar esta etapa.' });
    }
    db.run(
      'UPDATE stages SET not_applicable = 0, not_applicable_reason = NULL, not_applicable_by = NULL, not_applicable_at = NULL WHERE id = ?',
      [id],
      (updateErr) => {
        if (updateErr) return res.status(500).json({ error: updateErr.message });
        logAudit({
          organizationId,
          userId: req.user!.userId,
          action: 'UNDO_NOT_APPLICABLE',
          entityType: 'stage',
          entityId: Number(id),
          projectName: stage.project_name,
          details: JSON.stringify({ stage_name: stage.name, project_name: stage.project_name, previous_reason: stage.not_applicable_reason }),
          ipAddress: req.ip,
        });
        res.json({ message: 'Se quitó "No aplica" de la etapa' });
      }
    );
  });
});

// ==================== ESPERAS Y CAUSAS DE RETRASO ====================

const STAGE_SCOPE_SQL = `
  SELECT s.id, s.name, s.project_id, s.is_completed, s.estimated_end_date, p.name as project_name, p.status as project_status
  FROM stages s INNER JOIN projects p ON s.project_id = p.id
  WHERE s.id = ? AND p.organization_id = ?
`;

// Poner una etapa "En espera" con su causa. Los días se cuentan solos hasta reanudar.
apiRouter.put('/stages/:id/hold', (req: Request, res: Response) => {
  const { id } = req.params;
  const organizationId = req.user!.organizationId;
  const parsed = parseCauseInput(req.body);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });

  db.get(STAGE_SCOPE_SQL, [id, organizationId], (err, stage: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!stage) return res.status(404).json({ error: 'Etapa no encontrada' });
    if (stage.is_completed) return res.status(400).json({ error: 'La etapa ya está completada.' });
    if (stage.project_status === 'completed') return res.status(400).json({ error: 'El proyecto está completado.' });
    db.run(
      'INSERT INTO stage_holds (organization_id, project_id, stage_id, cause, note, started_by) VALUES (?, ?, ?, ?, ?, ?)',
      [organizationId, stage.project_id, stage.id, parsed.cause, parsed.note, req.user!.userId],
      function (insertErr) {
        if (insertErr) {
          if (/UNIQUE/i.test(insertErr.message)) return res.status(409).json({ error: 'La etapa ya está en espera.' });
          return res.status(500).json({ error: insertErr.message });
        }
        logAudit({
          organizationId,
          userId: req.user!.userId,
          action: 'HOLD',
          entityType: 'stage',
          entityId: stage.id,
          projectName: stage.project_name,
          details: JSON.stringify({ stage_name: stage.name, project_name: stage.project_name, cause: parsed.cause, note: parsed.note }),
          ipAddress: req.ip,
        });
        res.status(201).json({ id: this.lastID, message: 'Etapa puesta en espera' });
      }
    );
  });
});

// Reanudar una etapa en espera (cierra el período y deja registrados los días).
apiRouter.delete('/stages/:id/hold', (req: Request, res: Response) => {
  const { id } = req.params;
  const organizationId = req.user!.organizationId;
  db.get(STAGE_SCOPE_SQL, [id, organizationId], (err, stage: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!stage) return res.status(404).json({ error: 'Etapa no encontrada' });
    db.run(
      'UPDATE stage_holds SET ended_at = CURRENT_TIMESTAMP, ended_by = ? WHERE stage_id = ? AND organization_id = ? AND ended_at IS NULL',
      [req.user!.userId, stage.id, organizationId],
      function (updateErr) {
        if (updateErr) return res.status(500).json({ error: updateErr.message });
        if (this.changes === 0) return res.status(404).json({ error: 'La etapa no está en espera.' });
        logAudit({
          organizationId,
          userId: req.user!.userId,
          action: 'RESUME',
          entityType: 'stage',
          entityId: stage.id,
          projectName: stage.project_name,
          details: JSON.stringify({ stage_name: stage.name, project_name: stage.project_name }),
          ipAddress: req.ip,
        });
        res.json({ message: 'Etapa reanudada' });
      }
    );
  });
});

// Causa del retraso de una etapa que superó su fecha estimada.
apiRouter.put('/stages/:id/delay-cause', (req: Request, res: Response) => {
  const { id } = req.params;
  const organizationId = req.user!.organizationId;
  const parsed = parseCauseInput(req.body);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });

  db.get(STAGE_SCOPE_SQL, [id, organizationId], (err, stage: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!stage) return res.status(404).json({ error: 'Etapa no encontrada' });
    if (!stage.estimated_end_date) return res.status(400).json({ error: 'La etapa no tiene fecha estimada.' });
    db.run(
      'UPDATE stages SET delay_cause = ?, delay_cause_note = ?, delay_cause_by = ?, delay_cause_at = CURRENT_TIMESTAMP WHERE id = ?',
      [parsed.cause, parsed.note, req.user!.userId, stage.id],
      (updateErr) => {
        if (updateErr) return res.status(500).json({ error: updateErr.message });
        logAudit({
          organizationId,
          userId: req.user!.userId,
          action: 'DELAY_CAUSE',
          entityType: 'stage',
          entityId: stage.id,
          projectName: stage.project_name,
          details: JSON.stringify({ stage_name: stage.name, project_name: stage.project_name, cause: parsed.cause, note: parsed.note }),
          ipAddress: req.ip,
        });
        res.json({ message: 'Causa del retraso registrada' });
      }
    );
  });
});

// Reordenar etapas (DEBE estar antes de /stages/:id para evitar conflictos de ruta)
apiRouter.put('/stages/reorder', (req: Request, res: Response) => {
  const { stages } = req.body;

  if (!stages || !Array.isArray(stages)) {
    return res.status(400).json({ error: 'Se requiere un array de etapas' });
  }

  // Actualizar el order_number de cada etapa
  const stmt = db.prepare('UPDATE stages SET order_number = ? WHERE id = ?');
  
  try {
    stages.forEach((stage: { id: number; order_number: number }) => {
      stmt.run(stage.order_number, stage.id);
    });
    stmt.finalize();
    res.json({ message: 'Etapas reordenadas exitosamente' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Actualizar una etapa
apiRouter.put('/stages/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, responsible_id, start_date, estimated_end_date, completed_date, intermediate_date, intermediate_date_note } = req.body;

  // Si se proporciona responsible_id, verificar que el usuario existe
  if (responsible_id) {
    db.get('SELECT id FROM users WHERE id = ?', [responsible_id], (err, user) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      updateStage();
    });
  } else {
    updateStage();
  }

  function updateStage() {
    // Normalizar fechas para evitar problemas de zona horaria
    // null significa limpiar la fecha, mantenerlo como null
    const normalizedStartDate = start_date === null ? null : (start_date && !start_date.includes('T') 
      ? `${start_date}T12:00:00` 
      : start_date);
    const normalizedEstimatedEndDate = estimated_end_date === null ? null : (estimated_end_date && !estimated_end_date.includes('T')
      ? `${estimated_end_date}T12:00:00`
      : estimated_end_date);
    const normalizedCompletedDate = completed_date === null ? null : (completed_date && !completed_date.includes('T')
      ? `${completed_date}T12:00:00`
      : completed_date);
    const normalizedIntermediateDate = intermediate_date === null ? null : (intermediate_date && !intermediate_date.includes('T')
      ? `${intermediate_date}T12:00:00`
      : intermediate_date);

    // Construir SQL dinámicamente para permitir actualizar campos opcionales
    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (responsible_id !== undefined) {
      updates.push('responsible_id = ?');
      params.push(responsible_id);
    }
    if (start_date !== undefined) {
      updates.push('start_date = ?');
      params.push(normalizedStartDate);
    }
    if (estimated_end_date !== undefined) {
      updates.push('estimated_end_date = ?');
      params.push(normalizedEstimatedEndDate);
    }
    if (completed_date !== undefined) {
      updates.push('completed_date = ?');
      params.push(normalizedCompletedDate);
    }
    if (intermediate_date !== undefined) {
      updates.push('intermediate_date = ?');
      params.push(normalizedIntermediateDate);
    }
    if (intermediate_date_note !== undefined) {
      updates.push('intermediate_date_note = ?');
      params.push(intermediate_date_note || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    const sql = `UPDATE stages SET ${updates.join(', ')} WHERE id = ?`;
    params.push(id);

    db.run(sql, params, function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Etapa no encontrada' });
      }
      
      db.get('SELECT s.name as stage_name, p.organization_id, p.name as project_name FROM stages s INNER JOIN projects p ON s.project_id = p.id WHERE s.id = ?', [id], (err, row: any) => {
        if (!err && row) {
          logAudit({
            organizationId: row.organization_id,
            userId: req.user!.userId,
            action: 'UPDATE',
            entityType: 'stage',
            entityId: Number(id),
            projectName: row.project_name,
            details: JSON.stringify({ stage_name: row.stage_name, project_name: row.project_name, updates: { name, responsible_id, start_date, estimated_end_date, completed_date, intermediate_date, intermediate_date_note } }),
            ipAddress: req.ip
          });
        }
      });
      
      res.json({ message: 'Etapa actualizada exitosamente' });
    });
  }
});

// Eliminar una etapa
apiRouter.delete('/stages/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  // Obtener info antes de eliminar
  db.get('SELECT s.name, s.is_required, p.organization_id, p.name as project_name FROM stages s INNER JOIN projects p ON s.project_id = p.id WHERE s.id = ?', [id], (err, stageInfo: any) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (stageInfo?.is_required) {
      return res.status(400).json({ error: `La etapa "${stageInfo.name}" es obligatoria y no se puede eliminar del proyecto.` });
    }

    const sql = 'DELETE FROM stages WHERE id = ?';
    db.run(sql, [id], function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Etapa no encontrada' });
      }
      
      if (stageInfo) {
        logAudit({
          organizationId: stageInfo.organization_id,
          userId: req.user!.userId,
          action: 'DELETE',
          entityType: 'stage',
          entityId: Number(id),
          projectName: stageInfo.project_name,
          details: JSON.stringify({ stage_name: stageInfo.name, project_name: stageInfo.project_name }),
          ipAddress: req.ip
        });
      }
      
      res.json({ message: 'Etapa eliminada exitosamente' });
    });
  });
});

// Añadir etiqueta a una etapa
apiRouter.post('/stages/:id/tags', (req: Request, res: Response) => {
  const { id } = req.params;
  const { tag_id } = req.body;
  const organizationId = req.user!.organizationId;

  if (!tag_id) {
    return res.status(400).json({ error: 'tag_id es requerido' });
  }

  // Verificar que el tag pertenece a la organización del usuario
  db.get('SELECT id FROM tags WHERE id = ? AND organization_id = ?', [tag_id, organizationId], (err, tag) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!tag) {
      return res.status(404).json({ error: 'Etiqueta no encontrada o no pertenece a tu organización' });
    }

    const sql = 'INSERT INTO stage_tags (stage_id, tag_id) VALUES (?, ?)';
    db.run(sql, [id, tag_id], function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Esta etiqueta ya está asignada a la etapa' });
        }
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ message: 'Etiqueta añadida a la etapa exitosamente' });
    });
  });
});

// Remover etiqueta de una etapa
apiRouter.delete('/stages/:stageId/tags/:tagId', (req: Request, res: Response) => {
  const { stageId, tagId } = req.params;

  const sql = 'DELETE FROM stage_tags WHERE stage_id = ? AND tag_id = ?';
  db.run(sql, [stageId, tagId], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Relación no encontrada' });
    }
    res.json({ message: 'Etiqueta removida de la etapa exitosamente' });
  });
});

// Añadir etiqueta a un proyecto
apiRouter.post('/projects/:id/tags', (req: Request, res: Response) => {
  const { id } = req.params;
  const { tag_id } = req.body;
  const organizationId = req.user!.organizationId;

  if (!tag_id) {
    return res.status(400).json({ error: 'tag_id es requerido' });
  }

  // Verificar que el proyecto pertenece a la organización del usuario
  db.get('SELECT id FROM projects WHERE id = ? AND organization_id = ?', [id, organizationId], (projErr, project: any) => {
    if (projErr) {
      return res.status(500).json({ error: projErr.message });
    }
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado o no pertenece a tu organización' });
    }

    // Verificar que la etiqueta de proyecto pertenece a la organización del usuario
    db.get('SELECT id FROM project_tag_options WHERE id = ? AND organization_id = ?', [tag_id, organizationId], (tagErr, tag: any) => {
      if (tagErr) {
        return res.status(500).json({ error: tagErr.message });
      }
      if (!tag) {
        return res.status(404).json({ error: 'Etiqueta de proyecto no encontrada o no pertenece a tu organización' });
      }

      const sql = 'INSERT INTO project_tag_assignments (project_id, project_tag_id) VALUES (?, ?)';
      db.run(sql, [id, tag_id], function (runErr) {
        if (runErr) {
          if (runErr.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Esta etiqueta ya está asignada al proyecto' });
          }
          return res.status(500).json({ error: runErr.message });
        }
        res.status(201).json({ message: 'Etiqueta añadida al proyecto exitosamente' });
      });
    });
  });
});

// Remover etiqueta de un proyecto
apiRouter.delete('/projects/:id/tags/:tagId', (req: Request, res: Response) => {
  const { id, tagId } = req.params;
  const organizationId = req.user!.organizationId;

  // Verificar que el proyecto pertenece a la organización del usuario
  db.get('SELECT id FROM projects WHERE id = ? AND organization_id = ?', [id, organizationId], (projErr, project: any) => {
    if (projErr) {
      return res.status(500).json({ error: projErr.message });
    }
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado o no pertenece a tu organización' });
    }

    // Verificar que la etiqueta de proyecto pertenece a la organización del usuario
    db.get('SELECT id FROM project_tag_options WHERE id = ? AND organization_id = ?', [tagId, organizationId], (tagErr, tag: any) => {
      if (tagErr) {
        return res.status(500).json({ error: tagErr.message });
      }
      if (!tag) {
        return res.status(404).json({ error: 'Etiqueta de proyecto no encontrada o no pertenece a tu organización' });
      }

      const sql = 'DELETE FROM project_tag_assignments WHERE project_id = ? AND project_tag_id = ?';
      db.run(sql, [id, tagId], function (runErr) {
        if (runErr) {
          return res.status(500).json({ error: runErr.message });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Relación no encontrada' });
        }
        res.json({ message: 'Etiqueta removida del proyecto exitosamente' });
      });
    });
  });
});

// ==================== TAGS ENDPOINTS ====================

// Crear una nueva etiqueta
apiRouter.post('/tags', (req: Request, res: Response) => {
  const { name, color } = req.body;
  const organizationId = req.user!.organizationId;

  if (!name) {
    return res.status(400).json({ error: 'El nombre de la etiqueta es requerido' });
  }

  const sql = 'INSERT INTO tags (organization_id, name, color) VALUES (?, ?, ?)';
  db.run(sql, [organizationId, name, color || null], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Ya existe una etiqueta con ese nombre en tu organización' });
      }
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({
      id: this.lastID,
      organization_id: organizationId,
      name,
      color,
      message: 'Etiqueta creada exitosamente'
    });
  });
});

// Obtener todas las etiquetas
apiRouter.get('/tags', (req: Request, res: Response) => {
  const organizationId = req.user!.organizationId;
  
  const sql = `
    SELECT
      t.*,
      COUNT(DISTINCT st.stage_id) as usage_count
    FROM tags t
    LEFT JOIN stage_tags st ON t.id = st.tag_id
    WHERE t.organization_id = ?
    GROUP BY t.id
    ORDER BY t.name
  `;

  db.all(sql, [organizationId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Obtener una etiqueta por ID
apiRouter.get('/tags/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const organizationId = req.user!.organizationId;

  const sql = 'SELECT * FROM tags WHERE id = ? AND organization_id = ?';
  db.get(sql, [id, organizationId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Etiqueta no encontrada' });
    }
    res.json(row);
  });
});

// Actualizar una etiqueta
apiRouter.put('/tags/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, color } = req.body;
  const organizationId = req.user!.organizationId;

  const sql = 'UPDATE tags SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ? AND organization_id = ?';
  db.run(sql, [name, color, id, organizationId], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Ya existe una etiqueta con ese nombre en tu organización' });
      }
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Etiqueta no encontrada' });
    }
    res.json({ message: 'Etiqueta actualizada exitosamente' });
  });
});

// Eliminar una etiqueta
apiRouter.delete('/tags/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const organizationId = req.user!.organizationId;

  const sql = 'DELETE FROM tags WHERE id = ? AND organization_id = ?';
  db.run(sql, [id, organizationId], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Etiqueta no encontrada' });
    }
    res.json({ message: 'Etiqueta eliminada exitosamente' });
  });
});

// ==================== PROJECT TAGS ENDPOINTS ====================
// Catálogo independiente de etiquetas de proyecto (no afecta a las
// etiquetas de etapas, que viven en la tabla `tags`).

// Obtener todas las opciones de etiquetas de proyecto con su uso
apiRouter.get('/project-tags', (req: Request, res: Response) => {
  const organizationId = req.user!.organizationId;

  const sql = `
    SELECT
      t.*,
      COUNT(DISTINCT pta.project_id) as usage_count
    FROM project_tag_options t
    LEFT JOIN project_tag_assignments pta ON t.id = pta.project_tag_id
    WHERE t.organization_id = ?
    GROUP BY t.id
    ORDER BY t.name
  `;

  db.all(sql, [organizationId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Crear una nueva opción de etiqueta de proyecto
apiRouter.post('/project-tags', (req: Request, res: Response) => {
  const { name, color } = req.body;
  const organizationId = req.user!.organizationId;

  if (!name) {
    return res.status(400).json({ error: 'El nombre de la etiqueta es requerido' });
  }

  const sql = 'INSERT INTO project_tag_options (organization_id, name, color) VALUES (?, ?, ?)';
  db.run(sql, [organizationId, name, color || null], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Ya existe una etiqueta de proyecto con ese nombre en tu organización' });
      }
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({
      id: this.lastID,
      organization_id: organizationId,
      name,
      color,
      message: 'Etiqueta de proyecto creada exitosamente'
    });
  });
});

// Actualizar una opción de etiqueta de proyecto
apiRouter.put('/project-tags/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, color } = req.body;
  const organizationId = req.user!.organizationId;

  const sql = 'UPDATE project_tag_options SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ? AND organization_id = ?';
  db.run(sql, [name, color, id, organizationId], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Ya existe una etiqueta de proyecto con ese nombre en tu organización' });
      }
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Etiqueta de proyecto no encontrada' });
    }
    res.json({ message: 'Etiqueta de proyecto actualizada exitosamente' });
  });
});

// Eliminar una opción de etiqueta de proyecto
apiRouter.delete('/project-tags/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const organizationId = req.user!.organizationId;

  const sql = 'DELETE FROM project_tag_options WHERE id = ? AND organization_id = ?';
  db.run(sql, [id, organizationId], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Etiqueta de proyecto no encontrada' });
    }
    res.json({ message: 'Etiqueta de proyecto eliminada exitosamente' });
  });
});

// ==================== COMMENTS ENDPOINTS ====================

// Añadir comentario a una etapa
apiRouter.post('/comments', (req: Request, res: Response) => {
  const { stage_id, content } = req.body;
  const userId = req.user!.userId;

  if (!stage_id || !content) {
    return res.status(400).json({ error: 'stage_id y content son requeridos' });
  }

  // Verificar que la etapa existe
  db.get('SELECT id FROM stages WHERE id = ?', [stage_id], (err, stage) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!stage) {
      return res.status(404).json({ error: 'Etapa no encontrada' });
    }

    const sql = 'INSERT INTO comments (stage_id, user_id, content) VALUES (?, ?, ?)';
    db.run(sql, [stage_id, userId, content], function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      const commentId = this.lastID;
      
      // Obtener el nombre del usuario para devolverlo
      db.get('SELECT name FROM users WHERE id = ?', [userId], (err, user: any) => {
        // Log de auditoría
        db.get('SELECT p.organization_id FROM stages s INNER JOIN projects p ON s.project_id = p.id WHERE s.id = ?', [stage_id], (err, row: any) => {
          if (!err && row) {
            logAudit({
              organizationId: row.organization_id,
              userId: req.user!.userId,
              action: 'CREATE',
              entityType: 'comment',
              entityId: commentId,
              details: JSON.stringify({ stage_id, content_preview: content.substring(0, 50) }),
              ipAddress: req.ip
            });
          }
        });
        
        res.status(201).json({
          id: commentId,
          stage_id,
          content,
          user_id: userId,
          author: user?.name || 'Usuario',
          message: 'Comentario añadido exitosamente'
        });
      });
    });
  });
});

// Obtener comentarios por etapa
apiRouter.get('/stages/:stageId/comments', (req: Request, res: Response) => {
  const { stageId } = req.params;

  const sql = `
    SELECT c.*, u.name as author
    FROM comments c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.stage_id = ?
    ORDER BY c.created_at DESC
  `;
  db.all(sql, [stageId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Obtener todos los comentarios
apiRouter.get('/comments', (req: Request, res: Response) => {
  const sql = `
    SELECT 
      c.*,
      u.name as author,
      s.name as stage_name,
      p.name as project_name
    FROM comments c
    LEFT JOIN users u ON c.user_id = u.id
    INNER JOIN stages s ON c.stage_id = s.id
    INNER JOIN projects p ON s.project_id = p.id
    ORDER BY c.created_at DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Eliminar un comentario
apiRouter.delete('/comments/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  // Obtener info antes de eliminar
  db.get('SELECT c.stage_id, p.organization_id FROM comments c INNER JOIN stages s ON c.stage_id = s.id INNER JOIN projects p ON s.project_id = p.id WHERE c.id = ?', [id], (err, commentInfo: any) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const sql = 'DELETE FROM comments WHERE id = ?';
    db.run(sql, [id], function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Comentario no encontrado' });
      }
      
      if (commentInfo) {
        logAudit({
          organizationId: commentInfo.organization_id,
          userId: req.user!.userId,
          action: 'DELETE',
          entityType: 'comment',
          entityId: Number(id),
          details: JSON.stringify({ stage_id: commentInfo.stage_id }),
          ipAddress: req.ip
        });
      }
      
      res.json({ message: 'Comentario eliminado exitosamente' });
    });
  });
});

// Actualizar un comentario
apiRouter.put('/comments/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'El contenido del comentario es requerido' });
  }

  const sql = 'UPDATE comments SET content = ? WHERE id = ?';
  db.run(sql, [content, id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Comentario no encontrado' });
    }
    
    // Log de auditoría
    db.get('SELECT c.stage_id, p.organization_id FROM comments c INNER JOIN stages s ON c.stage_id = s.id INNER JOIN projects p ON s.project_id = p.id WHERE c.id = ?', [id], (err, commentInfo: any) => {
      if (!err && commentInfo) {
        logAudit({
          organizationId: commentInfo.organization_id,
          userId: req.user!.userId,
          action: 'UPDATE',
          entityType: 'comment',
          entityId: Number(id),
          details: JSON.stringify({ stage_id: commentInfo.stage_id, content_preview: content.substring(0, 50) }),
          ipAddress: req.ip
        });
      }
    });
    
    res.json({ 
      id: Number(id),
      content,
      message: 'Comentario actualizado exitosamente' 
    });
  });
});

// Manejo de cierre gracioso
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Error al cerrar la base de datos:', err);
    } else {
      console.log('Conexión a la base de datos cerrada');
    }
    process.exit(0);
  });
});
