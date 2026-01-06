import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
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
} from '@mui/material';
import { LockReset, ArrowBack } from '@mui/icons-material';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (!tokenParam) {
      setError('Token de recuperación no válido');
    } else {
      setToken(tokenParam);
    }
  }, [searchParams]);

  const handleSubmit = async () => {
    if (!password || !confirmPassword) {
      setError('Todos los campos son requeridos');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al resetear contraseña');
      }

      setSuccess(true);

      // Redirigir al login después de 3 segundos
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al resetear contraseña');
    } finally {
      setLoading(false);
    }
  };

  if (!token && !error) {
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
          <CircularProgress />
        </Box>
      </Container>
    );
  }

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
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <LockReset sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
              <Typography variant="h4" gutterBottom>
                Nueva contraseña
              </Typography>
              <Typography color="text.secondary">
                Ingresa tu nueva contraseña
              </Typography>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            {success ? (
              <>
                <Alert severity="success" sx={{ mb: 2 }}>
                  Contraseña actualizada exitosamente. Ahora puedes iniciar sesión.
                </Alert>
                <Typography color="text.secondary" sx={{ textAlign: 'center' }}>
                  Serás redirigido al inicio de sesión...
                </Typography>
              </>
            ) : (
              <Stack spacing={2}>
                <TextField
                  fullWidth
                  type="password"
                  label="Nueva contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading || !token}
                  helperText="Mínimo 6 caracteres"
                  autoFocus
                />

                <TextField
                  fullWidth
                  type="password"
                  label="Repetir contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading || !token}
                  error={confirmPassword !== '' && password !== confirmPassword}
                  helperText={
                    confirmPassword !== '' && password !== confirmPassword
                      ? 'Las contraseñas no coinciden'
                      : ''
                  }
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSubmit();
                    }
                  }}
                />

                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  onClick={handleSubmit}
                  disabled={loading || !token}
                >
                  {loading ? <CircularProgress size={24} /> : 'Actualizar contraseña'}
                </Button>

                <Button
                  fullWidth
                  variant="text"
                  onClick={() => navigate('/login')}
                  startIcon={<ArrowBack />}
                  disabled={loading}
                >
                  Volver al inicio de sesión
                </Button>
              </Stack>
            )}
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
}
