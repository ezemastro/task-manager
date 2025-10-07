# API Client - Ejemplos de Uso

Cliente tipado en TypeScript para consumir la API de gestión de proyectos.

## Importación

```typescript
import { apiClient } from './services/apiClient';
// O importar tipos específicos
import type { Project, Stage, Tag, Comment } from './services/apiClient';
```

## Ejemplos de Uso

### **Proyectos (Projects)**

#### Crear un proyecto
```typescript
const newProject = await apiClient.createProject({
  name: 'Construcción Edificio Central',
  description: 'Proyecto de construcción de 10 pisos'
});
console.log(newProject.id); // ID del proyecto creado
```

#### Listar proyectos con filtros
```typescript
// Todos los proyectos
const allProjects = await apiClient.getProjects();

// Filtrar por nombre
const filteredProjects = await apiClient.getProjects({
  name: 'Edificio'
});

// Proyectos con etapas completadas
const projectsWithCompleted = await apiClient.getProjects({
  has_completed_stages: true
});

// Proyectos con etapas pendientes
const projectsWithPending = await apiClient.getProjects({
  has_pending_stages: true
});
```

#### Obtener un proyecto específico con sus etapas
```typescript
const project = await apiClient.getProject(1);
console.log(project.name);
console.log(project.stages); // Array de etapas
```

#### Actualizar un proyecto
```typescript
await apiClient.updateProject(1, {
  name: 'Construcción Edificio Central - Actualizado',
  description: 'Nueva descripción'
});
```

#### Eliminar un proyecto
```typescript
await apiClient.deleteProject(1);
```

---

### **Etapas (Stages)**

#### Crear una etapa
```typescript
const newStage = await apiClient.createStage({
  project_id: 1,
  name: 'Excavación y Cimientos',
  responsible: 'Juan Pérez',
  start_date: '2025-10-10',
  estimated_end_date: '2025-11-30'
});
```

#### Listar etapas con filtros avanzados
```typescript
// Todas las etapas
const allStages = await apiClient.getStages();

// Por proyecto específico
const projectStages = await apiClient.getStages({
  project_id: 1
});

// Por responsable
const myStages = await apiClient.getStages({
  responsible: 'Juan Pérez'
});

// Solo completadas
const completedStages = await apiClient.getStages({
  is_completed: true
});

// Solo pendientes
const pendingStages = await apiClient.getStages({
  is_completed: false
});

// Por etiqueta
const taggedStages = await apiClient.getStages({
  tag: 'Urgente'
});

// Por rango de fechas
const stagesByDate = await apiClient.getStages({
  start_date_from: '2025-10-01',
  start_date_to: '2025-10-31'
});

// Combinación de filtros
const filteredStages = await apiClient.getStages({
  project_id: 1,
  responsible: 'Juan',
  is_completed: false,
  tag: 'Urgente'
});
```

#### Obtener una etapa con detalles completos
```typescript
const stageDetail = await apiClient.getStage(1);
console.log(stageDetail.tags); // Array de Tag[]
console.log(stageDetail.comments); // Array de Comment[]
```

#### Actualizar una etapa
```typescript
await apiClient.updateStage(1, {
  name: 'Excavación y Cimientos - Fase 2',
  responsible: 'María García',
  estimated_end_date: '2025-12-15'
});
```

#### Completar una etapa
```typescript
await apiClient.completeStage(1);
```

#### Eliminar una etapa
```typescript
await apiClient.deleteStage(1);
```

#### Añadir etiqueta a una etapa
```typescript
await apiClient.addTagToStage(1, { tag_id: 3 });
```

#### Remover etiqueta de una etapa
```typescript
await apiClient.removeTagFromStage(1, 3);
```

---

### **Etiquetas (Tags)**

#### Crear una etiqueta
```typescript
const newTag = await apiClient.createTag({
  name: 'Urgente',
  color: '#FF0000'
});
```

#### Listar todas las etiquetas
```typescript
const tags = await apiClient.getTags();
console.log(tags); // Incluye usage_count
```

#### Obtener una etiqueta específica
```typescript
const tag = await apiClient.getTag(1);
```

#### Actualizar una etiqueta
```typescript
await apiClient.updateTag(1, {
  name: 'Muy Urgente',
  color: '#FF6600'
});
```

#### Eliminar una etiqueta
```typescript
await apiClient.deleteTag(1);
```

---

### **Comentarios (Comments)**

#### Añadir comentario a una etapa
```typescript
const newComment = await apiClient.createComment({
  stage_id: 1,
  content: 'La excavación va según lo planeado',
  author: 'Juan Pérez'
});
```

#### Obtener comentarios de una etapa
```typescript
const stageComments = await apiClient.getStageComments(1);
```

#### Obtener todos los comentarios
```typescript
const allComments = await apiClient.getComments();
// Incluye stage_name y project_name
```

#### Eliminar un comentario
```typescript
await apiClient.deleteComment(1);
```

---

## Uso en Componentes React

### Ejemplo con hooks
```typescript
import { useEffect, useState } from 'react';
import { apiClient, type Stage } from './services/apiClient';

function StagesList() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStages() {
      try {
        const data = await apiClient.getStages({
          is_completed: false
        });
        setStages(data);
      } catch (error) {
        console.error('Error al cargar etapas:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchStages();
  }, []);

  if (loading) return <div>Cargando...</div>;

  return (
    <div>
      {stages.map(stage => (
        <div key={stage.id}>
          <h3>{stage.name}</h3>
          <p>Responsable: {stage.responsible}</p>
          <button onClick={() => apiClient.completeStage(stage.id)}>
            Completar
          </button>
        </div>
      ))}
    </div>
  );
}
```

### Manejo de errores
```typescript
try {
  await apiClient.createProject({
    name: 'Nuevo Proyecto'
  });
} catch (error) {
  if (error instanceof Error) {
    alert(`Error: ${error.message}`);
  }
}
```

## Configuración personalizada

Si necesitas usar una URL base diferente:

```typescript
import ApiClient from './services/apiClient';

const customClient = new ApiClient('https://api.midominio.com/api');
const projects = await customClient.getProjects();
```
