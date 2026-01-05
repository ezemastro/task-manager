import { Router, Request, Response } from 'express';
import { db } from './apiRouter';
import { generateToken, hashPassword, comparePassword } from './auth';
import { authMiddleware } from './middleware';

export const authRouter = Router();

// ==================== ORGANIZATIONS ====================

// Obtener todas las organizaciones (para selector)
authRouter.get('/organizations', (req: Request, res: Response) => {
  db.all('SELECT id, name FROM organizations ORDER BY name', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Crear nueva organización
authRouter.post('/organizations', (req: Request, res: Response) => {
  const { name, adminName, adminEmail } = req.body;

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: 'El nombre de la organización es requerido' });
  }

  // Usar valores por defecto si no se proporcionan
  const defaultAdminName = adminName?.trim() || 'Administrador';
  const defaultAdminEmail = adminEmail?.trim() || `admin@${name.trim().toLowerCase().replace(/\s+/g, '-')}.local`;

  db.run(
    'INSERT INTO organizations (name) VALUES (?)',
    [name.trim()],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Ya existe una organización con ese nombre' });
        }
        return res.status(500).json({ error: err.message });
      }

      const orgId = this.lastID;
      
      // Crear usuario administrador por defecto para la nueva organización (sin email)
      db.run(
        `INSERT INTO users (organization_id, name, email, role, scopes) 
         VALUES (?, ?, NULL, 'Administrador', '["admin"]')`,
        [orgId, defaultAdminName],
        function(userErr) {
          if (userErr) {
            console.error('Error creando usuario admin:', userErr);
            // Aunque falle la creación del usuario, devolvemos éxito de la organización
            return res.json({
              id: orgId,
              name: name.trim(),
              message: 'Organización creada (sin usuario por defecto)',
              warning: 'No se pudo crear el usuario administrador'
            });
          }

          const userId = this.lastID;
          
          // Generar token para login automático
          const token = generateToken({
            userId: userId,
            organizationId: orgId,
            email: '',
            scopes: ['admin']
          });

          // Establecer cookie
          res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días
          });

          res.json({
            id: orgId,
            name: name.trim(),
            userId: userId,
            userName: defaultAdminName,
            message: 'Organización creada y sesión iniciada exitosamente'
          });
        }
      );
    }
  );
});

// Actualizar nombre de organización
authRouter.put('/organizations/:orgId', authMiddleware, (req: Request, res: Response) => {
  const { orgId } = req.params;
  const { name } = req.body;

  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  // Verificar que el usuario pertenece a esta organización
  if (req.user.organizationId !== parseInt(orgId)) {
    return res.status(403).json({ error: 'No tienes permiso para modificar esta organización' });
  }

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: 'El nombre de la organización es requerido' });
  }

  db.run(
    'UPDATE organizations SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name.trim(), orgId],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Ya existe una organización con ese nombre' });
        }
        return res.status(500).json({ error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Organización no encontrada' });
      }

      res.json({
        id: parseInt(orgId),
        name: name.trim(),
        message: 'Nombre de organización actualizado exitosamente'
      });
    }
  );
});

// ==================== USERS BY ORGANIZATION ====================

// Obtener usuarios de una organización
authRouter.get('/organizations/:orgId/users', (req: Request, res: Response) => {
  const { orgId } = req.params;

  db.all(
    'SELECT id, name, email, role FROM users WHERE organization_id = ? ORDER BY name',
    [orgId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
});

// ==================== AUTHENTICATION ====================

// Login
authRouter.post('/login', (req: Request, res: Response) => {
  const { organizationId, userId, password } = req.body;

  if (!organizationId || !userId) {
    return res.status(400).json({ error: 'Organización y usuario son requeridos' });
  }

  // Obtener usuario con su contraseña
  db.get(
    `SELECT id, organization_id, email, password_hash, scopes 
     FROM users 
     WHERE id = ? AND organization_id = ?`,
    [userId, organizationId],
    async (err, user: any) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!user) {
        return res.status(401).json({ error: 'Usuario no encontrado' });
      }

      // Si el usuario no tiene contraseña, permitir login sin contraseña
      if (!user.password_hash) {
        if (password && password.trim() !== '') {
          return res.status(401).json({ error: 'Este usuario aún no tiene contraseña configurada' });
        }
      } else {
        // Si tiene contraseña, verificarla
        if (!password) {
          return res.status(401).json({ error: 'Contraseña requerida' });
        }

        const isValid = await comparePassword(password, user.password_hash);
        if (!isValid) {
          return res.status(401).json({ error: 'Contraseña incorrecta' });
        }
      }

      // Parsear scopes
      let scopes: string[] = [];
      try {
        scopes = JSON.parse(user.scopes || '[]');
      } catch (e) {
        scopes = [];
      }

      // Generar token
      const token = generateToken({
        userId: user.id,
        organizationId: user.organization_id,
        email: user.email,
        scopes
      });

      // Establecer cookie
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días
      });

      res.json({
        message: 'Login exitoso',
        user: {
          id: user.id,
          organizationId: user.organization_id,
          email: user.email,
          scopes
        }
      });
    }
  );
});

// Verificar sesión actual
authRouter.get('/me', authMiddleware, (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  // Obtener información completa del usuario
  db.get(
    'SELECT id, organization_id, name, email, role, scopes FROM users WHERE id = ?',
    [req.user.userId],
    (err, user: any) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      // Obtener nombre de la organización
      db.get(
        'SELECT name FROM organizations WHERE id = ?',
        [user.organization_id],
        (err, org: any) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          let scopes: string[] = [];
          try {
            scopes = JSON.parse(user.scopes || '[]');
          } catch (e) {
            scopes = [];
          }

          res.json({
            id: user.id,
            organizationId: user.organization_id,
            organizationName: org?.name || 'Desconocida',
            name: user.name,
            email: user.email,
            role: user.role,
            scopes
          });
        }
      );
    }
  );
});

// Logout
authRouter.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('auth_token');
  res.json({ message: 'Logout exitoso' });
});

// Cambiar contraseña
authRouter.put('/change-password', authMiddleware, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }

  // Obtener usuario actual
  db.get(
    'SELECT password_hash FROM users WHERE id = ?',
    [req.user.userId],
    async (err, user: any) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      // Si tiene contraseña actual, verificarla
      if (user.password_hash) {
        if (!currentPassword) {
          return res.status(400).json({ error: 'Contraseña actual requerida' });
        }

        const isValid = await comparePassword(currentPassword, user.password_hash);
        if (!isValid) {
          return res.status(401).json({ error: 'Contraseña actual incorrecta' });
        }
      }

      // Hashear nueva contraseña
      const newHash = await hashPassword(newPassword);

      // Actualizar contraseña
      db.run(
        'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newHash, req.user!.userId],
        (err) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          res.json({ message: 'Contraseña actualizada exitosamente' });
        }
      );
    }
  );
});
