import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Stack,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Tab,
  Tabs,
} from '@mui/material';
import { 
  Business as BusinessIcon, 
  Login as LoginIcon,
  PersonAdd as PersonAddIcon,
  Add as AddIcon,
} from '@mui/icons-material';

interface LoginResponse {
  accountId: number;
  email: string;
  name: string;
  organizations: Array<{
    id: number;
    name: string;
    role: string;
  }>;
  requiresOrganizationSelection: boolean;
  autoSelectOrganization: number | null;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [step, setStep] = useState<'auth' | 'selectOrg' | 'createOrg'>('auth');
  
  // Paso 1: Autenticación
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  
  // Paso 2: Selección de organización
  const [loginResponse, setLoginResponse] = useState<LoginResponse | null>(null);
  const [newOrgName, setNewOrgName] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Email y contraseña son requeridos');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        // Si el email no está verificado, mostrar botón para reenviar
        if (data.requiresEmailVerification) {
          throw new Error(data.error + ' Revisa tu bandeja de entrada.');
        }
        throw new Error(data.error || 'Error al iniciar sesión');
      }

      setLoginResponse(data);

      // Si solo tiene una organización, seleccionarla automáticamente
      if (data.autoSelectOrganization) {
        await handleSelectOrganization(data.accountId, data.autoSelectOrganization);
      } else if (data.organizations.length === 0) {
        // Si no tiene organizaciones, ir a crear una
        setStep('createOrg');
      } else {
        // Mostrar selector de organizaciones
        setStep('selectOrg');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!email || !password || !confirmPassword || !name) {
      setError('Todos los campos son requeridos');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al registrarse');
      }

      // Si requiere verificación, mostrar mensaje
      if (data.requiresEmailVerification) {
        setError(''); // Limpiar error
        alert('Cuenta creada exitosamente. Por favor verifica tu email antes de iniciar sesión.');
        setMode('login'); // Cambiar a modo login
        return;
      }

      // Si no requiere verificación (caso raro), iniciar sesión automáticamente
      await handleLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrarse');
      setLoading(false);
    }
  };

  const handleSelectOrganization = async (accountId: number, organizationId: number) => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/select-organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, organizationId }),
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al seleccionar organización');
      }

      // Redirigir a la aplicación
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al seleccionar organización');
      setLoading(false);
    }
  };

  const handleCreateOrganization = async () => {
    if (!newOrgName.trim()) {
      setError('El nombre de la organización es requerido');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newOrgName }),
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al crear organización');
      }

      // Seleccionar automáticamente la nueva organización
      if (loginResponse) {
        await handleSelectOrganization(loginResponse.accountId, data.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear organización');
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
              MASGestión
            </Typography>

            <Divider sx={{ my: 3 }} />

            {error && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            {/* PASO 1: Login o Registro */}
            {step === 'auth' && (
              <>
                <Tabs 
                  value={mode} 
                  onChange={(_, newValue) => {
                    setMode(newValue);
                    setError('');
                  }}
                  centered
                  sx={{ mb: 3 }}
                >
                  <Tab icon={<LoginIcon />} label="Iniciar Sesión" value="login" />
                  <Tab icon={<PersonAddIcon />} label="Registrarse" value="register" />
                </Tabs>

                <Stack spacing={3}>
                  {mode === 'register' && (
                    <TextField
                      fullWidth
                      label="Nombre completo"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={loading}
                      autoFocus
                    />
                  )}

                  <TextField
                    fullWidth
                    type="email"
                    label="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    autoFocus={mode === 'login'}
                  />

                  <TextField
                    fullWidth
                    type="password"
                    label="Contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    helperText={mode === 'register' ? 'Mínimo 6 caracteres' : ''}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && mode === 'login') {
                        handleLogin();
                      }
                    }}
                  />

                  {mode === 'register' && (
                    <TextField
                      fullWidth
                      type="password"
                      label="Repetir contraseña"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={loading}
                      error={confirmPassword !== '' && password !== confirmPassword}
                      helperText={
                        confirmPassword !== '' && password !== confirmPassword
                          ? 'Las contraseñas no coinciden'
                          : ''
                      }
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleRegister();
                        }
                      }}
                    />
                  )}

                  <Button
                    fullWidth
                    variant="contained"
                    size="large"
                    onClick={mode === 'login' ? handleLogin : handleRegister}
                    disabled={loading}
                  >
                    {loading ? (
                      <CircularProgress size={24} />
                    ) : mode === 'login' ? (
                      'Iniciar Sesión'
                    ) : (
                      'Registrarse'
                    )}
                  </Button>

                  {mode === 'login' && (
                    <Button
                      fullWidth
                      variant="text"
                      size="small"
                      onClick={() => navigate('/forgot-password')}
                      disabled={loading}
                    >
                      ¿Olvidaste tu contraseña?
                    </Button>
                  )}
                </Stack>
              </>
            )}

            {/* PASO 2: Seleccionar Organización */}
            {step === 'selectOrg' && loginResponse && (
              <Stack spacing={3}>
                <Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Bienvenido/a
                  </Typography>
                  <Typography variant="h6">{loginResponse.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {loginResponse.email}
                  </Typography>
                </Box>

                <Divider />

                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <BusinessIcon color="primary" />
                    <Typography variant="h6">Selecciona una organización</Typography>
                  </Box>

                  <List sx={{ bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                    {loginResponse.organizations.map((org) => (
                      <ListItem key={org.id} disablePadding>
                        <ListItemButton
                          onClick={() => handleSelectOrganization(loginResponse.accountId, org.id)}
                          disabled={loading}
                        >
                          <ListItemText
                            primary={org.name}
                            secondary={org.role}
                          />
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                </Box>

                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={() => setStep('createOrg')}
                  disabled={loading}
                >
                  Crear Nueva Organización
                </Button>
              </Stack>
            )}

            {/* PASO 3: Crear Organización */}
            {step === 'createOrg' && loginResponse && (
              <Stack spacing={3}>
                <Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Conectado como
                  </Typography>
                  <Typography variant="h6">{loginResponse.name}</Typography>
                </Box>

                <Divider />

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <BusinessIcon color="primary" />
                  <Typography variant="h6">Crear Nueva Organización</Typography>
                </Box>

                <TextField
                  fullWidth
                  label="Nombre de la organización"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  disabled={loading}
                  autoFocus
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateOrganization();
                    }
                  }}
                />

                <Stack direction="row" spacing={2}>
                  {loginResponse.organizations.length > 0 && (
                    <Button
                      fullWidth
                      variant="outlined"
                      onClick={() => setStep('selectOrg')}
                      disabled={loading}
                    >
                      Cancelar
                    </Button>
                  )}
                  <Button
                    fullWidth
                    variant="contained"
                    onClick={handleCreateOrganization}
                    disabled={loading || !newOrgName.trim()}
                  >
                    {loading ? <CircularProgress size={24} /> : 'Crear Organización'}
                  </Button>
                </Stack>
              </Stack>
            )}
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
}
