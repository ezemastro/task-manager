import { Request, Response, NextFunction } from 'express';
import { verifyToken, JWTPayload } from './auth';

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
