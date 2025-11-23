# Guía de Migraciones - Task Manager

## Migración v1.2.0 → v2.0.0

Esta migración actualiza el sistema desde una versión sin multi-tenancy a una versión completa con organizaciones, autenticación JWT y sistema mejorado de comentarios.

### 🎯 Cambios Principales

#### 1. Sistema Multi-Tenant
- Soporte para múltiples organizaciones en una misma base de datos
- Aislamiento completo de datos por organización
- Todos los datos existentes se migran a una organización llamada "Empresa Principal"

#### 2. Autenticación y Autorización
- Sistema de login con selección de organización y usuario
- Autenticación JWT con cookies httpOnly
- Sistema de scopes para control de permisos
- Gestión de contraseñas con bcrypt

#### 3. Mejoras en Comentarios
- Los comentarios ahora están vinculados a usuarios
- Se muestra el nombre del autor automáticamente
- Migración automática de comentarios existentes

#### 4. Responsable por Defecto en Plantillas
- Las plantillas de etapas pueden tener un responsable predefinido
- Facilita la creación automática de proyectos

---

## 📋 Pre-requisitos

Antes de ejecutar la migración:

1. **Hacer backup de la base de datos**
   ```bash
   cp api/database.sqlite api/database.sqlite.backup
   ```

2. **Detener el servidor si está corriendo**
   ```bash
   # Ctrl+C en la terminal del servidor
   ```

3. **Verificar que tienes Node.js instalado**
   ```bash
   node --version
   ```

---

## 🚀 Ejecutar la Migración

### Opción 1: Ejecutar el script consolidado (Recomendado)

```bash
cd api
node migrations/migrate_v1.2.0_to_v2.0.0.js
```

Este script ejecuta automáticamente todas las migraciones en el orden correcto:
1. `add_organizations_and_auth.js`
2. `add_default_responsible_to_stage_templates.js`
3. `add_user_id_to_comments.js`

### Opción 2: Ejecutar las migraciones manualmente

Si prefieres ejecutar cada migración por separado:

```bash
cd api

# 1. Sistema de organizaciones y autenticación
node migrations/add_organizations_and_auth.js

# 2. Responsable por defecto en plantillas
node migrations/add_default_responsible_to_stage_templates.js

# 3. Sistema de comentarios con usuarios
node migrations/add_user_id_to_comments.js
```

---

## ✅ Verificar la Migración

Después de ejecutar la migración:

1. **Iniciar el servidor**
   ```bash
   cd api
   npm start
   ```

2. **Acceder al sistema**
   - Ir a http://localhost:5173 (cliente)
   - Verás la nueva pantalla de login con selección de organización
   - La organización "Empresa Principal" estará disponible
   - Todos los usuarios existentes aparecerán en la lista

3. **Primer login**
   - Los usuarios migrados NO tienen contraseña
   - Puedes entrar dejando el campo de contraseña vacío
   - Se recomienda establecer una contraseña desde el menú de usuario

---

## 🔧 Solución de Problemas

### La migración falla con "SQLITE_ERROR"

**Causa**: Probablemente la base de datos está siendo usada por otro proceso.

**Solución**:
1. Detener el servidor de la API
2. Cerrar cualquier herramienta que esté accediendo a la base de datos
3. Volver a ejecutar la migración

### "No se encontró la base de datos"

**Causa**: El script no encuentra el archivo `database.sqlite`.

**Solución**:
1. Verificar que estás ejecutando el script desde la carpeta `api`
2. Verificar que existe el archivo `api/database.sqlite`

### Quiero revertir la migración

**Solución**:
1. Detener el servidor
2. Restaurar el backup:
   ```bash
   cp api/database.sqlite.backup api/database.sqlite
   ```

---

## 📝 Estructura de la Base de Datos Después de la Migración

### Nuevas Tablas

#### `organizations`
```sql
CREATE TABLE organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Tablas Modificadas

#### `users`
- ✨ Nuevo: `organization_id` (FK a organizations)
- ✨ Nuevo: `password_hash` (contraseñas encriptadas)
- ✨ Nuevo: `scopes` (permisos en formato JSON)
- 🔒 UNIQUE: `(organization_id, email)`

#### `projects`, `clients`, `stage_templates`
- ✨ Nuevo: `organization_id` (FK a organizations)

#### `stage_templates`
- ✨ Nuevo: `default_responsible_id` (FK a users)

#### `comments`
- ✨ Nuevo: `user_id` (FK a users)
- ❌ Eliminado: `author` (campo de texto)

---

## 🎯 Próximos Pasos

Después de la migración exitosa:

1. **Configurar contraseñas**
   - Cada usuario debe acceder y configurar su contraseña desde el menú de usuario
   - Usar la opción "Cambiar contraseña"

2. **Crear nuevas organizaciones** (opcional)
   - Desde la pantalla de login, usar "Crear Nueva Organización"
   - Se creará automáticamente un usuario administrador

3. **Configurar responsables en plantillas** (opcional)
   - Ir a "Gestión de Etapas Predefinidas"
   - Asignar un responsable por defecto a cada plantilla

---

## 📞 Soporte

Si encuentras algún problema durante la migración:

1. Revisa los logs en la consola
2. Verifica que hiciste backup de la base de datos
3. Consulta la sección de solución de problemas

---

## 📜 Historial de Versiones

### v2.0.0 (Actual)
- Sistema multi-tenant con organizaciones
- Autenticación JWT
- Comentarios vinculados a usuarios
- Responsables por defecto en plantillas

### v1.2.0 (Anterior)
- Sistema de gestión de obras básico
- Sin autenticación
- Base de datos única sin organizaciones
