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
  Stack,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  FormHelperText,
} from '@mui/material';
import { apiClient, type CreateStageRequest, type User } from '../services/apiClient';

interface CreateStageModalProps {
  open: boolean;
  onClose: () => void;
  projectId: number;
  onSuccess?: (stageId: number) => void;
}

export default function CreateStageModal({ 
  open, 
  onClose, 
  projectId,
  onSuccess 
}: CreateStageModalProps) {
  const [formData, setFormData] = useState<Omit<CreateStageRequest, 'project_id'>>({
    name: '',
    responsible_id: 0,
    start_date: '',
    estimated_end_date: '',
  });
  
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Cargar usuarios al abrir el modal
  useEffect(() => {
    if (open) {
      fetchUsers();
    }
  }, [open]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const usersList = await apiClient.getUsers();
      setUsers(usersList);
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
      setErrorMessage('Error al cargar la lista de usuarios');
    } finally {
      setLoadingUsers(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre de la etapa es requerido';
    } else if (formData.name.length < 3) {
      newErrors.name = 'El nombre debe tener al menos 3 caracteres';
    }

    if (!formData.responsible_id || formData.responsible_id === 0) {
      newErrors.responsible_id = 'Debes seleccionar un responsable';
    }

    if (formData.start_date && formData.estimated_end_date) {
      if (new Date(formData.start_date) > new Date(formData.estimated_end_date)) {
        newErrors.estimated_end_date = 'La fecha de fin debe ser posterior a la de inicio';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (field: keyof typeof formData) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData({
      ...formData,
      [field]: event.target.value,
    });
    if (errors[field]) {
      setErrors({
        ...errors,
        [field]: '',
      });
    }
  };

  const handleSelectChange = (event: { target: { value: unknown } }) => {
    setFormData({
      ...formData,
      responsible_id: event.target.value as number,
    });
    if (errors.responsible_id) {
      setErrors({
        ...errors,
        responsible_id: '',
      });
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const result = await apiClient.createStage({
        project_id: projectId,
        name: formData.name,
        responsible_id: formData.responsible_id,
        start_date: formData.start_date || undefined,
        estimated_end_date: formData.estimated_end_date || undefined,
      });
      
      // Limpiar formulario
      setFormData({
        name: '',
        responsible_id: 0,
        start_date: '',
        estimated_end_date: '',
      });
      setErrors({});

      // Llamar callbacks
      if (onSuccess) {
        onSuccess(result.id);
      }
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al crear la etapa';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      // Verificar si hay cambios sin guardar
      const hasChanges = formData.name.trim() !== '' || 
                         formData.responsible_id !== 0 || 
                         formData.start_date !== '' || 
                         formData.estimated_end_date !== '';
      
      if (hasChanges) {
        const confirm = window.confirm(
          '¿Estás seguro de que quieres cerrar? Los cambios se perderán.'
        );
        if (!confirm) return;
      }
      
      setFormData({
        name: '',
        responsible_id: 0,
        start_date: '',
        estimated_end_date: '',
      });
      setErrors({});
      setErrorMessage('');
      onClose();
    }
  };

  // Obtener fecha de hoy en formato YYYY-MM-DD
  const today = new Date().toISOString().split('T')[0];

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        Crear Nueva Etapa
      </DialogTitle>

      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <TextField
              fullWidth
              required
              label="Nombre de la Etapa"
              name="name"
              value={formData.name}
              onChange={handleChange('name')}
              error={!!errors.name}
              helperText={errors.name || 'Ej: Excavación y Cimientos'}
              disabled={loading}
              autoFocus
            />

            <FormControl fullWidth required error={!!errors.responsible_id}>
              <InputLabel>Responsable</InputLabel>
              <Select
                value={formData.responsible_id}
                onChange={handleSelectChange}
                label="Responsable"
                disabled={loading || loadingUsers}
              >
                <MenuItem value={0} disabled>
                  {loadingUsers ? 'Cargando usuarios...' : 'Selecciona un responsable'}
                </MenuItem>
                {users.map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.name} {user.role ? `- ${user.role}` : ''}
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                {errors.responsible_id || 'Selecciona el usuario responsable de esta etapa'}
              </FormHelperText>
            </FormControl>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                type="date"
                label="Fecha de Inicio"
                name="start_date"
                value={formData.start_date}
                onChange={handleChange('start_date')}
                error={!!errors.start_date}
                helperText={errors.start_date || 'Fecha en que inicia la etapa'}
                disabled={loading}
                slotProps={{ inputLabel: { shrink: true }}}
              />

              <TextField
                fullWidth
                type="date"
                label="Fecha Estimada de Finalización"
                name="estimated_end_date"
                value={formData.estimated_end_date}
                onChange={handleChange('estimated_end_date')}
                error={!!errors.estimated_end_date}
                helperText={errors.estimated_end_date || 'Fecha estimada de completación'}
                disabled={loading}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: formData.start_date || today } }}
              />
            </Stack>
          </Stack>

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
            'Crear Etapa'
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
