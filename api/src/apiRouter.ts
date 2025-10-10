import { Router, type Request, type Response } from "express";
import sqlite3 from 'sqlite3';

export const apiRouter = Router();

// Database setup
const db = new sqlite3.Database('./database.sqlite', (err) => {
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
    // Tabla de usuarios
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        role TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de clientes
    db.run(`
      CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de proyectos/obras
    db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        client_id INTEGER,
        deadline DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active',
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
      )
    `);

    // Tabla de plantillas de etapas
    db.run(`
      CREATE TABLE IF NOT EXISTS stage_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        order_number INTEGER NOT NULL,
        default_responsible_id INTEGER,
        estimated_duration_days INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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

    // Tabla de etiquetas
    db.run(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        color TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
        content TEXT NOT NULL,
        author TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (stage_id) REFERENCES stages(id) ON DELETE CASCADE
      )
    `);

    // Insertar usuarios de ejemplo si la tabla está vacía
    // db.get('SELECT COUNT(*) as count FROM users', [], (err, row: any) => {
    //   if (!err && row.count === 0) {
    //     const defaultUsers = [
    //       ['Juan Pérez', 'juan.perez@example.com', 'Ingeniero Civil'],
    //       ['María García', 'maria.garcia@example.com', 'Arquitecta'],
    //       ['Carlos Rodríguez', 'carlos.rodriguez@example.com', 'Jefe de Obra'],
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

// ==================== CLIENTS ENDPOINTS ====================

// GET all clients
apiRouter.get('/clients', (req: Request, res: Response) => {
  db.all('SELECT * FROM clients ORDER BY name', [], (err, rows) => {
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
  
  if (!name) {
    res.status(400).json({ error: 'El nombre del cliente es requerido' });
    return;
  }

  db.run(
    'INSERT INTO clients (name, email, phone) VALUES (?, ?, ?)',
    [name, email, phone],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.status(201).json({ id: this.lastID, name, email, phone });
    }
  );
});

// PUT update client
apiRouter.put('/clients/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, email, phone } = req.body;

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
      res.json({ id, name, email, phone });
    }
  );
});

// DELETE client
apiRouter.delete('/clients/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  
  db.run('DELETE FROM clients WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'Cliente no encontrado' });
      return;
    }
    res.json({ message: 'Cliente eliminado correctamente' });
  });
});

// ==================== STAGE TEMPLATES ENDPOINTS ====================

