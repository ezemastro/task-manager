import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === 'production';
  if (!secret) {
    if (isProd) {
      throw new Error('JWT_SECRET is required in production. Set it in Coolify per-app env.');
    }
    return 'dev-only-secret-do-not-use-in-production';
  }
  if (isProd) {
    if (secret === 'your-secret-key-change-in-production') {
      throw new Error('JWT_SECRET is set to the well-known default; change it in production.');
    }
    if (secret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in production.');
    }
  }
  return secret;
}
const JWT_SECRET = resolveJwtSecret();
const JWT_EXPIRES_IN = '7d'; // Token expira en 7 días

export interface JWTPayload {
  userId: number;
  organizationId: number;
  email: string;
  scopes: string[];
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
