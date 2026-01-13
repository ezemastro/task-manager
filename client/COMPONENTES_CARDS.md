# Componentes de Cards - Proyectos y Etapas

## 📋 Componentes Creados

### 1. **ProjectCard** - Card de Proyecto
Componente principal que muestra toda la información de un proyecto con sus etapas.

**Ubicación:** `/src/components/ProjectCard.tsx`

**Características:**
- ✅ Información completa del proyecto
- ✅ Barra de progreso visual
- ✅ Contador de etapas completadas
- ✅ Indicador de etapa actual
- ✅ Lista de todas las etapas ordenadas
- ✅ Botón para iniciar nueva etapa
- ✅ Validación automática (solo permite crear etapa si la anterior está completa)

**Props:**
```typescript
interface ProjectCardProps {
  projectId: number;              // ID del proyecto
  projectName: string;             // Nombre del proyecto
  projectDescription?: string;     // Descripción (opcional)
  stages: Stage[];                 // Array de etapas
  onStageCompleted?: () => void;   // Callback cuando se completa una etapa
  onStageCreated?: () => void;     // Callback cuando se crea una etapa
}
```

**Uso:**
```tsx
<ProjectCard
  projectId={1}
  projectName="Construcción Edificio Central"
  projectDescription="Proyecto de 10 pisos"
  stages={stages}
  onStageCompleted={() => console.log('Etapa completada')}
  onStageCreated={() => console.log('Etapa creada')}
/>
```

---

### 2. **StageCard** - Card de Etapa
Componente individual para mostrar cada etapa del proyecto.

**Ubicación:** `/src/components/StageCard.tsx`

**Características:**
- ✅ Indicador visual de estado (completada/en curso/pendiente)
- ✅ Borde destacado para etapa actual
- ✅ Información del responsable
- ✅ Fechas de inicio, fin estimado y completada
- ✅ Etiquetas (tags) si las tiene
- ✅ Contador de comentarios
- ✅ Botón de completar (solo para etapa actual)
- ✅ Loading state al completar
- ✅ Manejo de errores

**Props:**
```typescript
interface StageCardProps {
  stage: Stage;              // Datos completos de la etapa
  isCurrentStage?: boolean;  // Si es la etapa en curso
  onCompleted?: () => void;  // Callback al completarse
}
```

**Uso:**
```tsx
<StageCard
  stage={stageData}
  isCurrentStage={true}
  onCompleted={() => fetchStages()}
/>
```

**Estados visuales:**
- **Completada:** Chip verde "Completada", fondo gris, opacidad reducida
- **En curso:** Chip azul "En Curso", borde izquierdo destacado azul
- **Pendiente:** Chip gris "Pendiente", aspecto normal

---

### 3. **CreateStageModal** - Modal para Nueva Etapa
Modal para crear una nueva etapa en un proyecto.

**Ubicación:** `/src/components/CreateStageModal.tsx`

**Características:**
- ✅ Formulario completo de etapa
- ✅ Validaciones en tiempo real
- ✅ Campos de fecha con restricciones
- ✅ Loading state
- ✅ Manejo de errores
- ✅ Cierre automático al crear

**Props:**
```typescript
interface CreateStageModalProps {
  open: boolean;                       // Estado del modal
  onClose: () => void;                 // Callback para cerrar
  projectId: number;                   // ID del proyecto
  onSuccess?: (stageId: number) => void; // Callback de éxito
}
```

**Campos del formulario:**
- **Nombre:** Requerido, mínimo 3 caracteres
- **Responsable:** Requerido
- **Fecha de inicio:** Opcional, no puede ser anterior a hoy
- **Fecha estimada de fin:** Opcional, debe ser posterior a fecha de inicio

**Uso:**
```tsx
<CreateStageModal
  open={showModal}
  onClose={() => setShowModal(false)}
  projectId={1}
  onSuccess={(id) => {
    console.log('Etapa creada:', id);
    fetchStages();
  }}
/>
```

---

### 4. **ProjectsList** - Lista de Proyectos
Componente contenedor que carga y muestra todos los proyectos con sus etapas.

**Ubicación:** `/src/components/ProjectsList.tsx`

**Características:**
- ✅ Carga automática de proyectos al montar
- ✅ Loading state con spinner
- ✅ Manejo de errores con opción de reintentar
- ✅ Botón de actualizar manual
- ✅ Botón para crear nuevo proyecto (modal)
- ✅ Mensaje cuando no hay proyectos
- ✅ Renderiza ProjectCard para cada proyecto

