import { type ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { apiClient } from '../services/apiClient';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        await apiClient.getMe();
        setIsAuthenticated(true);
      } catch {
        setIsAuthenticated(false);
        navigate('/login', { replace: true });
      }
    };

    checkAuth();
  }, [navigate]);

  if (isAuthenticated === null) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return isAuthenticated ? <>{children}</> : null;
}
