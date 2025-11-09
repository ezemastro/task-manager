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
import { Add as AddIcon } from '@mui/icons-material';
import { apiClient, type CreateProjectRequest, type Client } from '../services/apiClient';
import CreateClientModal from './CreateClientModal';

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (projectId: number) => void;
}

export default function CreateProjectModal({ 
  open, 
  onClose, 
  onSuccess 
}: CreateProjectModalProps) {
  const [formData, setFormData] = useState<CreateProjectRequest>({
    name: '',
    description: '',
    client_id: undefined,
    deadline: undefined,
  });
  
  const [clients, setClients] = useState<Client[]>([]);
  const [createClientModalOpen, setCreateClientModalOpen] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({});
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetchClients();
  }, []);

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

  const handleChange = (field: keyof CreateProjectRequest) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...formData,
      [field]: event.target.value,
    });
    if (field === 'name' || field === 'description') {
      if (errors[field]) {
        setErrors({
          ...errors,
          [field]: undefined,
        });
      }
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const result = await apiClient.createProject(formData);
      
      // Limpiar formulario
      setFormData({
        name: '',
        description: '',
        client_id: undefined,
        deadline: undefined,
      });
      setErrors({});

      // Llamar callbacks
      if (onSuccess) {
        onSuccess(result.id);
      }
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al crear la obra';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      // Verificar si hay cambios sin guardar
      const hasChanges = formData.name.trim() !== '' || 
                         formData.description?.trim() !== '' || 
                         formData.client_id !== undefined || 
                         formData.deadline !== undefined;
      
      if (hasChanges) {
        const confirm = window.confirm(
          '¿Estás seguro de que quieres cerrar? Los cambios se perderán.'
        );
        if (!confirm) return;
      }
      
      setFormData({ name: '', description: '', client_id: undefined, deadline: undefined });
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
        Crear Nueva Obra
      </DialogTitle>

      <DialogContent>
        <Box>
          <FormControl fullWidth margin="normal">
            <InputLabel>Cliente</InputLabel>
            <Select
              value={formData.client_id || ''}
              onChange={(e) => setFormData({ ...formData, client_id: e.target.value ? Number(e.target.value) : undefined })}
              label="Cliente"
              disabled={loading}
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

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
            <Button
              startIcon={<AddIcon />}
              onClick={() => setCreateClientModalOpen(true)}
              size="small"
              disabled={loading}
            >
              Nuevo Cliente
            </Button>
          </Box>

          <TextField
            fullWidth
            required
            label="Nombre de la Obra"
            name="name"
            value={formData.name}
            onChange={handleChange('name')}
            error={!!errors.name}
            helperText={errors.name || 'Ej: Construcción Edificio Central'}
            margin="normal"
            disabled={loading}
            autoFocus
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />

          <TextField
            fullWidth
            label="Descripción"
            name="description"
            value={formData.description}
            onChange={handleChange('description')}
            error={!!errors.description}
            helperText={
              errors.description || 
              `${formData.description?.length || 0}/500 caracteres`
            }
            margin="normal"
            multiline
            rows={4}
            disabled={loading}
            inputProps={{
              maxLength: 500,
            }}
          />

          <TextField
            fullWidth
            label="Fecha de Finalización Programada"
            name="deadline"
            type="date"
            value={formData.deadline || ''}
            onChange={handleChange('deadline')}
            margin="normal"
            disabled={loading}
            slotProps={{
              inputLabel: { shrink: true }
            }}
            helperText="Fecha límite para completar la obra"
          />

          {errorMessage && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {errorMessage}
            </Alert>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button 
          onClick={handleClose} 
          disabled={loading}
        >
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
              Creando...
            </>
          ) : (
            'Crear Obra'
          )}
        </Button>
      </DialogActions>

      <CreateClientModal
        open={createClientModalOpen}
        onClose={() => setCreateClientModalOpen(false)}
        onClientCreated={() => {
          fetchClients();
          setCreateClientModalOpen(false);
        }}
      />
    </Dialog>
  );
}
