# Sistema de Gestión de Proyectos

Sistema full-stack para la gestión de proyectos con etapas secuenciales, usuarios, tags y comentarios. Con soporte para multi-tenancy, autenticación JWT y despliegue en Docker.

## 🐳 Despliegue con Docker

### Opción 1: Construir localmente (si tienes Docker)

```bash
# Editar archivos con tu usuario de Docker Hub
sed -i "s/tu-usuario/TU-USUARIO/g" docker-push.sh docker-update.sh docker-compose.prod.yml Makefile

# Construir y publicar
make build
make push
```

### Opción 2: Build automático con GitHub Actions

1. Configura secrets en GitHub:
   - `DOCKER_USERNAME`: tu usuario de Docker Hub
   - `DOCKER_PASSWORD`: token de Docker Hub
2. Push a GitHub → construye automáticamente
3. Descarga en tu servidor: `docker pull tu-usuario/task-manager:latest`

### En tu Servidor VPS

```bash
docker pull tu-usuario/task-manager:latest
docker run -d -p 3000:3000 -v task-manager-data:/app/data tu-usuario/task-manager:latest
```

📖 **Ver [DEPLOYMENT.md](./DEPLOYMENT.md) para guía completa**

## 🚀 Stack Tecnológico

### Frontend
- **React 19.1.1** - Framework UI
- **TypeScript 5.9.3** - Type safety
- **Vite** - Build tool y dev server
- **MUI Material v7.3.4** - Componentes UI
- **ESLint** - Linting

### Backend
- **Express.js 5.1.0** - REST API
- **SQLite3 5.1.7** - Base de datos
- **TypeScript 5.9.3** - Type safety
- **CORS** - Middleware

## 📁 Estructura del Proyecto

```
/workspaces/task-manager/
├── api/                          # Backend API
│   ├── src/
│   │   └── app.ts               # Servidor Express + endpoints
│   ├── database.sqlite          # Base de datos SQLite
│   ├── package.json
│   └── tsconfig.json
│
└── client/                       # Frontend React
    ├── src/
    │   ├── components/          # Componentes React
    │   │   ├── ProjectsList.tsx
    │   │   ├── ProjectCard.tsx
    │   │   ├── StageCard.tsx
    │   │   ├── CreateProjectModal.tsx
    │   │   ├── CreateStageModal.tsx
    │   │   └── UsersManagement.tsx
    │   ├── services/
    │   │   └── apiClient.ts     # Cliente tipado para API
    │   ├── App.tsx
    │   └── main.tsx
    ├── package.json
    └── vite.config.ts
```

## 🗄️ Modelo de Datos

### Tablas

1. **users** - Usuarios del sistema
   - `id` INTEGER PRIMARY KEY AUTOINCREMENT
   - `name` TEXT NOT NULL
   - `email` TEXT UNIQUE NOT NULL
   - `role` TEXT (opcional)
   - `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP

2. **projects** - Proyectos
   - `id` INTEGER PRIMARY KEY AUTOINCREMENT
   - `name` TEXT NOT NULL
   - `description` TEXT
   - `status` TEXT DEFAULT 'active'
   - `start_date` DATETIME DEFAULT CURRENT_TIMESTAMP
   - `end_date` DATETIME

3. **stages** - Etapas de proyecto
   - `id` INTEGER PRIMARY KEY AUTOINCREMENT
   - `project_id` INTEGER FK → projects (CASCADE)
   - `name` TEXT NOT NULL
   - `description` TEXT
   - `order_number` INTEGER NOT NULL
   - `responsible_id` INTEGER FK → users (RESTRICT)
   - `status` TEXT DEFAULT 'pending' ('pending', 'in_progress', 'completed')
   - `start_date` DATETIME
   - `completed_date` DATETIME
   - **UNIQUE**: (project_id, order_number)

4. **tags** - Etiquetas reutilizables
   - `id` INTEGER PRIMARY KEY AUTOINCREMENT
   - `name` TEXT UNIQUE NOT NULL
   - `color` TEXT

5. **stage_tags** - Relación many-to-many
   - `stage_id` INTEGER FK → stages (CASCADE)
   - `tag_id` INTEGER FK → tags (CASCADE)
   - **PRIMARY KEY**: (stage_id, tag_id)

6. **comments** - Comentarios en etapas
   - `id` INTEGER PRIMARY KEY AUTOINCREMENT
   - `stage_id` INTEGER FK → stages (CASCADE)
   - `content` TEXT NOT NULL
   - `author` TEXT
   - `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP

### Restricciones de Integridad

