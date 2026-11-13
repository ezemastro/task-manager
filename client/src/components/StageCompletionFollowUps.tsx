import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Alert,
} from '@mui/material';
import { apiClient, type Client, type Tag } from '../services/apiClient';
import EditClientModal from './EditClientModal';
import ProjectTagsDialog from './ProjectTagsDialog';

export interface CompletionStageInfo {
  name: string;
  order_number: number;
  project_id: number;
  project_name?: string;
  client_id?: number;
}

// Normaliza un nombre: recorta, minúsculas, sin acentos y colapsa espacios.
function normalizeStageName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// El helper se exporta desde este archivo a propósito (lo requiere la spec); se desactiva
// la regla de fast-refresh que solo admite exportar componentes.
// eslint-disable-next-line react-refresh/only-export-components
export function isDeliveryReviewStage(stage: { name: string }): boolean {
  return normalizeStageName(stage.name) === 'entrega completa y revisada';
}

interface StageCompletionFollowUpsProps {
  stage: CompletionStageInfo;
  onClose: () => void;
}

export default function StageCompletionFollowUps({ stage, onClose }: StageCompletionFollowUpsProps) {
  const [step, setStep] = useState<'preferences' | 'tags'>('preferences');
  const [client, setClient] = useState<Client | null>(null);
  const [projectTags, setProjectTags] = useState<Tag[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Diálogo 1: ¿preferencias del cliente?
  const preferencesDialogOpen = step === 'preferences' && client === null;

  const handlePreferencesNo = () => {
    setError('');
    setStep('tags');
  };

  const handlePreferencesClose = () => {
    // El cierre por backdrop/escape actúa como "No", salvo mientras carga.
    if (loading) return;
    handlePreferencesNo();
  };

  const handlePreferencesYes = async () => {
    if (loading || !stage.client_id) return;

    setLoading(true);
    setError('');
    try {
      const fetched = await apiClient.getClient(stage.client_id);
      setClient(fetched);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el cliente');
    } finally {
      setLoading(false);
    }
  };

  // Diálogo 2: ¿etiquetas?
  const tagsDialogOpen = step === 'tags' && projectTags === null;

  const handleTagsNo = () => {
    onClose();
  };

  const handleTagsClose = () => {
    // El cierre por backdrop/escape termina el flujo, salvo mientras carga.
    if (loading) return;
    onClose();
  };

  const handleTagsYes = async () => {
    if (loading) return;

    setLoading(true);
    setError('');
    try {
      const project = await apiClient.getProject(stage.project_id);
      setProjectTags(project.tags ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el proyecto');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Diálogo de preferencias del cliente */}
      <Dialog
        open={preferencesDialogOpen}
        onClose={handlePreferencesClose}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>¿Quieres agregar Preferencias del Cliente?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Podés cargar las preferencias del cliente antes de cerrar el proyecto.
          </Typography>
          {error ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          ) : null}
          {!stage.client_id ? (
            <Typography color="text.secondary" sx={{ mt: 2 }}>
              Este proyecto no tiene cliente asignado.
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={handlePreferencesNo} disabled={loading}>
            No
          </Button>
          <Button
            onClick={handlePreferencesYes}
            variant="contained"
            disabled={loading || !stage.client_id}
          >
            {loading ? 'Cargando...' : 'Sí'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Editor del cliente */}
      <EditClientModal
        open={client !== null}
        client={client}
        onClose={() => {
          setClient(null);
          setStep('tags');
        }}
        onSaved={undefined}
      />

      {/* Diálogo de etiquetas */}
      <Dialog open={tagsDialogOpen} onClose={handleTagsClose} maxWidth="xs" fullWidth>
        <DialogTitle>¿Quieres agregar etiquetas?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Podés asignar etiquetas al proyecto para encontrarlo más fácil.
          </Typography>
          {error ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleTagsNo} disabled={loading}>
            No
          </Button>
          <Button onClick={handleTagsYes} variant="contained" disabled={loading}>
            {loading ? 'Cargando...' : 'Sí'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Gestor de etiquetas del proyecto */}
      <ProjectTagsDialog
        open={projectTags !== null}
        projectId={stage.project_id}
        projectName={stage.project_name ?? ''}
        assignedTags={projectTags ?? []}
        onClose={() => {
          setProjectTags(null);
          onClose();
        }}
        onChanged={() => {}}
      />
    </>
  );
}
