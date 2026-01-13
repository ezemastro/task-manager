# Componentes de Formulario - Crear Proyecto

## 📋 Componentes Creados

### 1. **CreateProjectForm** (Formulario Completo)
Formulario de página completa con diseño en Paper/Card.

**Ubicación:** `/src/components/CreateProjectForm.tsx`

**Características:**
- ✅ Validación en tiempo real
- ✅ Mensajes de error específicos
- ✅ Contador de caracteres
- ✅ Loading state con spinner
- ✅ Snackbar de éxito
- ✅ Botones de limpiar y cancelar
- ✅ Diseño responsive

**Props:**
```typescript
interface CreateProjectFormProps {
  onSuccess?: (projectId: number) => void;  // Callback al crear exitosamente
  onCancel?: () => void;                     // Callback para cancelar
}
```

**Uso:**
```tsx
import CreateProjectForm from './components/CreateProjectForm';

function MyComponent() {
  const handleSuccess = (projectId: number) => {
    console.log('Proyecto creado:', projectId);
    // Redirigir, actualizar lista, etc.
  };

  return (
    <CreateProjectForm 
      onSuccess={handleSuccess}
      onCancel={() => console.log('Cancelado')}
    />
  );
}
```

---

### 2. **CreateProjectModal** (Modal/Dialog)
Modal compacto para crear proyecto sin salir de la página actual.

**Ubicación:** `/src/components/CreateProjectModal.tsx`

**Características:**
- ✅ Dialog modal de MUI
- ✅ Mismas validaciones que el formulario completo
- ✅ Cierre automático al crear
- ✅ Prevención de cierre mientras está cargando
- ✅ Diseño compacto

**Props:**
```typescript
interface CreateProjectModalProps {
  open: boolean;                            // Controla si el modal está abierto
  onClose: () => void;                      // Callback para cerrar el modal
  onSuccess?: (projectId: number) => void;  // Callback al crear exitosamente
}
```

**Uso:**
```tsx
import { useState } from 'react';
import CreateProjectModal from './components/CreateProjectModal';

function MyComponent() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        Nuevo Proyecto
      </Button>

      <CreateProjectModal
        open={open}
        onClose={() => setOpen(false)}
        onSuccess={(id) => {
          console.log('Proyecto creado:', id);
          setOpen(false);
        }}
      />
    </>
  );
}
```

---

## 🎨 Validaciones Implementadas

### Campo: Nombre
- ✅ **Requerido:** No puede estar vacío
- ✅ **Mínimo:** 3 caracteres
- ✅ **Máximo:** 100 caracteres
- ✅ **Mensaje helper:** "Ej: Construcción Edificio Central"

### Campo: Descripción
- ⭕ **Opcional:** Puede dejarse vacío
- ✅ **Máximo:** 500 caracteres
- ✅ **Contador:** Muestra caracteres usados/límite
- ✅ **Multiline:** 4 líneas de altura

---

## 🎯 Estados del Formulario

### Loading (Cargando)
- Deshabilita todos los campos
- Deshabilita todos los botones
- Muestra spinner en el botón de submit
- Texto del botón cambia a "Creando..."

### Error
- Resalta campos con error en rojo
- Muestra mensajes de ayuda específicos
- Alert rojo con mensaje de error del servidor

### Éxito
- Snackbar verde en la parte inferior (solo formulario completo)
- Limpia el formulario automáticamente
- Llama al callback `onSuccess` con el ID del proyecto
- Cierra el modal automáticamente (solo modal)

---

## 🔧 Integración con el API Client

Ambos componentes usan el cliente tipado:

```typescript
import { apiClient, type CreateProjectRequest } from '../services/apiClient';

// Dentro del componente
const result = await apiClient.createProject({
  name: 'Mi Proyecto',
  description: 'Descripción opcional'
});

console.log(result.id); // ID del proyecto creado
```

---

## 📱 Responsive Design

Ambos componentes son completamente responsive:

- **Desktop:** Ancho máximo `md` (960px)
- **Tablet:** Stack de botones en fila
- **Mobile:** Stack de botones en columna

---

## 🎨 Personalización del Tema

El tema de MUI está configurado en `App.tsx`:

```typescript
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',  // Azul principal
    },
    secondary: {
      main: '#dc004e',  // Rosa/rojo secundario
    },
  },
});
```

Para cambiar colores, modifica el objeto `theme`.

---

## 🚀 Ejemplo Completo en App.tsx

La aplicación incluye:

1. **Página de inicio** con dos opciones:
   - Botón para abrir formulario completo
   - Botón para abrir modal

2. **Formulario completo** con botón de volver

3. **Modal** que se superpone a la página actual

```tsx
// El usuario puede elegir qué opción usar
<Button onClick={() => setShowFullForm(true)}>
  Formulario Completo
</Button>

<Button onClick={() => setShowModal(true)}>
  Abrir Modal
</Button>
```

---

## 📦 Dependencias Utilizadas

- `@mui/material` - Componentes de Material UI
- `@emotion/react` - Estilos de MUI
- `@emotion/styled` - Estilos de MUI
- Cliente API tipado local

---

## 🔄 Flujo de Trabajo

1. Usuario abre formulario o modal
2. Completa campos (validación en tiempo real)
3. Click en "Crear Proyecto"
4. Loading state se activa
5. Request a la API
6. Si éxito:
   - Muestra mensaje de éxito
   - Limpia formulario
   - Llama callback `onSuccess`
   - Cierra modal (si es modal)
7. Si error:
   - Muestra mensaje de error
   - Mantiene datos del formulario
   - Usuario puede corregir y reintentar

---

## 💡 Tips de Uso

### Para listas de proyectos:
Usa el **modal** para crear sin salir de la vista de lista.

### Para flujo dedicado:
Usa el **formulario completo** como página independiente.

### Actualizar lista después de crear:
```tsx
const handleSuccess = (projectId: number) => {
  // Recargar lista de proyectos
  fetchProjects();
  
  // O navegar al proyecto creado
  navigate(`/projects/${projectId}`);
};
```
