import { Router, Request, Response } from 'express';
import { db } from './apiRouter';
import { generateToken, hashPassword, comparePassword } from './auth';
import { authMiddleware, flexibleAuthMiddleware } from './middleware';
import { sendVerificationEmail, sendPasswordResetEmail } from './emailService';
import crypto from 'crypto';

export const authRouter = Router();

// ==================== REGISTRO ====================

// Registro de nueva cuenta
authRouter.post('/register', async (req: Request, res: Response) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, contraseña y nombre son requeridos' });
  }

  // Validar formato de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Formato de email inválido' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  try {
    const passwordHash = await hashPassword(password);
    
    // Generar token de verificación
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

    db.run(
      `INSERT INTO accounts 
       (email, password_hash, name, email_verified, verification_token, verification_token_expires) 
       VALUES (?, ?, ?, 0, ?, ?)`,
      [email.toLowerCase().trim(), passwordHash, name.trim(), verificationToken, verificationExpires.toISOString()],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Ya existe una cuenta con ese email' });
          }
          return res.status(500).json({ error: err.message });
        }

        const accountId = this.lastID;

        // Enviar email de verificación
        sendVerificationEmail(email.toLowerCase().trim(), verificationToken, name.trim())
          .then(() => {
            console.log('✅ Email de verificación enviado');
          })
          .catch((error) => {
            console.error('❌ Error al enviar email:', error);
            // No fallar el registro si el email no se puede enviar
          });

        // Buscar organizaciones donde este email fue invitado
        db.all(
          'SELECT DISTINCT organization_id FROM users WHERE account_email = ?',
          [email.toLowerCase().trim()],
          (err, invites: any[]) => {
            if (err) {
              console.error('Error al buscar invitaciones:', err);
            }

            // Crear membresías automáticamente para organizaciones donde fue invitado
            if (invites && invites.length > 0) {
              const stmt = db.prepare(
                'INSERT OR IGNORE INTO organization_members (account_id, organization_id, role) VALUES (?, ?, ?)'
              );
              invites.forEach(invite => {
                stmt.run([accountId, invite.organization_id, 'member']);
              });
              stmt.finalize();
            }

            res.status(201).json({
              message: 'Cuenta creada exitosamente. Por favor verifica tu email.',
              accountId,
              email: email.toLowerCase().trim(),
              name: name.trim(),
              organizationCount: invites ? invites.length : 0,
              requiresEmailVerification: true
            });
          }
        );
      }
    );
  } catch (err) {
    return res.status(500).json({ error: 'Error al procesar la contraseña' });
  }
});

// ==================== LOGIN ====================

// Login - Paso 1: Autenticar cuenta
authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }

  db.get(
    'SELECT * FROM accounts WHERE email = ?',
    [email.toLowerCase().trim()],
    async (err, account: any) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!account) {
        return res.status(401).json({ error: 'Email o contraseña incorrectos' });
      }

      const validPassword = await comparePassword(password, account.password_hash);

      if (!validPassword) {
        return res.status(401).json({ error: 'Email o contraseña incorrectos' });
      }

      // Verificar si el email está verificado
      if (!account.email_verified) {
        return res.status(403).json({ 
          error: 'Por favor verifica tu email antes de iniciar sesión',
          requiresEmailVerification: true
        });
      }

      // Buscar organizaciones del usuario
      db.all(
        `SELECT o.id, o.name, om.role, om.scopes 
         FROM organization_members om
         INNER JOIN organizations o ON om.organization_id = o.id
         WHERE om.account_id = ?
         ORDER BY o.name`,
        [account.id],
        (err, organizations: any[]) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          // Generar token temporal solo con account_id (sin organización aún)
          const tempToken = generateToken({
            userId: 0, // Temporal
            organizationId: 0, // Temporal
            email: account.email,
            scopes: []
          });

          res.cookie('temp_auth_token', tempToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 10 * 60 * 1000 // 10 minutos
          });

          res.json({
            message: 'Login exitoso',
            accountId: account.id,
            email: account.email,
            name: account.name,
            organizations: organizations,
            requiresOrganizationSelection: organizations.length > 1,
            autoSelectOrganization: organizations.length === 1 ? organizations[0].id : null
          });
        }
      );
    }
  );
});

