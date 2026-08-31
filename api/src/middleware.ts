import { Request, Response, NextFunction } from 'express';
import { verifyToken, JWTPayload } from './auth';
import { db } from './apiRouter';

// Extender el tipo Request para incluir user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.auth_token;

  if (!token) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  req.user = payload;
  next();
}

// Middleware opcional: no falla si no hay token
export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.auth_token;

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }

  next();
}

// Middleware que acepta tanto auth_token como temp_auth_token
export function flexibleAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.auth_token || req.cookies?.temp_auth_token;

  if (!token) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  req.user = payload;
  next();
}

// Middleware admin: requiere scope 'admin' en el JWT actual.
// Lee los scopes de req.user (poblado por authMiddleware/flexibleAuthMiddleware);
// NO consulta /api/auth/me.
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.scopes?.includes('admin')) {
    return res.status(403).json({ error: 'Admin required' });
  }
  next();
}

// Middleware super admin: verifica el flag is_super_admin leyendo la base de
// datos por el email del JWT (req.user.email) en cada request. Nunca confía
// en scopes del token. El acceso a db es diferido (solo en el request), lo
// que hace seguro el import circular apiRouter ⇄ middleware (precedente: authRouter).
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.email) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  db.get(
    'SELECT is_super_admin FROM accounts WHERE LOWER(email) = ?',
    [req.user.email],
    (err, row: { is_super_admin?: number } | undefined) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!row || !row.is_super_admin) {
        return res.status(403).json({ error: 'Se requieren permisos de super administrador' });
      }
      next();
    }
  );
}
