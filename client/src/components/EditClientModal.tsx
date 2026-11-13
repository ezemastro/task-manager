import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Alert,
} from '@mui/material';
import { apiClient, type Client } from '../services/apiClient';

interface EditClientModalProps {
  open: boolean;
  client: Client | null;
  onClose: () => void;
  onSaved?: () => void;
}

export default function EditClientModal({ open, client, onClose, onSaved }: EditClientModalProps) {
  const [name, setName] = useState('');
  const [preferences, setPreferences] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Inicializar los campos desde el cliente cuando se abre el diálogo.
  useEffect(() => {
    if (open && client) {
      setName(client.name);
      setPreferences(client.preferences || '');
      setError('');
    }
  }, [open, client]);

  const handleClose = () => {
    // Ignorar el cierre mientras se guarda.
    if (saving) return;
    onClose();
  };

  const handleSave = async () => {
    if (!client || !name.trim()) return;

    setSaving(true);
    setError('');

    try {
      await apiClient.updateClient(client.id, {
        name: name.trim(),
        preferences: preferences.trim() || undefined,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar el cliente');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Editar Cliente</DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
            disabled={saving}
          />
          <TextField
            label="Preferencias"
            value={preferences}
            onChange={(e) => setPreferences(e.target.value)}
            multiline
            minRows={3}
            fullWidth
            disabled={saving}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>
          Cancelar
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={saving || !name.trim()}
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