// Login - Paso 2: Seleccionar organización
authRouter.post('/select-organization', (req: Request, res: Response) => {
  const { accountId, organizationId } = req.body;

  if (!accountId || !organizationId) {
    return res.status(400).json({ error: 'Account ID y Organization ID son requeridos' });
  }

  // Verificar que el usuario pertenece a la organización
  db.get(
    `SELECT om.*, a.email, a.name as account_name
     FROM organization_members om
     INNER JOIN accounts a ON om.account_id = a.id
     WHERE om.account_id = ? AND om.organization_id = ?`,
    [accountId, organizationId],
    (err, membership: any) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!membership) {
        return res.status(403).json({ error: 'No tienes acceso a esta organización' });
      }

      // Obtener o crear usuario en la tabla users
      db.get(
        'SELECT id FROM users WHERE organization_id = ? AND account_email = ?',
        [organizationId, membership.email],
        (err, user: any) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          if (user) {
            // Usuario ya existe, generar token
            generateFinalToken(user.id, organizationId, membership.email, membership.scopes, res);
          } else {
            // Crear usuario en esta organización
            db.run(
              'INSERT INTO users (organization_id, account_email, name, role) VALUES (?, ?, ?, ?)',
              [organizationId, membership.email, membership.account_name, membership.role],
              function(err) {
                if (err) {
                  return res.status(500).json({ error: err.message });
                }
                generateFinalToken(this.lastID, organizationId, membership.email, membership.scopes, res);
              }
            );
          }
        }
      );
    }
  );
});

function generateFinalToken(userId: number, organizationId: number, email: string, scopes: string, res: Response) {
  let parsedScopes: string[] = [];
  try {
    parsedScopes = JSON.parse(scopes || '[]');
  } catch {
    parsedScopes = [];
  }

  const token = generateToken({
    userId,
    organizationId,
    email,
    scopes: parsedScopes
  });

  // Limpiar token temporal
  res.clearCookie('temp_auth_token');

  // Establecer token final
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días
  });

  res.json({
    message: 'Organización seleccionada exitosamente',
    userId,
    organizationId
  });
}

// ==================== LOGOUT ====================

authRouter.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('auth_token');
  res.clearCookie('temp_auth_token');
  res.json({ message: 'Sesión cerrada exitosamente' });
});

// ==================== USER INFO ====================

authRouter.get('/me', authMiddleware, (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  db.get(
    `SELECT u.*, o.name as organization_name, a.name as account_name, a.email, a.id as account_id, a.is_super_admin
     FROM users u
     INNER JOIN organizations o ON u.organization_id = o.id
     INNER JOIN accounts a ON u.account_email = a.email
     WHERE u.id = ?`,
    [req.user.userId],
    (err, user: any) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      res.json({
        id: user.id,
        accountId: user.account_id,
        organizationId: user.organization_id,
        organizationName: user.organization_name,
        name: user.account_name,
        email: user.email,
        role: user.role,
        isSuperAdmin: Boolean(user.is_super_admin)
      });
    }
  );
});

// ==================== ORGANIZATIONS ====================

// Crear nueva organización (requiere estar autenticado)
authRouter.post('/organizations', flexibleAuthMiddleware, (req: Request, res: Response) => {
  const { name } = req.body;

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: 'El nombre de la organización es requerido' });
  }

  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }

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

      // Obtener account_id desde el email del usuario
      db.get('SELECT id, name FROM accounts WHERE email = ?', [req.user!.email], (err, account: any) => {
        if (err || !account) {
          return res.status(500).json({ error: 'Error al obtener cuenta' });
        }

        // Crear membresía como admin
        db.run(
          'INSERT INTO organization_members (account_id, organization_id, role, scopes) VALUES (?, ?, ?, ?)',
          [account.id, orgId, 'admin', '["admin"]'],
          (err) => {
            if (err) {
              return res.status(500).json({ error: err.message });
            }

            // Crear usuario en la organización
            db.run(
              'INSERT INTO users (organization_id, account_email, name, role) VALUES (?, ?, ?, ?)',
              [orgId, req.user!.email, account.name, 'Administrador'],
              function(err) {
                if (err) {
                  return res.status(500).json({ error: err.message });
                }

                res.status(201).json({
                  id: orgId,
                  name: name.trim(),
                  message: 'Organización creada exitosamente'
                });
              }
            );
          }
        );
      });
    }
  );
});

// Obtener organizaciones del usuario actual
authRouter.get('/my-organizations', flexibleAuthMiddleware, (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  db.get('SELECT id FROM accounts WHERE email = ?', [req.user.email], (err, account: any) => {
    if (err || !account) {
      return res.status(500).json({ error: 'Error al obtener cuenta' });
    }

    db.all(
      `SELECT o.id, o.name, om.role, om.scopes 
       FROM organization_members om
       INNER JOIN organizations o ON om.organization_id = o.id
       WHERE om.account_id = ?
       ORDER BY o.name`,
      [account.id],
      (err, organizations) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(organizations);
      }
    );
  });
});

