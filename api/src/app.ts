import express, { type Request, type Response } from 'express';
import path from 'path';
import cors from 'cors';
import { apiRouter } from './apiRouter';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Rutas API
app.use('/api', apiRouter);

// Servir frontend en producción
const frontendPath = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(frontendPath));
app.get(/^(?!\/api).*/, (req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ==================== SERVER START ====================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});