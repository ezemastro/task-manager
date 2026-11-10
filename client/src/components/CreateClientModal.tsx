import { useState } from 'react';
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
import { apiClient } from '../services/apiClient';

interface CreateClientModalProps {
  open: boolean;
  onClose: () => void;
  onClientCreated: () => void;
}

export default function CreateClientModal({ open, onClose, onClientCreated }: CreateClientModalProps) {
  const [name, setName] = useState('');
  const [preferences, setPreferences] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('El nombre del cliente es requerido');
      return;
    }

    setLoading(true);

    try {
      await apiClient.createClient({
        name: name.trim(),
        preferences: preferences.trim() || undefined,
      });
      
      setName('');
      setPreferences('');
      onClientCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el cliente');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      // Verificar si hay cambios sin guardar
      const hasChanges = name.trim() !== '' || preferences.trim() !== '';
      
      if (hasChanges) {
        const confirm = window.confirm(
          '¿Estás seguro de que quieres cerrar? Los cambios se perderán.'
        );
        if (!confirm) return;
      }
      
      setName('');
      setPreferences('');
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Crear Nuevo Cliente</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              fullWidth
              autoFocus
              disabled={loading}
            />
            <TextField
              label="Preferencias"
              value={preferences}
              onChange={(e) => setPreferences(e.target.value)}
              multiline
              minRows={3}
              fullWidth
              disabled={loading}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? 'Creando...' : 'Crear'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