// Actualizar nombre de organización
authRouter.put('/organizations/:orgId', authMiddleware, (req: Request, res: Response) => {
  const { orgId } = req.params;
  const { name } = req.body;

  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  if (req.user.organizationId !== parseInt(orgId)) {
    return res.status(403).json({ error: 'No tienes permiso para modificar esta organización' });
  }

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: 'El nombre es requerido' });
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
        id: orgId,
        name: name.trim(),
        message: 'Organización actualizada exitosamente'
      });
    }
  );
});
// ==================== VERIFICACIÓN DE EMAIL ====================

// Verificar email
authRouter.get('/verify-email', (req: Request, res: Response) => {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Token de verificación requerido' });
  }

  db.get(
    'SELECT * FROM accounts WHERE verification_token = ?',
    [token],
    (err, account: any) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!account) {
        return res.status(400).json({ error: 'Token de verificación inválido' });
      }

      // Verificar si el token expiró
      const now = new Date();
      const expires = new Date(account.verification_token_expires);
      if (now > expires) {
        return res.status(400).json({ error: 'Token de verificación expirado' });
      }

      // Marcar email como verificado y limpiar token
      db.run(
        `UPDATE accounts 
         SET email_verified = 1, verification_token = NULL, verification_token_expires = NULL 
         WHERE id = ?`,
        [account.id],
        (err) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          res.json({
            message: 'Email verificado exitosamente',
            email: account.email
          });
        }
      );
    }
  );
});

// Reenviar email de verificación
authRouter.post('/resend-verification', (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email requerido' });
  }

  db.get(
    'SELECT * FROM accounts WHERE email = ?',
    [email.toLowerCase().trim()],
    (err, account: any) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!account) {
        // No revelar que la cuenta no existe por seguridad
        return res.json({ message: 'Si la cuenta existe, se enviará un email de verificación' });
      }

      if (account.email_verified) {
        return res.status(400).json({ error: 'El email ya está verificado' });
      }

      // Generar nuevo token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

      db.run(
        'UPDATE accounts SET verification_token = ?, verification_token_expires = ? WHERE id = ?',
        [verificationToken, verificationExpires.toISOString(), account.id],
        (err) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          // Enviar email
          sendVerificationEmail(account.email, verificationToken, account.name)
            .then(() => {
              res.json({ message: 'Email de verificación enviado' });
            })
            .catch((error) => {
              console.error('Error al enviar email:', error);
              res.status(500).json({ error: 'Error al enviar email' });
            });
        }
      );
    }
  );
});

// ==================== RECUPERACIÓN DE CONTRASEÑA ====================

// Solicitar recuperación de contraseña
authRouter.post('/forgot-password', (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email requerido' });
  }

  db.get(
    'SELECT * FROM accounts WHERE email = ?',
    [email.toLowerCase().trim()],
    (err, account: any) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      // No revelar si la cuenta existe o no por seguridad
      if (!account) {
        return res.json({ message: 'Si la cuenta existe, recibirás un email con instrucciones' });
      }

      // Generar token de reseteo
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

      db.run(
        'UPDATE accounts SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
        [resetToken, resetExpires.toISOString(), account.id],
        (err) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          // Enviar email
          sendPasswordResetEmail(account.email, resetToken, account.name)
            .then(() => {
              res.json({ message: 'Si la cuenta existe, recibirás un email con instrucciones' });
            })
            .catch((error) => {
              console.error('Error al enviar email:', error);
              res.json({ message: 'Si la cuenta existe, recibirás un email con instrucciones' });
            });
        }
      );
    }
  );
});

// Resetear contraseña
authRouter.post('/reset-password', async (req: Request, res: Response) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: 'Token y contraseña son requeridos' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  db.get(
    'SELECT * FROM accounts WHERE reset_token = ?',
    [token],
    async (err, account: any) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!account) {
        return res.status(400).json({ error: 'Token de reseteo inválido' });
      }

      // Verificar si el token expiró
      const now = new Date();
      const expires = new Date(account.reset_token_expires);
      if (now > expires) {
        return res.status(400).json({ error: 'Token de reseteo expirado' });
      }

      try {
        const passwordHash = await hashPassword(password);

        // Actualizar contraseña y limpiar token
        db.run(
          `UPDATE accounts 
           SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL 
           WHERE id = ?`,
          [passwordHash, account.id],
          (err) => {
            if (err) {
              return res.status(500).json({ error: err.message });
            }

            res.json({
              message: 'Contraseña actualizada exitosamente'
            });
          }
        );
      } catch (err) {
        return res.status(500).json({ error: 'Error al procesar la contraseña' });
      }
    }
  );
});