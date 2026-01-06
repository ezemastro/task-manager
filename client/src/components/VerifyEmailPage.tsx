import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  Button,
} from '@mui/material';
import { CheckCircle, Error as ErrorIcon } from '@mui/icons-material';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setStatus('error');
      setMessage('Token de verificación no válido');
      return;
    }

    verifyEmail(token);
  }, [searchParams]);

  const verifyEmail = async (token: string) => {
    try {
      const response = await fetch(`/api/auth/verify-email?token=${token}`, {
        method: 'GET',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al verificar email');
      }

      setStatus('success');
      setMessage('Email verificado exitosamente. Ahora puedes iniciar sesión.');
      
      // Redirigir al login después de 3 segundos
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Error al verificar email');
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
            <Box sx={{ textAlign: 'center' }}>
              {status === 'loading' && (
                <>
                  <CircularProgress size={60} sx={{ mb: 3 }} />
                  <Typography variant="h5" gutterBottom>
                    Verificando email...
                  </Typography>
                  <Typography color="text.secondary">
                    Por favor espera mientras verificamos tu email
                  </Typography>
                </>
              )}

              {status === 'success' && (
                <>
                  <CheckCircle sx={{ fontSize: 60, color: 'success.main', mb: 3 }} />
                  <Typography variant="h5" gutterBottom color="success.main">
                    ¡Email verificado!
                  </Typography>
                  <Alert severity="success" sx={{ mt: 2 }}>
                    {message}
                  </Alert>
                  <Typography color="text.secondary" sx={{ mt: 2 }}>
                    Serás redirigido al inicio de sesión...
                  </Typography>
                </>
              )}

              {status === 'error' && (
                <>
                  <ErrorIcon sx={{ fontSize: 60, color: 'error.main', mb: 3 }} />
                  <Typography variant="h5" gutterBottom color="error.main">
                    Error al verificar
                  </Typography>
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {message}
                  </Alert>
                  <Button
                    variant="contained"
                    onClick={() => navigate('/login')}
                    sx={{ mt: 3 }}
                  >
                    Ir al inicio de sesión
                  </Button>
                </>
              )}
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
}
