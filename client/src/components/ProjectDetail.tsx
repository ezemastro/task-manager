import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Stack,
  Button,
  Chip,
  LinearProgress,
  Divider,
  IconButton,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { apiClient, type Project, type Stage } from '../services/apiClient';
import CreateStageModal from './CreateStageModal';
import StageCard from './StageCard';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateStageModal, setShowCreateStageModal] = useState(false);

  const fetchProjectDetail = useCallback(async () => {
    if (!id) return;
    
    setLoading(true);
    setError('');
    try {
      const projectData = await apiClient.getProject(Number(id));
      setProject(projectData);
      setStages(projectData.stages || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar proyecto';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProjectDetail();
  }, [fetchProjectDetail]);

  const handleCompleteProject = async () => {
    if (!id || !project) return;
    
    try {
      await apiClient.updateProject(Number(id), { status: 'completed' });
      await fetchProjectDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al completar proyecto';
      setError(message);
    }
  };

  const handleStageCreated = () => {
    setShowCreateStageModal(false);
    fetchProjectDetail();
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 8, textAlign: 'center' }}>
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Cargando proyecto...
        </Typography>
      </Container>
    );
  }

  if (!project) {
    return (
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Alert severity="error">Proyecto no encontrado</Alert>
        <Button onClick={() => navigate(-1)} sx={{ mt: 2 }}>
          Volver
        </Button>
      </Container>
    );
  }

  const completedStages = stages.filter(s => s.is_completed).length;
  const totalStages = stages.length;
  const progress = totalStages > 0 ? (completedStages / totalStages) * 100 : 0;
  const allStagesCompleted = totalStages > 0 && completedStages === totalStages;
  const canCreateNewStage = allStagesCompleted || totalStages === 0;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
        <IconButton onClick={() => navigate(-1)}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" component="h1" sx={{ flexGrow: 1 }}>
          {project.name}
        </Typography>
        {project.status === 'completed' ? (
          <Chip label="Completado" color="success" icon={<CheckCircleIcon />} />
        ) : (
          <Button
            variant="outlined"
            color="success"
            startIcon={<CheckCircleIcon />}
            onClick={handleCompleteProject}
            disabled={!allStagesCompleted}
          >
            Marcar Proyecto como Completado
          </Button>
        )}
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="body1" color="text.secondary" paragraph>
            {project.description || 'Sin descripción'}
          </Typography>

          <Divider sx={{ my: 2 }} />

          <Stack spacing={2}>
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2">
                  Progreso: {completedStages} / {totalStages} etapas completadas
                </Typography>
                <Typography variant="subtitle2" color="primary">
                  {progress.toFixed(0)}%
                </Typography>
              </Stack>
              <LinearProgress variant="determinate" value={progress} sx={{ height: 8, borderRadius: 1 }} />
            </Box>

            <Stack direction="row" spacing={2}>
              <Typography variant="caption" color="text.secondary">
                Creado: {new Date(project.created_at).toLocaleDateString()}
              </Typography>
              {project.updated_at && (
                <Typography variant="caption" color="text.secondary">
                  Actualizado: {new Date(project.updated_at).toLocaleDateString()}
                </Typography>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5">Etapas</Typography>
        <Button
          variant="contained"
          onClick={() => setShowCreateStageModal(true)}
          disabled={!canCreateNewStage || project.status === 'completed'}
        >
          + Nueva Etapa
        </Button>
      </Stack>

      {stages.length === 0 ? (
        <Alert severity="info">
          No hay etapas creadas. Haz clic en "Nueva Etapa" para comenzar.
        </Alert>
      ) : (
        <Stack spacing={2}>
          {stages.map((stage, index) => {
            const isCurrentStage = !stage.is_completed && (index === 0 || stages[index - 1]?.is_completed);
            
            return (
              <StageCard
                key={stage.id}
                stage={stage}
                isCurrentStage={isCurrentStage}
                onCompleted={fetchProjectDetail}
              />
            );
          })}
        </Stack>
      )}

      <CreateStageModal
        open={showCreateStageModal}
        onClose={() => setShowCreateStageModal(false)}
        onSuccess={handleStageCreated}
        projectId={Number(id)}
      />
    </Container>
  );
}
