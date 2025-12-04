# Migración: Eliminar user_name de audit_logs

## ¿Qué hace esta migración?

Elimina la columna `user_name` de la tabla `audit_logs` ya que ahora obtenemos el nombre del usuario mediante un JOIN con la tabla `users`. Esto hace el sistema más eficiente y evita redundancia de datos.

## Para ejecutar en DESARROLLO (ya ejecutado):

```bash
cd /workspaces/task-manager/api
node migrations/remove_user_name_from_audit_logs.js
```

## Para ejecutar en PRODUCCIÓN:

### Opción 1: Ejecutar la migración manualmente

```bash
# 1. Conectarse al servidor
ssh usuario@186.109.19.148

# 2. Ir al directorio del proyecto
cd ~/task-manager

# 3. Copiar el archivo de migración al servidor (si no está)
# Desde tu máquina local:
scp api/migrations/remove_user_name_from_audit_logs.js usuario@186.109.19.148:~/task-manager/

# 4. Ejecutar la migración dentro del contenedor
docker-compose -f docker-compose.prod.yml exec api node /app/migrations/remove_user_name_from_audit_logs.js
```

### Opción 2: Reconstruir y desplegar (recomendado)

```bash
# 1. En tu máquina de desarrollo, asegúrate de tener todos los cambios
cd /workspaces/task-manager
git add .
git commit -m "feat: optimizar sistema de auditoría - eliminar user_name redundante"
git push origin main

# 2. En el servidor de producción
ssh usuario@186.109.19.148
cd ~/task-manager

# 3. Obtener los últimos cambios
git pull origin main

# 4. Detener la aplicación
docker-compose -f docker-compose.prod.yml down

# 5. Reconstruir las imágenes
docker-compose -f docker-compose.prod.yml build

# 6. Ejecutar la migración ANTES de iniciar la aplicación
docker-compose -f docker-compose.prod.yml run --rm api node /app/migrations/remove_user_name_from_audit_logs.js

# 7. Iniciar la aplicación
docker-compose -f docker-compose.prod.yml up -d

# 8. Verificar que todo funciona
docker-compose -f docker-compose.prod.yml logs -f
```

## Verificación

Para verificar que la migración se ejecutó correctamente:

```bash
# Dentro del contenedor o localmente
sqlite3 database.sqlite

# Verificar estructura de la tabla
.schema audit_logs

# Deberías ver que NO existe la columna user_name
# Deberías ver estos campos: id, organization_id, user_id, action, entity_type, entity_id, details, ip_address, created_at

# Salir
.quit
```

## Rollback (si algo sale mal)

Si necesitas revertir los cambios:

```bash
# Restaurar desde backup (asegúrate de tener un backup antes de migrar)
# O recrear la tabla con la columna user_name y poblarla desde users:

sqlite3 database.sqlite

ALTER TABLE audit_logs ADD COLUMN user_name TEXT;

UPDATE audit_logs 
SET user_name = (SELECT name FROM users WHERE users.id = audit_logs.user_id);

.quit
```

## Notas importantes

- ✅ Esta migración es segura: no se pierden datos
- ✅ Preserva todos los registros de auditoría existentes
- ✅ Mantiene todos los índices
- ✅ Es compatible con el código actual
- ⚠️  **Recomendación**: Hacer un backup de la base de datos antes de ejecutar en producción

```bash
# Backup antes de migrar
cp database.sqlite database.sqlite.backup-$(date +%Y%m%d-%H%M%S)
```
