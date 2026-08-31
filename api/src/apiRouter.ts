import { Router, type Request, type Response } from "express";
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { authMiddleware, requireSuperAdmin } from './middleware';

export const apiRouter = Router();

// Proteger todas las rutas del API con autenticación
apiRouter.use(authMiddleware);

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
        email TEXT,
        phone TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
      )
    `);

    // Compatibilidad también para bases de desarrollo antiguas sin email/phone.
    db.all('PRAGMA table_info(clients)', (err, columns: Array<{ name: string }>) => {
      if (err) {
        console.error('Error al verificar las columnas de clients:', err.message);
        return;
      }
      const existingColumns = new Set(columns.map((column) => column.name));
      ['email', 'phone'].filter((column) => !existingColumns.has(column)).forEach((column) => {
        db.run(`ALTER TABLE clients ADD COLUMN ${column} TEXT`, (alterErr) => {
          if (alterErr) console.error(`Error al agregar ${column} a clients:`, alterErr.message);
        });
      });
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
apiRouter.get('/summary', (req: Request, res: Response) => {
  const requestedYear = Number(req.query.year);
  const currentYear = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
  }).format(new Date()));
  const year = Number.isInteger(requestedYear) && requestedYear >= 1900 && requestedYear <= 3000
    ? requestedYear
    : currentYear;
  const organizationId = req.user!.organizationId;
  const yearExpression = (column: string) => `CASE WHEN length(${column}) = 10 THEN substr(${column}, 1, 4) ELSE strftime('%Y', datetime(${column}, '-3 hours')) END`;

  const countsSql = `
    SELECT
      SUM(CASE WHEN ${yearExpression('p.created_at')} = ? THEN 1 ELSE 0 END) as created_count,
      SUM(CASE WHEN ${yearExpression('p.completed_date')} = ? THEN 1 ELSE 0 END) as completed_count
    FROM projects p
    WHERE p.organization_id = ?
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
      END), 0) as delayed_cycles
    FROM projects p
    INNER JOIN stages s ON s.project_id = p.id
    LEFT JOIN stage_cycles sc ON sc.stage_id = s.id AND sc.project_id = p.id
    WHERE p.organization_id = ? AND ${yearExpression('p.completed_date')} = ?
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

  db.get(countsSql, [String(year), String(year), organizationId], (countsError, counts: any) => {
    if (countsError) return res.status(500).json({ error: countsError.message });
    db.all(stagesSql, [organizationId, String(year)], (stagesError, stages: any[]) => {
      if (stagesError) return res.status(500).json({ error: stagesError.message });
      db.all(yearsSql, [organizationId, organizationId], (yearsError, years: any[]) => {
        if (yearsError) return res.status(500).json({ error: yearsError.message });
        const availableYears = Array.from(new Set([
          currentYear,
          ...(years || []).map((row) => Number(row.year)).filter((value) => Number.isInteger(value)),
        ])).sort((a, b) => b - a);
        res.json({
          year,
          available_years: availableYears,
          projects_created: Number(counts?.created_count || 0),
          projects_completed: Number(counts?.completed_count || 0),
          stages: (stages || []).map((stage) => ({
            stage_name: stage.stage_name,
            total_days: Number(stage.total_days || 0),
            delayed_cycles: Number(stage.delayed_cycles || 0),
          })),
        });
      });
    });
  });
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
  db.all('SELECT * FROM clients WHERE organization_id = ? ORDER BY name', [organizationId], (err, rows) => {
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
  db.get('SELECT * FROM clients WHERE id = ?', [id], (err, row) => {
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
  const { name, email, phone } = req.body;
  const organizationId = req.user!.organizationId;
  
  if (!name) {
    res.status(400).json({ error: 'El nombre del cliente es requerido' });
    return;
  }

  db.run(
    'INSERT INTO clients (organization_id, name, email, phone) VALUES (?, ?, ?, ?)',
    [organizationId, name, email || null, phone || null],
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
        details: JSON.stringify({ name, email, phone }),
        ipAddress: req.ip
      });
      
      res.status(201).json({ id: clientId, name, email, phone });
    }
  );
});

