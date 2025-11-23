import { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  Stack,
  Divider,
} from '@mui/material';
import { Business as BusinessIcon, Person as PersonIcon } from '@mui/icons-material';
import { apiClient, type Organization, type User } from '../services/apiClient';

export default function LoginPage() {
  const [step, setStep] = useState<'organization' | 'user'>('organization');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<number | ''>('');
  const [selectedUser, setSelectedUser] = useState<number | ''>('');
  const [password, setPassword] = useState('');
  const [newOrgName, setNewOrgName] = useState('');
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    try {
      const orgs = await apiClient.getOrganizations();
      setOrganizations(orgs);
    } catch {
      setError('Error al cargar organizaciones');
    }
  };

  const handleOrgSelect = async (orgId: number) => {
    setSelectedOrg(orgId);
    setError('');
    setLoading(true);
    
    try {
      const orgUsers = await apiClient.getUsersByOrganization(orgId);
      setUsers(orgUsers);
      setStep('user');
    } catch {
      setError('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) {
      setError('El nombre de la organización es requerido');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await apiClient.createOrganization(newOrgName);
      
      // Si la respuesta incluye userId, significa que se creó el usuario y se inició sesión automáticamente
      if (response.userId) {
        // Redirigir directamente a la aplicación
        window.location.href = '/';
      } else {
        // Flujo anterior: solo se creó la organización
        setOrganizations([...organizations, response]);
        setNewOrgName('');
        setShowCreateOrg(false);
        handleOrgSelect(response.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear organización');
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!selectedUser) {
      setError('Selecciona un usuario');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await apiClient.login({
        organizationId: selectedOrg as number,
        userId: selectedUser as number,
        password: password || undefined,
      });

      // Redirigir a la aplicación
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
      // Mantener la selección de empresa y usuario para que el usuario pueda reintentar
      // No cambiamos de paso ni limpiamos selectedUser o selectedOrg
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Card sx={{ width: '100%', maxWidth: 500 }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h4" component="h1" gutterBottom textAlign="center">
              Gestión de Obras
            </Typography>

            <Divider sx={{ my: 3 }} />

            {error && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            {step === 'organization' && (
              <Stack spacing={3}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <BusinessIcon color="primary" />
                  <Typography variant="h6">Seleccionar Empresa</Typography>
                </Box>

                {!showCreateOrg ? (
                  <>
                    <FormControl fullWidth>
                      <InputLabel>Empresa</InputLabel>
                      <Select
                        value={selectedOrg}
                        label="Empresa"
                        onChange={(e) => {
                          const orgId = e.target.value as number;
                          handleOrgSelect(orgId);
                        }}
                        disabled={loading}
                      >
                        {organizations.map((org) => (
                          <MenuItem key={org.id} value={org.id}>
                            {org.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <Button
                      fullWidth
                      variant="outlined"
                      onClick={() => setShowCreateOrg(true)}
                      disabled={loading}
                    >
                      Crear Nueva Empresa
                    </Button>
                  </>
                ) : (
                  <>
                    <TextField
                      fullWidth
                      label="Nombre de la Empresa"
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                      disabled={loading}
                      autoFocus
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateOrg();
                        }
                      }}
                    />

                    <Stack direction="row" spacing={2}>
                      <Button
                        fullWidth
                        variant="outlined"
                        onClick={() => {
                          setShowCreateOrg(false);
                          setNewOrgName('');
                          setError('');
                        }}
                        disabled={loading}
                      >
                        Cancelar
                      </Button>
                      <Button
                        fullWidth
                        variant="contained"
                        onClick={handleCreateOrg}
                        disabled={loading || !newOrgName.trim()}
                      >
                        {loading ? <CircularProgress size={24} /> : 'Crear'}
                      </Button>
                    </Stack>
                  </>
                )}
              </Stack>
            )}

            {step === 'user' && (
              <Stack spacing={3}>
                <Button
                  size="small"
                  onClick={() => {
                    setStep('organization');
                    setSelectedUser('');
                    setPassword('');
                    setError('');
                  }}
                  disabled={loading}
                >
                  ← Cambiar Empresa
                </Button>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PersonIcon color="primary" />
                  <Typography variant="h6">Iniciar Sesión</Typography>
                </Box>

                <Typography variant="body2" color="text.secondary">
                  Empresa: <strong>{organizations.find(o => o.id === selectedOrg)?.name}</strong>
                </Typography>

                <FormControl fullWidth>
                  <InputLabel>Usuario</InputLabel>
                  <Select
                    value={selectedUser}
                    label="Usuario"
                    onChange={(e) => setSelectedUser(e.target.value as number)}
                    disabled={loading}
                  >
                    {users.map((user) => (
                      <MenuItem key={user.id} value={user.id}>
                        {user.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  fullWidth
                  type="password"
                  label="Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  helperText="Deja vacío si aún no tienes contraseña"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleLogin();
                    }
                  }}
                />

                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  onClick={handleLogin}
                  disabled={loading || !selectedUser}
                >
                  {loading ? <CircularProgress size={24} /> : 'Iniciar Sesión'}
                </Button>
              </Stack>
            )}
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
}
