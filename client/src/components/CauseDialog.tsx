import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@mui/material';
import { DELAY_CAUSES, DELAY_CAUSE_LABELS, getCauseSide, type DelayCause } from '../utils/delayCauses';

interface CauseDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  initialCause?: DelayCause | null;
  initialNote?: string | null;
  onClose: () => void;
  /** Debe lanzar un Error con el mensaje a mostrar si falla. */
  onConfirm: (cause: DelayCause, note: string | null) => Promise<void>;
}

/** Pide la causa de un retraso o espera: Cliente / Interna / Falta de información / Cambio de arquitectura / Otra. */
export default function CauseDialog({
  open,
  title,
  description,
  confirmLabel,
  initialCause = null,
  initialNote = null,
  onClose,
  onConfirm,
}: CauseDialogProps) {
  const [cause, setCause] = useState<DelayCause | ''>(initialCause ?? '');
  const [note, setNote] = useState(initialNote ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setCause(initialCause ?? '');
      setNote(initialNote ?? '');
      setError('');
    }
  }, [open, initialCause, initialNote]);

  const noteRequired = cause === 'other';
  const canSave = cause !== '' && (!noteRequired || note.trim().length >= 3);

  const handleConfirm = async () => {
    if (!cause || !canSave) return;
    setSaving(true);
    setError('');
    try {
      await onConfirm(cause, note.trim() || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {description && <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{description}</Typography>}
        <RadioGroup value={cause} onChange={(event) => setCause(event.target.value as DelayCause)}>
          {DELAY_CAUSES.map((value) => (
            <FormControlLabel
              key={value}
              value={value}
              control={<Radio size="small" />}
              label={
                <span>
                  {DELAY_CAUSE_LABELS[value]}{' '}
                  <Typography component="span" variant="caption" color="text.secondary">
                    (atribuible al {getCauseSide(value)})
                  </Typography>
                </span>
              }
            />
          ))}
        </RadioGroup>
        <TextField
          label={noteRequired ? 'Descripción (obligatoria)' : 'Comentario (opcional)'}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          fullWidth
          multiline
          minRows={2}
          size="small"
          sx={{ mt: 1.5 }}
        />
        {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button variant="contained" onClick={handleConfirm} disabled={!canSave || saving}>
          {saving ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