**Uso:**
```tsx
<ProjectsList />
```

---

## 🎨 Flujo de Trabajo

### Crear y completar etapas:

1. **Usuario ve la lista de proyectos**
   - Se cargan todos los proyectos con sus etapas
   - Cada proyecto muestra su progreso

2. **Crear nueva etapa**
   - Click en "Iniciar Nueva Etapa" o "Iniciar Primera Etapa"
   - Se abre modal `CreateStageModal`
   - Usuario completa el formulario
   - Al guardar, se actualiza automáticamente la lista

3. **Completar etapa**
   - Solo se puede completar la etapa actual (en curso)
   - Click en "✓ Marcar como Completada"
   - Loading state mientras se procesa
   - Al completar, se actualiza el proyecto
   - Se habilita el botón para crear la siguiente etapa

4. **Restricciones**
   - No se puede crear una nueva etapa si la actual no está completada
   - Las etapas están numeradas en orden
   - Solo una etapa puede estar "en curso" por proyecto

---

## 🎯 Características Especiales

### Barra de Progreso
```tsx
// Se calcula automáticamente
const progress = (completedStages / totalStages) * 100;
```

### Validación de Etapas
```tsx
// Solo permite crear si todas las etapas anteriores están completas
const canCreateNewStage = totalStages === 0 || 
                          stages.every(stage => stage.is_completed);
```

### Formateo de Fechas
```tsx
// Formato español DD/MM/YYYY
formatDate('2025-10-10') // → "10/10/2025"
```

### Indicador de Etapa Actual
```tsx
const currentStage = stages.find(stage => !stage.is_completed);
```

---

## 💡 Ejemplo Completo de Integración

```tsx
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import ProjectsList from './components/ProjectsList';

const theme = createTheme({
  palette: {
    primary: { main: '#1976d2' },
    secondary: { main: '#dc004e' },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ProjectsList />
    </ThemeProvider>
  );
}
```

---

## 🔄 Callbacks y Actualización

Todos los componentes implementan callbacks para mantener sincronizada la UI:

```tsx
// En ProjectsList
const handleRefresh = () => {
  fetchProjects(); // Recarga todos los proyectos
};

// En ProjectCard
<ProjectCard
  onStageCompleted={handleRefresh}
  onStageCreated={handleRefresh}
/>

// En StageCard
<StageCard
  onCompleted={handleRefresh}
/>

// En CreateStageModal
<CreateStageModal
  onSuccess={() => {
    handleRefresh();
    closeModal();
  }}
/>
```

---

## 📊 Estados del Sistema

### Loading
- Spinner centrado con mensaje
- Deshabilita botones
- Muestra "Cargando..." o "Completando..."

### Error
- Alert rojo con mensaje
- Botón de "Reintentar"
- No bloquea otras acciones

### Éxito
- Actualización automática de la lista
- Cierre de modales
- Callbacks ejecutados

### Vacío
- Mensaje informativo
- Botón para crear primer proyecto/etapa

---

## 🎨 Personalización Visual

### Colores de Estado
```tsx
// Etapa completada
<Chip label="Completada" color="success" />

// Etapa en curso
<Chip label="En Curso" color="primary" />

// Etapa pendiente
<Chip label="Pendiente" color="default" />
```

### Borde de Etapa Actual
```tsx
sx={{ 
  borderLeft: isCurrentStage ? 4 : 1,
  borderLeftColor: isCurrentStage ? 'primary.main' : 'divider',
}}
```

---

## 📱 Responsive

Todos los componentes son responsive:
- **Desktop:** Diseño óptimo con todos los detalles
- **Tablet:** Stack de fechas cambia a columna
- **Mobile:** Botones en columna, texto adaptado

---

## 🚀 Para Probar

1. Iniciar API:
```bash
cd /workspaces/task-manager/api
npm run dev
```

2. Iniciar cliente:
```bash
cd /workspaces/task-manager/client
npm run dev
```

3. Flujo de prueba:
   - Ir a "Ver Mis Proyectos"
   - Crear nuevo proyecto
   - Iniciar primera etapa
   - Completar etapa
   - Crear siguiente etapa
   - Ver progreso actualizado
