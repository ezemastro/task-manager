import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { apiRouter } from './apiRouter';
import { authRouter } from './authRouter';
import { backupsRouter } from './backupsRouter';
import { authMiddleware, requireAdmin } from './middleware';
import { startBackupScheduler } from './backupScheduler';
import { runMigrations } from './runMigrations';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Confiar en el proxy (Nginx)
app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: true, // En desarrollo permite cualquier origen
  credentials: true // Permite enviar cookies
}));
app.use(express.json());
app.use(cookieParser());

// Health check endpoint (para Docker)
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rutas de autenticación (públicas)
app.use('/api/auth', authRouter);

// Rutas API (protegidas)
app.use('/api', apiRouter);

// Rutas de backups (protegidas + admin)
app.use('/api/backups', authMiddleware, requireAdmin, backupsRouter);

// Headers de seguridad y SEO
app.use((req: Request, res: Response, next) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Cache control para archivos estáticos
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (req.path === '/robots.txt' || req.path === '/sitemap.xml' || req.path === '/manifest.json') {
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 día
  } else {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  
  next();
});

// Servir frontend en producción
const frontendPath = process.env.NODE_ENV === 'production' 
  ? path.join('/app', 'client', 'dist')
  : path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(frontendPath));

// Manejar rutas de SPA (sin /api)
app.get(/^(?!\/api).*/, (req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ==================== SERVER START ====================

async function startServer() {
  // Ejecutar migraciones solo en producción
  if (process.env.NODE_ENV === 'production') {
    try {
      await runMigrations();
    } catch (error) {
      console.error('❌ Error ejecutando migraciones. El servidor NO se iniciará.');
      process.exit(1);
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    startBackupScheduler();
  });
}

startServer().catch((error) => {
  console.error('❌ Error al iniciar el servidor:', error);
  process.exit(1);
});