- **Foreign Keys**: Activadas con `PRAGMA foreign_keys = ON`
- **ON DELETE CASCADE**: Eliminar proyecto elimina stages, comments, stage_tags
- **ON DELETE RESTRICT**: No permite eliminar usuarios asignados a etapas
- **Secuencialidad**: Solo se puede crear la siguiente etapa si la anterior está completada

## 🔌 API Endpoints

### 👥 Usuarios (`/api/users`)

| Método | Endpoint | Descripción | Query Params |
|--------|----------|-------------|--------------|
| GET | `/api/users` | Listar usuarios | `?name=...&role=...` |
| GET | `/api/users/:id` | Obtener usuario | - |
| POST | `/api/users` | Crear usuario | - |
| PUT | `/api/users/:id` | Actualizar usuario | - |
| DELETE | `/api/users/:id` | Eliminar usuario* | - |

*No permite eliminar si está asignado a etapas

#### Ejemplo POST `/api/users`:
```json
{
  "name": "Juan Pérez",
  "email": "juan@example.com",
  "role": "Ingeniero Civil"
}
```

### 📂 Proyectos (`/api/projects`)

| Método | Endpoint | Descripción | Query Params |
|--------|----------|-------------|--------------|
| GET | `/api/projects` | Listar proyectos | `?status=...&name=...` |
| GET | `/api/projects/:id` | Obtener proyecto | - |
| GET | `/api/projects/:id/stages` | Etapas de proyecto | - |
| POST | `/api/projects` | Crear proyecto | - |
| PUT | `/api/projects/:id` | Actualizar proyecto | - |
| DELETE | `/api/projects/:id` | Eliminar proyecto | - |

#### Ejemplo POST `/api/projects`:
```json
{
  "name": "Edificio Residencial Norte",
  "description": "Construcción de torre de 15 pisos",
  "status": "active"
}
```

### 📋 Etapas (`/api/stages`)

| Método | Endpoint | Descripción | Query Params |
|--------|----------|-------------|--------------|
| GET | `/api/stages` | Listar etapas | `?project_id=...&status=...&responsible_id=...` |
| GET | `/api/stages/:id` | Obtener etapa | - |
| POST | `/api/stages` | Crear etapa* | - |
| PUT | `/api/stages/:id` | Actualizar etapa | - |
| DELETE | `/api/stages/:id` | Eliminar etapa | - |
| POST | `/api/stages/:id/complete` | Marcar completada | - |

*Valida que la etapa anterior esté completada (excepto order_number=1)

#### Ejemplo POST `/api/stages`:
```json
{
  "project_id": 1,
  "name": "Excavación y Cimientos",
  "description": "Excavación del terreno y fundaciones",
  "order_number": 1,
  "responsible_id": 2
}
```

#### Respuesta GET `/api/stages/:id`:
```json
{
  "id": 1,
  "project_id": 1,
  "name": "Excavación y Cimientos",
  "description": "...",
  "order_number": 1,
  "responsible_id": 2,
  "responsible_name": "María García",
  "responsible_email": "maria@example.com",
  "responsible_role": "Ingeniera de Suelos",
  "status": "completed",
  "start_date": "2024-01-15T10:00:00.000Z",
  "completed_date": "2024-02-10T16:30:00.000Z"
}
```

### 🏷️ Tags (`/api/tags`)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/tags` | Listar tags |
| GET | `/api/tags/:id` | Obtener tag |
| POST | `/api/tags` | Crear tag |
| PUT | `/api/tags/:id` | Actualizar tag |
| DELETE | `/api/tags/:id` | Eliminar tag |

#### Ejemplo POST `/api/tags`:
```json
{
  "name": "Crítico",
  "color": "#FF0000"
}
```

### 💬 Comentarios (`/api/comments`)

| Método | Endpoint | Descripción | Query Params |
|--------|----------|-------------|--------------|
| GET | `/api/comments` | Listar comentarios | `?stage_id=...&author=...` |
| GET | `/api/comments/:id` | Obtener comentario | - |
| POST | `/api/comments` | Crear comentario | - |
| PUT | `/api/comments/:id` | Actualizar comentario | - |
| DELETE | `/api/comments/:id` | Eliminar comentario | - |

## 🧩 Componentes Frontend

### `UsersManagement`
Gestión completa de usuarios (CRUD).

**Características:**
- Tabla con listado de usuarios
- Modal para crear nuevos usuarios
- Validación de email
- Chips para roles

### `ProjectsList`
Contenedor principal que lista todos los proyectos.

