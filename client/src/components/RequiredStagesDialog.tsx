import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { apiClient, type Stage } from '../services/apiClient';

interface RequiredStagesDialogProps {
  open: boolean;
  /** Etapas obligatorias que siguen pendientes (ni completadas ni "No aplica"). */
  pendingStages: Stage[];
  onClose: () => void;
  /** Se llama después de marcar una etapa, para recargar el proyecto. */
  onStageResolved: () => Promise<void> | void;
  /** Completa el proyecto; solo se habilita cuando no quedan pendientes. */
  onCompleteProject: () => Promise<void> | void;
}

const MIN_REASON_LENGTH = 5;

/**
 * Aparece al tocar "Completar proyecto" si hay etapas obligatorias abiertas.
 * Cada una se puede marcar "No aplica" con un motivo escrito (queda registrado
 * quién lo decidió). Cuando no queda ninguna, se puede completar el proyecto.
 */
export default function RequiredStagesDialog({
  open,
  pendingStages,
  onClose,
  onStageResolved,
  onCompleteProject,
}: RequiredStagesDialogProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState('');

  const startNotApplicable = (stageId: number) => {
    setEditingId(stageId);
    setReason('');
    setError('');
  };

  const confirmNotApplicable = async (stageId: number) => {
    if (reason.trim().length < MIN_REASON_LENGTH) {
      setError('Escribí el motivo por el que esta etapa no aplica.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.markStageNotApplicable(stageId, reason.trim());
      setEditingId(null);
      setReason('');
      await onStageResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo marcar la etapa');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    setError('');
    try {
      await onCompleteProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar el proyecto');
    } finally {
      setCompleting(false);
    }
  };

  const allResolved = pendingStages.length === 0;

  return (
    <Dialog open={open} onClose={saving || completing ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {allResolved ? 'Etapas obligatorias resueltas' : 'Hay etapas obligatorias pendientes'}
      </DialogTitle>
      <DialogContent>
        {allResolved ? (
          <Typography>Todas las etapas obligatorias están completadas o marcadas como "No aplica". Ya podés completar el proyecto.</Typography>
        ) : (
          <>
            <Typography sx={{ mb: 2 }}>
              Para completar el proyecto, cada etapa obligatoria tiene que estar completada o marcada como
              "No aplica" con un motivo (queda registrado quién lo decidió).
            </Typography>
            <Stack spacing={1.5}>
              {pendingStages.map((stage) => (
                <Box key={stage.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                    <Typography fontWeight="medium">{stage.name}</Typography>
                    {editingId !== stage.id && (
                      <Button size="small" onClick={() => startNotApplicable(stage.id)} disabled={saving}>
                        Marcar como No aplica
                      </Button>
                    )}
                  </Stack>
                  {editingId === stage.id && (
                    <Stack spacing={1} sx={{ mt: 1 }}>
                      <TextField
                        autoFocus
                        size="small"
                        label="Motivo (obligatorio)"
                        placeholder="Ej.: el trabajo no incluye cálculo estructural"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        multiline
                        minRows={2}
                        slotProps={{ htmlInput: { maxLength: 500 } }}
                        disabled={saving}
                      />
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button size="small" onClick={() => setEditingId(null)} disabled={saving}>Cancelar</Button>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => confirmNotApplicable(stage.id)}
                          disabled={saving || reason.trim().length < MIN_REASON_LENGTH}
                        >
                          {saving ? <CircularProgress size={16} /> : 'Confirmar No aplica'}
                        </Button>
                      </Stack>
                    </Stack>
                  )}
                </Box>
              ))}
            </Stack>
          </>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving || completing}>Cerrar</Button>
        <Button
          variant="contained"
          color="success"
          onClick={handleComplete}
          disabled={!allResolved || completing || saving}
        >
          {completing ? <CircularProgress size={18} /> : 'Completar proyecto'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