// GET all stage templates
apiRouter.get('/stage-templates', (req: Request, res: Response) => {
  const sql = `
    SELECT st.*, u.name as default_responsible_name 
    FROM stage_templates st
    LEFT JOIN users u ON st.default_responsible_id = u.id
    ORDER BY st.order_number
  `;
  
  db.all(sql, [], (err, rows) => {
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
  
  if (!name || order_number === undefined) {
    res.status(400).json({ error: 'El nombre y el orden son requeridos' });
    return;
  }

  db.run(
    'INSERT INTO stage_templates (name, order_number, default_responsible_id, estimated_duration_days) VALUES (?, ?, ?, ?)',
    [name, order_number, default_responsible_id || null, estimated_duration_days || null],
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

// PUT update stage template
apiRouter.put('/stage-templates/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, order_number, default_responsible_id, estimated_duration_days } = req.body;

  db.run(
    'UPDATE stage_templates SET name = COALESCE(?, name), order_number = COALESCE(?, order_number), default_responsible_id = COALESCE(?, default_responsible_id), estimated_duration_days = COALESCE(?, estimated_duration_days) WHERE id = ?',
    [name, order_number, default_responsible_id, estimated_duration_days, id],
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
  const { name, description, client_id, deadline } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'El nombre del proyecto es requerido' });
  }

  const sql = 'INSERT INTO projects (name, description, client_id, deadline) VALUES (?, ?, ?, ?)';
  db.run(sql, [name, description || null, client_id || null, deadline || null], function (err) {
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

    res.status(201).json({
      id: this.lastID,
      name,
      description,
      client_id,
      deadline,
      message: 'Proyecto creado exitosamente'
    });
  });
});

// Obtener todos los proyectos con filtros
apiRouter.get('/projects', (req: Request, res: Response) => {
  const { name, has_completed_stages, has_pending_stages, status } = req.query;

  let sql = `
    SELECT 
      p.*,
      c.name as client_name,
      COUNT(DISTINCT s.id) as total_stages,
      COUNT(DISTINCT CASE WHEN s.is_completed = 1 THEN s.id END) as completed_stages,
      (SELECT name FROM stages WHERE project_id = p.id AND is_completed = 0 ORDER BY order_number LIMIT 1) as current_stage
    FROM projects p
    LEFT JOIN clients c ON p.client_id = c.id
    LEFT JOIN stages s ON p.id = s.project_id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (name) {
    sql += ' AND p.name LIKE ?';
    params.push(`%${name}%`);
  }

  if (status) {
    sql += ' AND p.status = ?';
    params.push(status);
  } else {
    // Por defecto, no mostrar proyectos completados
    sql += ' AND p.status != ?';
    params.push('completed');
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
    SELECT p.*, c.name as client_name 
    FROM projects p
    LEFT JOIN clients c ON p.client_id = c.id
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
        u.email as responsible_email,
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
            SELECT id, author, content, created_at
            FROM comments
            WHERE stage_id = ?
            ORDER BY created_at DESC
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
  const { name, description, status, client_id, deadline } = req.body;

  const updates: string[] = [];
  const values: any[] = [];

  if (name !== undefined) {
    updates.push('name = ?');
    values.push(name);
  }
  if (description !== undefined) {
    updates.push('description = ?');
    values.push(description);
  }
  if (status !== undefined) {
    updates.push('status = ?');
    values.push(status);
  }
  if (client_id !== undefined) {
    updates.push('client_id = ?');
    values.push(client_id);
  }
  if (deadline !== undefined) {
    updates.push('deadline = ?');
    values.push(deadline);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No hay campos para actualizar' });
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  const sql = `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`;
  db.run(sql, values, function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }
    res.json({ message: 'Proyecto actualizado exitosamente' });
  });
});

// Eliminar un proyecto
apiRouter.delete('/projects/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  const sql = 'DELETE FROM projects WHERE id = ?';
  db.run(sql, [id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }
    res.json({ message: 'Proyecto eliminado exitosamente' });
  });
});

// ==================== USERS ENDPOINTS ====================

// Crear un nuevo usuario
apiRouter.post('/users', (req: Request, res: Response) => {
  const { name, email, role } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'El nombre y email son requeridos' });
  }

  const sql = 'INSERT INTO users (name, email, role) VALUES (?, ?, ?)';
  db.run(sql, [name, email, role || null], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Ya existe un usuario con ese email' });
      }
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({
      id: this.lastID,
      name,
      email,
      role,
      message: 'Usuario creado exitosamente'
    });
  });
});

// Obtener todos los usuarios
apiRouter.get('/users', (req: Request, res: Response) => {
  const { name, role } = req.query;
  
  let sql = 'SELECT * FROM users WHERE 1=1';
  const params: any[] = [];

  if (name) {
    sql += ' AND name LIKE ?';
    params.push(`%${name}%`);
  }

  if (role) {
    sql += ' AND role LIKE ?';
    params.push(`%${role}%`);
  }

  sql += ' ORDER BY name';

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

  const sql = 'SELECT * FROM users WHERE id = ?';
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

  const sql = 'UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), role = COALESCE(?, role) WHERE id = ?';
  db.run(sql, [name, email, role, id], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Ya existe un usuario con ese email' });
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

// ==================== STAGES ENDPOINTS ====================

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

        // Verificar que la etapa anterior esté completada (si existe)
        if (order_number > 1) {
          const prevStageSql = 'SELECT is_completed FROM stages WHERE project_id = ? AND order_number = ?';
          db.get(prevStageSql, [project_id, order_number - 1], (err, prevStage: any) => {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            if (prevStage && !prevStage.is_completed) {
              return res.status(400).json({ 
                error: 'No se puede crear una nueva etapa hasta que la anterior esté completada' 
              });
            }

            insertStage();
          });
        } else {
          insertStage();
        }

        function insertStage() {
          const sql = `
            INSERT INTO stages (project_id, name, responsible_id, start_date, estimated_end_date, order_number) 
            VALUES (?, ?, ?, ?, ?, ?)
          `;
          db.run(sql, [project_id, name, responsible_id, start_date, estimated_end_date, order_number], function (err) {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            res.status(201).json({
              id: this.lastID,
              project_id,
              name,
              responsible_id,
              start_date,
              estimated_end_date,
              order_number,
              message: 'Etapa creada exitosamente'
            });
          });
        }
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

  let sql = `
    SELECT 
      s.*,
      u.name as responsible_name,
      u.email as responsible_email,
      u.role as responsible_role,
      p.name as project_name,
      p.client_id,
      c.name as client_name
    FROM stages s
    INNER JOIN projects p ON s.project_id = p.id
    LEFT JOIN users u ON s.responsible_id = u.id
    LEFT JOIN clients c ON p.client_id = c.id
    WHERE p.status != 'completed'
  `;
  const params: any[] = [];

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
          SELECT id, author, content, created_at
          FROM comments
          WHERE stage_id = ?
          ORDER BY created_at DESC
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
      u.email as responsible_email,
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
  const { id } = req.params;

  // Obtener información de la etapa actual
  db.get('SELECT * FROM stages WHERE id = ?', [id], (err, currentStage: any) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!currentStage) {
      return res.status(404).json({ error: 'Etapa no encontrada' });
    }

    // Marcar la etapa como completada - NO inicia la siguiente automáticamente
    const completeSql = 'UPDATE stages SET is_completed = 1, completed_date = CURRENT_TIMESTAMP WHERE id = ?';
    db.run(completeSql, [id], function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.json({ 
        message: 'Etapa completada exitosamente'
      });
    });
  });
});

// Iniciar una etapa manualmente
apiRouter.put('/stages/:id/start', (req: Request, res: Response) => {
  const { id } = req.params;

  const sql = 'UPDATE stages SET start_date = CURRENT_TIMESTAMP WHERE id = ? AND start_date IS NULL';
  db.run(sql, [id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(400).json({ error: 'La etapa ya fue iniciada o no existe' });
    }
    res.json({ message: 'Etapa iniciada exitosamente' });
  });
});

// Actualizar una etapa
apiRouter.put('/stages/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, responsible_id, start_date, estimated_end_date } = req.body;

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
    const sql = `
      UPDATE stages 
      SET name = COALESCE(?, name), 
          responsible_id = COALESCE(?, responsible_id), 
          start_date = COALESCE(?, start_date), 
          estimated_end_date = COALESCE(?, estimated_end_date)
      WHERE id = ?
    `;

    db.run(sql, [name, responsible_id, start_date, estimated_end_date, id], function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Etapa no encontrada' });
      }
      res.json({ message: 'Etapa actualizada exitosamente' });
    });
  }
});

// Eliminar una etapa
apiRouter.delete('/stages/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  const sql = 'DELETE FROM stages WHERE id = ?';
  db.run(sql, [id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Etapa no encontrada' });
    }
    res.json({ message: 'Etapa eliminada exitosamente' });
  });
});

// Añadir etiqueta a una etapa
apiRouter.post('/stages/:id/tags', (req: Request, res: Response) => {
  const { id } = req.params;
  const { tag_id } = req.body;

  if (!tag_id) {
    return res.status(400).json({ error: 'tag_id es requerido' });
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

  if (!name) {
    return res.status(400).json({ error: 'El nombre de la etiqueta es requerido' });
  }

  const sql = 'INSERT INTO tags (name, color) VALUES (?, ?)';
  db.run(sql, [name, color || null], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Ya existe una etiqueta con ese nombre' });
      }
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({
      id: this.lastID,
      name,
      color,
      message: 'Etiqueta creada exitosamente'
    });
  });
});

// Obtener todas las etiquetas
apiRouter.get('/tags', (req: Request, res: Response) => {
  const sql = `
    SELECT 
      t.*,
      COUNT(DISTINCT st.stage_id) as usage_count
    FROM tags t
    LEFT JOIN stage_tags st ON t.id = st.tag_id
    GROUP BY t.id
    ORDER BY t.name
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Obtener una etiqueta por ID
apiRouter.get('/tags/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  const sql = 'SELECT * FROM tags WHERE id = ?';
  db.get(sql, [id], (err, row) => {
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

  const sql = 'UPDATE tags SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ?';
  db.run(sql, [name, color, id], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Ya existe una etiqueta con ese nombre' });
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

  const sql = 'DELETE FROM tags WHERE id = ?';
  db.run(sql, [id], function (err) {
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
  const { stage_id, content, author } = req.body;

  if (!stage_id || !content || !author) {
    return res.status(400).json({ error: 'stage_id, content y author son requeridos' });
  }

  // Verificar que la etapa existe
  db.get('SELECT id FROM stages WHERE id = ?', [stage_id], (err, stage) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!stage) {
      return res.status(404).json({ error: 'Etapa no encontrada' });
    }

    const sql = 'INSERT INTO comments (stage_id, content, author) VALUES (?, ?, ?)';
    db.run(sql, [stage_id, content, author], function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({
        id: this.lastID,
        stage_id,
        content,
        author,
        message: 'Comentario añadido exitosamente'
      });
    });
  });
});

// Obtener comentarios por etapa
apiRouter.get('/stages/:stageId/comments', (req: Request, res: Response) => {
  const { stageId } = req.params;

  const sql = 'SELECT * FROM comments WHERE stage_id = ? ORDER BY created_at DESC';
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
      s.name as stage_name,
      p.name as project_name
    FROM comments c
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

  const sql = 'DELETE FROM comments WHERE id = ?';
  db.run(sql, [id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Comentario no encontrado' });
    }
    res.json({ message: 'Comentario eliminado exitosamente' });
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