**Características:**
- Carga todos los proyectos con sus etapas
- Botón para crear nuevo proyecto
- Callbacks de actualización

### `ProjectCard`
Card individual que muestra un proyecto completo.

**Características:**
- Barra de progreso (% etapas completadas)
- Lista de todas las etapas (StageCard)
- Botón para crear nueva etapa (solo si todas completadas)
- Resalta etapa actual

### `StageCard`
Card individual de una etapa.

**Características:**
- Chip con estado (Pendiente/En Curso/Completada)
- Muestra responsable (nombre + rol)
- Botón "Marcar como Completada" solo para etapa actual
- Borde azul para etapa en curso

### `CreateProjectModal`
Modal para crear nuevos proyectos.

**Campos:**
- Nombre (requerido)
- Descripción (opcional)

### `CreateStageModal`
Modal para crear nuevas etapas.

**Características:**
- Carga lista de usuarios desde API
- Select dropdown para asignar responsable
- Valida que se seleccione un usuario
- Calcula automáticamente el `order_number`

## 🐳 Despliegue con Docker (Recomendado)

### Inicio Rápido

```bash
# Construir imagen
make build

# Publicar a Docker Hub
make push

# O ambos en un comando
make deploy
```

Ver documentación completa:
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Guía completa de despliegue en VPS
- **[DOCKER.md](./DOCKER.md)** - Referencia rápida de Docker

### Usando Docker Compose

```bash
# Desarrollo
docker-compose up -d

# Producción (en el servidor)
docker-compose -f docker-compose.prod.yml up -d
```

## 🔧 Instalación y Uso (Desarrollo Local)

### 1. Instalar dependencias

```bash
# Backend
cd /workspaces/task-manager/api
npm install

# Frontend
cd /workspaces/task-manager/client
npm install
```

### 2. Iniciar el backend

```bash
cd /workspaces/task-manager/api
npm run dev
```

El servidor arranca en `http://localhost:3000`

**Usuarios por defecto:**
1. Juan Pérez - Ingeniero Civil
2. María García - Ingeniera de Suelos
3. Carlos Rodríguez - Arquitecto
4. Ana Martínez - Jefa de Proyecto
5. Luis Fernández - Supervisor de Seguridad

### 3. Iniciar el frontend

```bash
cd /workspaces/task-manager/client
npm run dev
```

El cliente arranca en `http://localhost:5173`

## 🎯 Flujo de Trabajo

1. **Crear Proyecto**: Click en "Nuevo Proyecto" → Llenar formulario
2. **Crear Primera Etapa**: Click en "Iniciar Nueva Etapa" → Seleccionar responsable
3. **Completar Etapa**: Click en "Marcar como Completada" (solo en etapa actual)
4. **Crear Siguiente Etapa**: Solo disponible cuando la anterior está completada
5. **Gestionar Usuarios**: Ir a UsersManagement para agregar nuevos usuarios

## 🔐 Validaciones

### Backend
- ✅ Etapas deben completarse secuencialmente
- ✅ No se puede eliminar un usuario asignado a etapas
- ✅ Email único por usuario
- ✅ Order_number único por proyecto

### Frontend
- ✅ Nombre de proyecto requerido
- ✅ Nombre de etapa requerido
- ✅ Responsable obligatorio
- ✅ Email válido en usuarios

## 📄 Documentación Adicional

- [`client/README_API_CLIENT.md`](./client/README_API_CLIENT.md) - Documentación detallada del cliente API
- [`client/FORMULARIO_PROYECTOS.md`](./client/FORMULARIO_PROYECTOS.md) - Especificación del formulario de proyectos
- [`client/COMPONENTES_CARDS.md`](./client/COMPONENTES_CARDS.md) - Especificación de las cards

## 🐛 Troubleshooting

### Error: "Foreign key constraint failed"
- Verifica que el `responsible_id` existe en la tabla `users`
- Verifica que el `project_id` existe en la tabla `projects`

### Error: "Previous stage must be completed"
- Solo puedes crear la etapa N+1 si la etapa N está completada
- La primera etapa (order_number=1) siempre se puede crear

### Error: "Cannot delete user"
- El usuario está asignado a una o más etapas activas
- Primero reasigna las etapas a otro usuario

## 🚀 Próximas Mejoras

- [ ] Autenticación y autorización
- [ ] Dashboard con estadísticas
- [ ] Filtros avanzados en ProjectsList
- [ ] Edición inline de etapas
- [ ] Historial de cambios (audit log)
- [ ] Notificaciones por email
- [ ] Carga de archivos adjuntos
- [ ] Gráficos de Gantt para timeline
