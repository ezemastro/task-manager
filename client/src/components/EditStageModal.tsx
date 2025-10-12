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
  Stack,
} from '@mui/material';
import { apiClient, type User } from '../services/apiClient';

interface EditStageModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  stageId: number;
  initialData: {
    name: string;
    responsible_id?: number;
    start_date?: string;
    estimated_end_date?: string;
  };
}

export default function EditStageModal({ 
  open, 
  onClose, 
  onSuccess,
  stageId,
  initialData,
}: EditStageModalProps) {
  const [formData, setFormData] = useState({
    name: initialData.name,
    responsible_id: initialData.responsible_id,
    start_date: initialData.start_date ? initialData.start_date.substring(0, 10) : '',
    estimated_end_date: initialData.estimated_end_date ? initialData.estimated_end_date.substring(0, 10) : '',
  });
  
  const [users, setUsers] = useState<User[]>([]);
  const [errors, setErrors] = useState<{ name?: string }>({});
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Función para convertir fecha ISO a formato YYYY-MM-DD sin conversión de zona horaria
  const formatDateForInput = (dateString?: string): string => {
    if (!dateString) return '';
    // Extraer solo la parte de la fecha (YYYY-MM-DD)
    return dateString.substring(0, 10);
  };

  useEffect(() => {
    if (open) {
      setFormData({
        name: initialData.name,
        responsible_id: initialData.responsible_id,
        start_date: formatDateForInput(initialData.start_date),
        estimated_end_date: formatDateForInput(initialData.estimated_end_date),
      });
      fetchUsers();
    }
  }, [open, initialData]);

  const fetchUsers = async () => {
    try {
      const data = await apiClient.getUsers();
      setUsers(data);
    } catch (err) {
      console.error('Error al cargar usuarios:', err);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: { name?: string } = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre de la etapa es requerido';
    } else if (formData.name.length < 3) {
      newErrors.name = 'El nombre debe tener al menos 3 caracteres';
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
      await apiClient.updateStage(stageId, {
        name: formData.name,
        responsible_id: formData.responsible_id || null,
        start_date: formData.start_date || null,
        estimated_end_date: formData.estimated_end_date || null,
      });

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al actualizar la etapa';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
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
        Editar Etapa
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mt: 1 }}>
          <TextField
            autoFocus
            margin="normal"
            label="Nombre de la Etapa"
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

          <FormControl fullWidth margin="normal">
            <InputLabel>Responsable</InputLabel>
            <Select
              value={formData.responsible_id || ''}
              onChange={(e) => setFormData({ ...formData, responsible_id: e.target.value ? Number(e.target.value) : undefined })}
              label="Responsable"
              disabled={loading}
            >
              <MenuItem value="">
                <em>Sin asignar</em>
              </MenuItem>
              {users.map((user) => (
                <MenuItem key={user.id} value={user.id}>
                  {user.name} {user.role ? `(${user.role})` : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            <TextField
              label="Fecha de inicio"
              type="date"
              fullWidth
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              disabled={loading}
              InputLabelProps={{
                shrink: true,
              }}
            />

            <TextField
              label="Fecha estimada de fin"
              type="date"
              fullWidth
              value={formData.estimated_end_date}
              onChange={(e) => setFormData({ ...formData, estimated_end_date: e.target.value })}
              disabled={loading}
              InputLabelProps={{
                shrink: true,
              }}
            />
          </Stack>

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
