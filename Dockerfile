# ==================== BUILD STAGE - CLIENT ====================
FROM node:20-alpine AS client-builder

WORKDIR /app/client

# Copiar package.json y package-lock.json del cliente
COPY client/package*.json ./

# Instalar dependencias del cliente
RUN npm install --production=false

# Copiar código fuente del cliente
COPY client/ ./

# Build del cliente (genera dist/)
RUN npm run build

# ==================== BUILD STAGE - API ====================
FROM node:20-alpine AS api-builder

WORKDIR /app/api

# Copiar package.json y package-lock.json de la API
COPY api/package*.json ./

# Instalar dependencias de la API (incluyendo devDependencies para compilar TypeScript)
RUN npm install --production=false

# Copiar código fuente de la API
COPY api/ ./

# Compilar TypeScript a JavaScript
RUN npm run build

# ==================== PRODUCTION STAGE ====================
FROM node:20-alpine

WORKDIR /app

# Instalar dumb-init para manejar señales correctamente
RUN apk add --no-cache dumb-init

# Crear usuario no-root para mayor seguridad
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copiar package.json de la API
COPY api/package*.json ./

# Instalar solo dependencias de producción
RUN npm install --only=production && npm cache clean --force

# Copiar código compilado de la API desde el build stage
COPY --from=api-builder /app/api/dist ./dist

# Copiar archivos estáticos necesarios
COPY --from=api-builder /app/api/src ./src

# Copiar migraciones
COPY api/migrations ./migrations

# Copiar el frontend compilado desde el build stage
COPY --from=client-builder /app/client/dist ./client/dist

# Cambiar permisos de todos los archivos a nodejs
RUN chown -R nodejs:nodejs /app

# Exponer el puerto
EXPOSE 3000

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000

# En producción con volúmenes montados, ejecutar como root
# para evitar problemas de permisos con ./data del host
# USER nodejs

# Usar dumb-init para manejar señales correctamente
ENTRYPOINT ["dumb-init", "--"]

# Comando para iniciar la aplicación
CMD ["node", "dist/app.js"]