// PUT update client
apiRouter.put('/clients/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, email, phone } = req.body;
  const organizationId = req.user!.organizationId;

  db.run(
    'UPDATE clients SET name = ?, email = ?, phone = ? WHERE id = ?',
    [name, email, phone, id],
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
        details: JSON.stringify({ name, email, phone }),
        ipAddress: req.ip
      });
      
      res.json({ id, name, email, phone });
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
  const sql = `
    SELECT st.*, u.name as default_responsible_name 
    FROM stage_templates st
    LEFT JOIN users u ON st.default_responsible_id = u.id
    WHERE st.organization_id = ?
    ORDER BY st.order_number
  `;
  
  db.all(sql, [organizationId], (err, rows) => {
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
  const { name, order_number, default_responsible_id, estimated_duration_days } = req.body;
  const organizationId = req.user!.organizationId;
  
  if (!name || order_number === undefined) {
    res.status(400).json({ error: 'El nombre y el orden son requeridos' });
    return;
  }

  db.run(
    'INSERT INTO stage_templates (organization_id, name, order_number, default_responsible_id, estimated_duration_days) VALUES (?, ?, ?, ?, ?)',
    [organizationId, name, order_number, default_responsible_id || null, estimated_duration_days || null],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.status(201).json({ 
        id: this.lastID, 
        name, 
        order_number, 
        default_responsible_id, 
        estimated_duration_days 
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

  // Actualizar el order_number de cada plantilla
  const stmt = db.prepare('UPDATE stage_templates SET order_number = ? WHERE id = ?');
  
  try {
    templates.forEach((template: { id: number; order_number: number }) => {
      stmt.run(template.order_number, template.id);
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

  if (updates.length === 0) {
    res.status(400).json({ error: 'No hay campos para actualizar' });
    return;
  }

  values.push(id);

  console.log('SQL Query:', `UPDATE stage_templates SET ${updates.join(', ')} WHERE id = ?`);
  console.log('Values:', values);

  db.run(
    `UPDATE stage_templates SET ${updates.join(', ')} WHERE id = ?`,
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
      db.get('SELECT * FROM stage_templates WHERE id = ?', [id], (err, row) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        console.log('Updated template:', row);
        res.json(row);
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
  const { name, description, contact, client_id, responsible_id, deadline } = req.body;
  const organizationId = req.user!.organizationId;

  if (!name) {
    return res.status(400).json({ error: 'El nombre del proyecto es requerido' });
  }

  const normalizedContact = typeof contact === 'string' ? contact.trim() || null : null;
  const sql = 'INSERT INTO projects (organization_id, name, description, contact, client_id, responsible_id, deadline) VALUES (?, ?, ?, ?, ?, ?, ?)';
  db.run(sql, [organizationId, name, description || null, normalizedContact, client_id || null, responsible_id || null, deadline || null], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    // Si hay plantillas de etapas, crear las etapas iniciales
    db.all('SELECT * FROM stage_templates ORDER BY order_number', [], (err, templates: any[]) => {
      if (!err && templates && templates.length > 0) {
        const projectId = this.lastID;
        const insertStage = db.prepare(
          'INSERT INTO stages (project_id, template_id, name, responsible_id, order_number, estimated_end_date, start_date) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        
        templates.forEach((template, index) => {
          let estimatedEndDate = null;
          let startDate = null;
          
          // La primera etapa comienza inmediatamente
          if (index === 0) {
            startDate = new Date().toISOString();
          }
          
          if (template.estimated_duration_days) {
            const endDate = new Date();
            if (index > 0 && templates[index - 1].estimated_duration_days) {
              // Acumular días de etapas anteriores
              const previousDays = templates.slice(0, index).reduce((sum, t) => sum + (t.estimated_duration_days || 0), 0);
              endDate.setDate(endDate.getDate() + previousDays);
            }
            endDate.setDate(endDate.getDate() + template.estimated_duration_days);
            estimatedEndDate = endDate.toISOString();
          }
          
          insertStage.run([
            projectId,
            template.id,
            template.name,
            template.default_responsible_id,
            template.order_number,
            estimatedEndDate,
            startDate
          ]);
        });
        insertStage.finalize();
      }
    });

    const projectId = this.lastID;
    
    logAudit({
      organizationId,
      userId: req.user!.userId,
      action: 'CREATE',
      entityType: 'project',
      entityId: projectId,
      projectName: name,
      details: JSON.stringify({ name, description, contact: normalizedContact, client_id, responsible_id, deadline }),
      ipAddress: req.ip
    });

    res.status(201).json({
      id: projectId,
      name,
      description,
      contact: normalizedContact,
      client_id,
      deadline,
      message: 'Proyecto creado exitosamente'
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

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
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
        u.name as responsible_name,
        u.account_email as responsible_email,
        u.role as responsible_role
      FROM stages s
      LEFT JOIN users u ON s.responsible_id = u.id
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
        res.json({ ...project, stages: parsedStages });
      });
    });
  });
});

// Actualizar un proyecto
apiRouter.put('/projects/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, contact, status, client_id, responsible_id, deadline } = req.body;
  const organizationId = req.user!.organizationId;

  db.get('SELECT status, completed_date FROM projects WHERE id = ? AND organization_id = ?', [id, organizationId], (lookupError, existingProject: any) => {
    if (lookupError) return res.status(500).json({ error: lookupError.message });
    if (!existingProject) return res.status(404).json({ error: 'Proyecto no encontrado' });

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
          details: JSON.stringify({ name, description, contact: normalizedContact, status, client_id, responsible_id, deadline }),
        ipAddress: req.ip
      });
      });
      res.json({ message: 'Proyecto actualizado exitosamente' });
    });
  });
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
            db.run('UPDATE stages SET is_completed = 1, completed_date = CURRENT_TIMESTAMP WHERE id = ?', [stageId], (completeErr) => {
              if (completeErr) return rollbackAndReport(completeErr, callback);
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
      const commentsSql = 'SELECT * FROM comments WHERE stage_id = ? ORDER BY created_at DESC';
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
      db.get('SELECT s.name, p.organization_id, p.name as project_name FROM stages s INNER JOIN projects p ON s.project_id = p.id WHERE s.id = ? AND p.organization_id = ?', [stageId, req.user!.organizationId], (lookupErr, row: any) => {
        if (!lookupErr && row) logAudit({ organizationId: row.organization_id, userId: req.user!.userId, action: 'START', entityType: 'stage', entityId: stageId, projectName: row.project_name, details: JSON.stringify({ stage_name: row.name, project_name: row.project_name }), ipAddress: req.ip });
      });
      res.json({ message: 'Etapa iniciada exitosamente' });
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
  db.get('SELECT s.name, p.organization_id, p.name as project_name FROM stages s INNER JOIN projects p ON s.project_id = p.id WHERE s.id = ?', [id], (err, stageInfo: any) => {
    if (err) {
      return res.status(500).json({ error: err.message });
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
