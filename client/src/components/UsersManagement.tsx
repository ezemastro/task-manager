import { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack,
  Chip,
} from '@mui/material';
import { apiClient, type User, type CreateUserRequest } from '../services/apiClient';

export default function UsersManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const usersList = await apiClient.getUsers();
      setUsers(usersList);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar usuarios';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 8, textAlign: 'center' }}>
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Cargando usuarios...
        </Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1">
          Gestión de Usuarios
        </Typography>
        <Stack direction="row" spacing={2}>
          <Button variant="outlined" onClick={fetchUsers}>
            Actualizar
          </Button>
          <Button variant="contained" onClick={() => setShowCreateModal(true)}>
            + Nuevo Usuario
          </Button>
        </Stack>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Nombre</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Rol</TableCell>
              <TableCell>Fecha de Creación</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  No hay usuarios registrados
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id} hover>
                  <TableCell>
                    <Typography variant="body1" fontWeight="medium">
                      {user.name}
                    </Typography>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    {user.role ? (
                      <Chip label={user.role} size="small" variant="outlined" />
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        Sin rol
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {new Date(user.created_at).toLocaleDateString('es-ES')}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <CreateUserModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          setShowCreateModal(false);
          fetchUsers();
        }}
      />
    </Container>
  );
}

interface CreateUserModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

function CreateUserModal({ open, onClose, onSuccess }: CreateUserModalProps) {
  const [formData, setFormData] = useState<CreateUserRequest>({
    name: '',
    email: '',
    role: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'El email es requerido';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email inválido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (field: keyof CreateUserRequest) => (
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

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setErrorMessage('');

    try {
      await apiClient.createUser(formData);
      setFormData({ name: '', email: '', role: '' });
      setErrors({});
      if (onSuccess) onSuccess();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al crear usuario';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setFormData({ name: '', email: '', role: '' });
      setErrors({});
      setErrorMessage('');
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Crear Nuevo Usuario</DialogTitle>

      <DialogContent>
        <Stack spacing={2} sx={{ pt: 2 }}>
          <TextField
            fullWidth
            required
            label="Nombre Completo"
            value={formData.name}
            onChange={handleChange('name')}
            error={!!errors.name}
            helperText={errors.name || 'Nombre completo del usuario'}
            disabled={loading}
            autoFocus
          />

          <TextField
            fullWidth
            required
            type="email"
            label="Email"
            value={formData.email}
            onChange={handleChange('email')}
            error={!!errors.email}
            helperText={errors.email || 'Dirección de correo electrónico'}
            disabled={loading}
          />

          <TextField
            fullWidth
            label="Rol / Cargo"
            value={formData.role}
            onChange={handleChange('role')}
            helperText="Ej: Ingeniero Civil, Arquitecto, Jefe de Obra (opcional)"
            disabled={loading}
          />

          {errorMessage && (
            <Alert severity="error">{errorMessage}</Alert>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading}>
          {loading ? (
            <>
              <CircularProgress size={20} sx={{ mr: 1 }} />
              Creando...
            </>
          ) : (
            'Crear Usuario'
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
