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
import PersonIcon from '@mui/icons-material/Person';
import { apiClient, type User, type Stage } from '../services/apiClient';
import StageInProgressCard from './StageInProgressCard';

interface UserWithStages extends User {
  inProgressStages: Stage[];
  pendingStages: Stage[];
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
      
      // Para cada usuario, obtener sus etapas (en progreso y pendientes)
      const usersWithStagesData = await Promise.all(
        users.map(async (user) => {
          const stages = await apiClient.getStages({
            responsible_id: user.id,
            is_completed: false,
          });
          return {
            ...user,
            inProgressStages: stages.filter(s => s.start_date && !s.is_completed),
            pendingStages: stages.filter(s => !s.start_date && !s.is_completed),
          };
        })
      );

      // Filtrar solo usuarios con etapas (en progreso o pendientes)
      setUsersWithStages(usersWithStagesData.filter(u => 
        u.inProgressStages.length > 0 || u.pendingStages.length > 0
      ));
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
        Usuarios con etapas asignadas (en progreso y pendientes)
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {usersWithStages.length === 0 ? (
        <Alert severity="info">
          No hay usuarios con etapas asignadas actualmente.
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
                  <Stack direction="row" spacing={1}>
                    {user.inProgressStages.length > 0 && (
                      <Chip
                        label={`${user.inProgressStages.length} en proceso`}
                        color="primary"
                        size="small"
                      />
                    )}
                    {user.pendingStages.length > 0 && (
                      <Chip
                        label={`${user.pendingStages.length} pendiente${user.pendingStages.length > 1 ? 's' : ''}`}
                        color="default"
                        size="small"
                      />
                    )}
                  </Stack>
                </Stack>

                <Divider sx={{ my: 2 }} />

                {/* Etapas en proceso */}
                {user.inProgressStages.length > 0 && (
                  <>
                    <Typography variant="subtitle2" gutterBottom>
                      En Proceso:
                    </Typography>

                    <Stack spacing={1.5} sx={{ mt: 2 }}>
                      {user.inProgressStages.map((stage) => (
                        <StageInProgressCard
                          key={stage.id}
                          stage={stage}
                          showProjectName={true}
                          showStageNumber={true}
                        />
                      ))}
                    </Stack>
                  </>
                )}

                {/* Etapas pendientes */}
                {user.pendingStages.length > 0 && (
                  <>
                    <Typography variant="subtitle2" gutterBottom sx={{ mt: user.inProgressStages.length > 0 ? 2 : 0 }}>
                      Pendientes de Iniciar:
                    </Typography>

                    <Stack spacing={1.5} sx={{ mt: 2 }}>
                      {user.pendingStages.map((stage) => (
                        <StageInProgressCard
                          key={stage.id}
                          stage={stage}
                          showProjectName={true}
                          showStageNumber={true}
                          variant="pending"
                        />
                      ))}
                    </Stack>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
    </Container>
  );
}
