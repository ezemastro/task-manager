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
  FormHelperText,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { apiClient, type CreateProjectRequest, type Client, type User } from '../services/apiClient';
import CreateClientModal from './CreateClientModal';
import MissingFieldWarning from './MissingFieldWarning';
import { dateStringToLocalISO } from '../utils/dateUtils';
import { getMissingFieldWarnings } from '../utils/projectRequiredFields';

type FormErrors = { name?: string; description?: string };

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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [formData, setFormData] = useState<CreateProjectRequest>({
    name: '',
    description: '',
    contact: '',
    client_id: undefined,
    responsible_id: undefined,
    deadline: undefined,
  });
  
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [createClientModalOpen, setCreateClientModalOpen] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  // Avisos de datos faltantes: no impiden guardar el proyecto.
  const missingWarnings = getMissingFieldWarnings(formData);

  useEffect(() => {
    fetchClients();
    fetchUsers();
  }, []);

  const fetchClients = async () => {
    try {
      const data = await apiClient.getClients();
      setClients(data);
    } catch (err) {
      console.error('Error al cargar clientes:', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await apiClient.getUsers();
      setUsers(data);
    } catch (err) {
      console.error('Error al cargar usuarios:', err);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre del proyecto es requerido';
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
    clearError(field);
  };

  const clearError = (field: keyof CreateProjectRequest) => {
    if (field in errors && errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const setRequiredSelect = (field: 'client_id' | 'responsible_id', value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value ? Number(value) : undefined }));
    clearError(field);
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      // Convertir fecha a ISO con hora local
      const projectData = {
        ...formData,
        deadline: dateStringToLocalISO(formData.deadline)
      };
      
      const result = await apiClient.createProject(projectData);
      
      // Limpiar formulario
      setFormData({
        name: '',
        description: '',
        contact: '',
        client_id: undefined,
        responsible_id: undefined,
        deadline: undefined,
      });
      setErrors({});

      // Llamar callbacks
      if (onSuccess) {
        onSuccess(result.id);
      }
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al crear el proyecto';
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
                         formData.contact?.trim() !== '' ||
                         formData.client_id !== undefined || 
                         formData.responsible_id !== undefined ||
                         formData.deadline !== undefined;
      
      if (hasChanges) {
        const confirm = window.confirm(
          '¿Estás seguro de que quieres cerrar? Los cambios se perderán.'
        );
        if (!confirm) return;
      }
      
      setFormData({ name: '', description: '', contact: '', client_id: undefined, responsible_id: undefined, deadline: undefined });
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
      fullScreen={isMobile}
    >
      <DialogTitle>
        Crear Nuevo Proyecto
      </DialogTitle>

      <DialogContent>
        <Box>
          <FormControl fullWidth margin="normal">
            <InputLabel>Cliente</InputLabel>
            <Select
              value={formData.client_id || ''}
              onChange={(e) => setRequiredSelect('client_id', e.target.value)}
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
            {missingWarnings.client_id && (
              <FormHelperText component="div">
                <MissingFieldWarning message={missingWarnings.client_id} />
              </FormHelperText>
            )}
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

          <FormControl fullWidth margin="normal">
            <InputLabel>Responsable</InputLabel>
            <Select
              value={formData.responsible_id || ''}
              onChange={(e) => setRequiredSelect('responsible_id', e.target.value)}
              label="Responsable"
              disabled={loading}
            >
              <MenuItem value="">
                <em>Sin responsable</em>
              </MenuItem>
              {users.map((user) => (
                <MenuItem key={user.id} value={user.id}>
                  {user.name}
                </MenuItem>
              ))}
            </Select>
            {missingWarnings.responsible_id && (
              <FormHelperText component="div">
                <MissingFieldWarning message={missingWarnings.responsible_id} />
              </FormHelperText>
            )}
          </FormControl>

          <TextField
            fullWidth
            required
            label="Nombre del Proyecto"
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
            label="Contacto"
            name="contact"
            value={formData.contact}
            onChange={handleChange('contact')}
            margin="normal"
            disabled={loading}
            helperText="Información de contacto relacionada con el proyecto"
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
              inputLabel: { shrink: true },
              formHelperText: { component: 'div' },
            }}
            helperText={
              missingWarnings.deadline
                ? <MissingFieldWarning message={missingWarnings.deadline} />
                : 'Fecha límite para completar el proyecto'
            }
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
            'Crear Proyecto'
          )}
        </Button>
      </DialogActions>

      <CreateClientModal
        open={createClientModalOpen}
        onClose={() => setCreateClientModalOpen(false)}
        onClientCreated={(client) => {
          fetchClients();
          // Seleccionar automáticamente el cliente recién creado
          if (client?.id) setRequiredSelect('client_id', client.id);
          setCreateClientModalOpen(false);
        }}
      />
    </Dialog>
  );
}
