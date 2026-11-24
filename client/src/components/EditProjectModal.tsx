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
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import { apiClient, type Client, type User } from '../services/apiClient';
import { dateStringToLocalISO, isoToDateString } from '../utils/dateUtils';
import { getMissingFieldWarnings } from '../utils/projectRequiredFields';
import MissingFieldWarning from './MissingFieldWarning';
import { PROJECT_TYPES, PROJECT_TYPE_LABELS, type ProjectType } from '../utils/projectTypes';

type FormErrors = { name?: string; description?: string };

interface EditProjectModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  projectId: number;
  initialData: {
    name: string;
    description?: string;
    contact?: string | null;
    client_id?: number;
    responsible_id?: number;
    deadline?: string;
    /** Fecha que usa el indicador de retrasos (si ya hubo una, cambiarla pide motivo). */
    committed_deadline?: string | null;
    project_type?: ProjectType | null;
  };
}

export default function EditProjectModal({ 
  open, 
  onClose, 
  onSuccess,
  projectId,
  initialData,
}: EditProjectModalProps) {
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    contact: string;
    client_id?: number;
    responsible_id?: number;
    deadline: string;
    project_type: ProjectType | '';
  }>({
    name: initialData.name,
    description: initialData.description || '',
    contact: initialData.contact || '',
    client_id: initialData.client_id,
    responsible_id: initialData.responsible_id,
    deadline: isoToDateString(initialData.deadline),
    project_type: initialData.project_type || '',
  });
  
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  // Avisos de datos faltantes: no impiden guardar el proyecto.
  const missingWarnings = getMissingFieldWarnings(formData);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  // Cambio de fecha comprometida: motivo obligatorio y si fue acordado con el cliente.
  const [deadlineReason, setDeadlineReason] = useState('');
  const [deadlineAgreed, setDeadlineAgreed] = useState(false);
  const [deadlineReasonError, setDeadlineReasonError] = useState('');
  const initialDeadline = isoToDateString(initialData.deadline);
  const deadlineChanged = formData.deadline !== initialDeadline;
  const needsDeadlineReason = deadlineChanged && Boolean(initialDeadline || initialData.committed_deadline);

  useEffect(() => {
    if (open) {
      setFormData({
        name: initialData.name,
        description: initialData.description || '',
        contact: initialData.contact || '',
        client_id: initialData.client_id,
        responsible_id: initialData.responsible_id,
        deadline: isoToDateString(initialData.deadline),
        project_type: initialData.project_type || '',
      });
      setDeadlineReason('');
      setDeadlineAgreed(false);
      setDeadlineReasonError('');
      fetchClients();
      fetchUsers();
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
    const reasonOk = !needsDeadlineReason || deadlineReason.trim().length >= 5;
    setDeadlineReasonError(reasonOk ? '' : 'Escribí el motivo del cambio (al menos 5 caracteres)');
    return Object.keys(newErrors).length === 0 && reasonOk;
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
        contact: formData.contact.trim() || null,
        client_id: formData.client_id || undefined,
        responsible_id: formData.responsible_id || undefined,
        // La fecha solo se envía si se cambió (así no se registra un cambio que no existió).
        ...(deadlineChanged ? {
          deadline: formData.deadline ? dateStringToLocalISO(formData.deadline) : null,
          ...(needsDeadlineReason ? {
            deadline_change_reason: deadlineReason.trim(),
            deadline_agreed_with_client: deadlineAgreed,
          } : {}),
        } : {}),
        project_type: formData.project_type || undefined,
      });

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al actualizar el proyecto';
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
        formData.project_type !== (initialData.project_type || '') ||
        formData.description !== (initialData.description || '') ||
        formData.contact !== (initialData.contact || '') ||
        formData.client_id !== initialData.client_id ||
        formData.responsible_id !== initialData.responsible_id ||
        deadlineChanged;
      
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
        Editar Proyecto
      </DialogTitle>

      <DialogContent>
        <Box>
          <FormControl fullWidth margin="normal">
            <InputLabel>Tipo de proyecto</InputLabel>
            <Select
              value={formData.project_type}
              onChange={(e) => setFormData({ ...formData, project_type: e.target.value as ProjectType | '' })}
              label="Tipo de proyecto"
              disabled={loading}
            >
              {!initialData.project_type && (
                <MenuItem value="">
                  <em>Sin tipo</em>
                </MenuItem>
              )}
              {PROJECT_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {PROJECT_TYPE_LABELS[type]}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>Cambiar el tipo no modifica las etapas que el proyecto ya tiene</FormHelperText>
          </FormControl>

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
            {missingWarnings.client_id && (
              <FormHelperText component="div">
                <MissingFieldWarning message={missingWarnings.client_id} />
              </FormHelperText>
            )}
          </FormControl>

          <FormControl fullWidth margin="normal">
            <InputLabel>Responsable</InputLabel>
            <Select
              value={formData.responsible_id || ''}
              onChange={(e) => setFormData({ ...formData, responsible_id: e.target.value ? Number(e.target.value) : undefined })}
              label="Responsable"
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
            autoFocus
            margin="normal"
            label="Nombre del Proyecto"
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
            label="Contacto"
            fullWidth
            value={formData.contact}
            onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
            helperText="Información de contacto relacionada con el proyecto"
            disabled={loading}
            inputProps={{
              maxLength: 500,
            }}
          />

          <TextField
            margin="normal"
            label="Fecha comprometida de entrega"
            type="date"
            fullWidth
            value={formData.deadline}
            onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
            helperText={missingWarnings.deadline && <MissingFieldWarning message={missingWarnings.deadline} />}
            disabled={loading}
            slotProps={{
              inputLabel: { shrink: true },
              formHelperText: { component: 'div' },
            }}
          />

          {needsDeadlineReason && (
            <Box sx={{ mt: 1, p: 1.5, border: 1, borderColor: 'warning.main', borderRadius: 1 }}>
              <TextField
                label="Motivo del cambio de fecha (obligatorio)"
                fullWidth
                multiline
                minRows={2}
                size="small"
                value={deadlineReason}
                onChange={(e) => {
                  setDeadlineReason(e.target.value);
                  if (deadlineReasonError) setDeadlineReasonError('');
                }}
                error={!!deadlineReasonError}
                helperText={deadlineReasonError || 'Queda registrado con tu usuario, la fecha y el valor anterior.'}
                disabled={loading}
              />
              <FormControlLabel
                sx={{ mt: 0.5 }}
                control={<Checkbox checked={deadlineAgreed} onChange={(e) => setDeadlineAgreed(e.target.checked)} disabled={loading} />}
                label="Cambio acordado con el cliente"
              />
              <FormHelperText sx={{ mt: 0 }}>
                {deadlineAgreed
                  ? 'El indicador de retrasos va a medir contra la nueva fecha.'
                  : 'Sin acuerdo con el cliente, el indicador de retrasos sigue midiendo contra la fecha comprometida original.'}
              </FormHelperText>
            </Box>
          )}

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
