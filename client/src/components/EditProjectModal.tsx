import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { apiClient, type Client } from '../services/apiClient';

interface EditProjectModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  projectId: number;
  initialData: {
    name: string;
    description?: string;
    client_id?: number;
    deadline?: string;
  };
}

export default function EditProjectModal({ 
  open, 
  onClose, 
  onSuccess,
  projectId,
  initialData,
}: EditProjectModalProps) {
  const [formData, setFormData] = useState({
    name: initialData.name,
    description: initialData.description || '',
    client_id: initialData.client_id,
    deadline: initialData.deadline ? initialData.deadline.split('T')[0] : '',
  });
  
  const [clients, setClients] = useState<Client[]>([]);
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({});
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (open) {
      setFormData({
        name: initialData.name,
        description: initialData.description || '',
        client_id: initialData.client_id,
        deadline: initialData.deadline ? initialData.deadline.split('T')[0] : '',
      });
      fetchClients();
    }
  }, [open, initialData]);

  const fetchClients = async () => {
    try {
      const data = await apiClient.getClients();
      setClients(data);
    } catch (err) {
      console.error('Error al cargar clientes:', err);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: { name?: string; description?: string } = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre de la obra es requerido';
    } else if (formData.name.length < 3) {
      newErrors.name = 'El nombre debe tener al menos 3 caracteres';
    } else if (formData.name.length > 100) {
      newErrors.name = 'El nombre no puede exceder 100 caracteres';
    }

    if (formData.description && formData.description.length > 500) {
      newErrors.description = 'La descripción no puede exceder 500 caracteres';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      await apiClient.updateProject(projectId, {
        name: formData.name,
        description: formData.description || undefined,
        client_id: formData.client_id || undefined,
        deadline: formData.deadline || undefined,
      });

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al actualizar la obra';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      // Verificar si hay cambios sin guardar comparando con initialData
      const hasChanges = 
        formData.name !== initialData.name ||
        formData.description !== (initialData.description || '') ||
        formData.client_id !== initialData.client_id ||
        formData.deadline !== (initialData.deadline ? initialData.deadline.split('T')[0] : '');
      
      if (hasChanges) {
        const confirm = window.confirm(
          '¿Estás seguro de que quieres cerrar? Los cambios sin guardar se perderán.'
        );
        if (!confirm) return;
      }
      
      setErrors({});
      setErrorMessage('');
      onClose();
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        Editar Obra
      </DialogTitle>

      <DialogContent>
        <Box>
          <FormControl fullWidth margin="normal">
            <InputLabel>Cliente</InputLabel>
            <Select
              value={formData.client_id || ''}
              onChange={(e) => setFormData({ ...formData, client_id: e.target.value ? Number(e.target.value) : undefined })}
              label="Cliente"
            >
              <MenuItem value="">
                <em>Sin cliente</em>
              </MenuItem>
              {clients.map((client) => (
                <MenuItem key={client.id} value={client.id}>
                  {client.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            autoFocus
            margin="normal"
            label="Nombre de la Obra"
            fullWidth
            required
            value={formData.name}
            onChange={(e) => {
              setFormData({ ...formData, name: e.target.value });
              if (errors.name) {
                setErrors({ ...errors, name: undefined });
              }
            }}
            error={!!errors.name}
            helperText={errors.name}
            disabled={loading}
          />

          <TextField
            margin="normal"
            label="Descripción"
            fullWidth
            multiline
            rows={3}
            value={formData.description}
            onChange={(e) => {
              setFormData({ ...formData, description: e.target.value });
              if (errors.description) {
                setErrors({ ...errors, description: undefined });
              }
            }}
            error={!!errors.description}
            helperText={errors.description}
            disabled={loading}
          />

          <TextField
            margin="normal"
            label="Fecha límite"
            type="date"
            fullWidth
            value={formData.deadline}
            onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
            disabled={loading}
            InputLabelProps={{
              shrink: true,
            }}
          />

          {errorMessage && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {errorMessage}
            </Alert>
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancelar
        </Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained"
          disabled={loading}
        >
          {loading ? (
            <>
              <CircularProgress size={20} sx={{ mr: 1 }} />
              Guardando...
            </>
          ) : (
            'Guardar Cambios'
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
