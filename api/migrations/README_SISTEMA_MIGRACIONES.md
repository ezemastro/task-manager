# Sistema de Migraciones Automáticas

## ¿Cómo funciona?

Cuando la API se inicia en **producción** (NODE_ENV=production), automáticamente ejecuta todos los scripts de migración que encuentre en la carpeta `migrations/` que aún no hayan sido ejecutados.

## Ubicación de la carpeta migrations

### En desarrollo (local)
```
/workspaces/task-manager/api/migrations/
```

### En producción (VPS con Docker)

La carpeta `migrations/` está **dentro del contenedor** en:
```
/app/migrations/
```

Esta carpeta se copia durante la construcción de la imagen Docker (ver línea 58 del Dockerfile):
```dockerfile
COPY api/migrations ./migrations
```

**IMPORTANTE**: Si haces cambios a los scripts de migración después de construir la imagen, necesitas reconstruir y hacer push de la nueva imagen:
```bash
# En tu máquina local
./docker-build.sh    # Construye la imagen
./docker-push.sh     # Sube a Docker Hub

# En el VPS
./docker-update.sh   # Descarga y reinicia con la nueva imagen
```

## Control de migraciones ejecutadas

El sistema mantiene un registro de qué migraciones ya fueron ejecutadas en:

**Desarrollo:**
```
/workspaces/task-manager/api/migrations.log
```

**Producción (VPS):**
```
/app/data/migrations.log
```

Este archivo persiste gracias al volumen montado `./data:/app/data` en el docker-compose.prod.yml.

## ¿Cómo agregar una nueva migración?

1. **Crea tu script** en `api/migrations/`:
   ```
   api/migrations/nueva_migracion.js
   ```

2. **Formato del nombre**: Usa un formato ordenable (fecha o número):
   ```
   add_nueva_columna_2026_01_05.js
   migrate_v3.0.0.js
   001_add_feature_x.js
   ```

3. **Estructura del script**: Debe ser un script Node.js que se ejecute independientemente:
   ```javascript
   const sqlite3 = require('sqlite3').verbose();
   const path = require('path');
   
   const dbPath = process.env.NODE_ENV === 'production'
     ? '/app/data/database.sqlite'
     : path.join(__dirname, '..', 'database.sqlite');
   
   const db = new sqlite3.Database(dbPath);
   
   console.log('🔄 Iniciando migración...');
   
   db.serialize(() => {
     db.run('BEGIN TRANSACTION;');
     
     try {
       // Tu lógica de migración aquí
       db.run(`ALTER TABLE...`);
       
       db.run('COMMIT;');
       console.log('✅ Migración completada');
     } catch (error) {
       db.run('ROLLBACK;');
       console.error('❌ Error:', error);
       throw error;
     }
   });
   
   db.close();
   ```

4. **Haz commit y push** de tu nueva migración al repositorio.

5. **Construye y despliega** la nueva imagen Docker:
   ```bash
   ./docker-build.sh
   ./docker-push.sh
   # En el VPS: ./docker-update.sh
   ```

6. **El contenedor ejecutará automáticamente** tu nueva migración al iniciarse.

## Verificar migraciones ejecutadas

### Ver el log en producción:
```bash
# En el VPS
docker exec task-manager cat /app/data/migrations.log
```

### Ver logs del contenedor:
```bash
docker logs task-manager
```

Busca las líneas que digan:
```
🔄 Ejecutando migraciones...
📋 Migraciones pendientes: 1
🔧 Ejecutando: nueva_migracion.js
✅ nueva_migracion.js completada exitosamente
✅ Todas las migraciones ejecutadas exitosamente
```

## Ubicación de archivos en el VPS

Cuando uses docker-compose.prod.yml, el mapeo de volúmenes es:

| Archivo | En el VPS | En el contenedor |
|---------|-----------|------------------|
| Base de datos | `./data/database.sqlite` | `/app/data/database.sqlite` |
| Log migraciones | `./data/migrations.log` | `/app/data/migrations.log` |
| Scripts migraciones | (dentro de la imagen) | `/app/migrations/*.js` |

Por lo tanto, en tu VPS encontrarás:
```
/ruta/donde/ejecutas/docker-compose/
├── docker-compose.prod.yml
└── data/
    ├── database.sqlite       # Base de datos persistente
    └── migrations.log        # Control de migraciones ejecutadas
```

## Migración manual (sin reiniciar)

Si necesitas ejecutar una migración sin reiniciar el contenedor:

```bash
# Copiar el script al contenedor
docker cp nueva_migracion.js task-manager:/tmp/

# Ejecutarlo
docker exec task-manager node /tmp/nueva_migracion.js
```

## Desactivar migraciones automáticas (no recomendado)

Si por alguna razón necesitas desactivar las migraciones automáticas, puedes cambiar NODE_ENV:

```yaml
environment:
  - NODE_ENV=development  # Las migraciones NO se ejecutarán
```

Pero esto **no es recomendado** en producción ya que podrías perder actualizaciones críticas de la base de datos.
