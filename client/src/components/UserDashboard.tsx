import { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Stack,
  Chip,
  Divider,
  Avatar,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import PersonIcon from '@mui/icons-material/Person';
import AssignmentIcon from '@mui/icons-material/Assignment';
import { apiClient, type User, type Stage } from '../services/apiClient';

interface UserWithStages extends User {
  inProgressStages: Stage[];
}

export default function UserDashboard() {
  const [usersWithStages, setUsersWithStages] = useState<UserWithStages[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchUsersWithStages();
  }, []);

  const fetchUsersWithStages = async () => {
    setLoading(true);
    setError('');
    try {
      // Obtener todos los usuarios
      const users = await apiClient.getUsers();
      
      // Para cada usuario, obtener sus etapas en progreso
      const usersWithStagesData = await Promise.all(
        users.map(async (user) => {
          const stages = await apiClient.getStages({
            responsible_id: user.id,
            is_completed: false,
          });
          return {
            ...user,
            inProgressStages: stages.filter(s => !s.is_completed),
          };
        })
      );

      // Filtrar solo usuarios con etapas en progreso
      setUsersWithStages(usersWithStagesData.filter(u => u.inProgressStages.length > 0));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar datos';
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
          Cargando usuarios y etapas...
        </Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Panel de Usuarios
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Usuarios con etapas activas asignadas
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {usersWithStages.length === 0 ? (
        <Alert severity="info">
          No hay usuarios con etapas en progreso actualmente.
        </Alert>
      ) : (
        <Stack spacing={3}>
          {usersWithStages.map((user) => (
            <Card key={user.id} elevation={2}>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                  <Avatar sx={{ bgcolor: 'primary.main' }}>
                    <PersonIcon />
                  </Avatar>
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" component="div">
                      {user.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {user.email}
                      {user.role && ` • ${user.role}`}
                    </Typography>
                  </Box>
                  <Chip
                    label={`${user.inProgressStages.length} ${user.inProgressStages.length === 1 ? 'etapa' : 'etapas'}`}
                    color="primary"
                    icon={<AssignmentIcon />}
                  />
                </Stack>

                <Divider sx={{ my: 2 }} />

                <Typography variant="subtitle2" gutterBottom>
                  Etapas Asignadas:
                </Typography>

                <Stack spacing={1.5} sx={{ mt: 2 }}>
                  {user.inProgressStages.map((stage) => (
                    <Card
                      key={stage.id}
                      variant="outlined"
                      component={RouterLink}
                      to={`/stages/${stage.id}`}
                      sx={{
                        textDecoration: 'none',
                        transition: 'all 0.2s',
                        '&:hover': {
                          boxShadow: 2,
                          transform: 'translateY(-2px)',
                        },
                      }}
                    >
                      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Box>
                            <Typography variant="subtitle2" component="div">
                              {stage.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {stage.project_name && `Proyecto: ${stage.project_name}`}
                              {stage.order_number && ` • Etapa ${stage.order_number}`}
                            </Typography>
                          </Box>
                          <Chip
                            size="small"
                            label={stage.is_completed ? 'Completada' : 'En Proceso'}
                            color={stage.is_completed ? 'success' : 'primary'}
                          />
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
    </Container>
  );
}
