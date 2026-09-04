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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import { apiClient, type Project, type Stage } from '../services/apiClient';
import { formatLocalDate } from '../utils/dateUtils';
import CreateStageModal from './CreateStageModal';
import EditProjectModal from './EditProjectModal';
import StageCard from './StageCard';
import DeadlineChip from './DeadlineChip';
import { clearProjectReturnSnapshot } from '../utils/projectReturnSnapshot';
import { useAssistantRefetch } from './assistant/AssistantDataBus';
import { useScrollRestoration } from '../utils/useScrollRestoration';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateStageModal, setShowCreateStageModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteStageDialog, setShowDeleteStageDialog] = useState(false);
  const [stageToDelete, setStageToDelete] = useState<Stage | null>(null);
  const [deletingStage, setDeletingStage] = useState(false);
  const [stageLifecycleLoading, setStageLifecycleLoading] = useState(false);
  
  // Restore the scroll position when returning to this project (history POP).
  useScrollRestoration(`project:${id}`, !loading);

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
  
  // A chat-driven mutation on this project or its stages refreshes it in place.
  useAssistantRefetch(['stages', `project:${id}`], fetchProjectDetail);

  // Función para volver atrás
  const handleBack = () => {
    navigate(-1);
  };

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

  const handleReopenProject = async () => {
    if (!id || !project) return;
    
    try {
      await apiClient.updateProject(Number(id), { status: 'active' });
      await fetchProjectDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al reabrir proyecto';
      setError(message);
    }
  };

  const handlePauseProject = async () => {
    if (!id || !project) return;
    
    try {
      await apiClient.updateProject(Number(id), { status: 'paused' });
      await fetchProjectDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al paralizar proyecto';
      setError(message);
    }
  };

  const handleResumeProject = async () => {
    if (!id || !project) return;
    
    try {
      await apiClient.updateProject(Number(id), { status: 'active' });
      await fetchProjectDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al reactivar proyecto';
      setError(message);
    }
  };

  const handleDeleteProject = async () => {
    if (!id) return;
    
    setDeleting(true);
    try {
      await apiClient.deleteProject(Number(id));
      clearProjectReturnSnapshot(Number(id));
      navigate('/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al eliminar proyecto';
      setError(message);
      setShowDeleteDialog(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleStageCreated = () => {
    setShowCreateStageModal(false);
    fetchProjectDetail();
  };

  const handleStageUpdated = () => {
    fetchProjectDetail();
  };

  const handleDeleteStageClick = (stage: Stage) => {
    setStageToDelete(stage);
    setShowDeleteStageDialog(true);
  };

  const handleDeleteStage = async () => {
    if (!stageToDelete) return;
    
    setDeletingStage(true);
    try {
      await apiClient.deleteStage(stageToDelete.id);
      setShowDeleteStageDialog(false);
      setStageToDelete(null);
      await fetchProjectDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al eliminar etapa';
      setError(message);
    } finally {
      setDeletingStage(false);
    }
  };

  const handleMoveStage = async (stageId: number, direction: 'up' | 'down') => {
    const currentIndex = stages.findIndex(s => s.id === stageId);
    if (currentIndex === -1) return;
    
    if (direction === 'up' && currentIndex === 0) return;
    if (direction === 'down' && currentIndex === stages.length - 1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const newStages = [...stages];
    [newStages[currentIndex], newStages[newIndex]] = [newStages[newIndex], newStages[currentIndex]];
    
    // Actualizar el order_number de cada etapa según su nueva posición
    const updatedStages = newStages.map((stage, index) => ({
      ...stage,
      order_number: index + 1
    }));
    
    // Actualizar orden local inmediatamente para UX
    setStages(updatedStages);

    try {
      // Enviar nuevo orden al backend
      const stageOrders = updatedStages.map((stage) => ({
        id: stage.id,
        order_number: stage.order_number
      }));
      
      await apiClient.reorderStages(stageOrders);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al reordenar etapas';
      setError(message);
      // Revertir en caso de error
      fetchProjectDetail();
    }
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
        <Button onClick={handleBack} sx={{ mt: 2 }}>
          Volver
        </Button>
      </Container>
    );
  }

  const completedStages = stages.filter(s => s.is_completed).length;
  const totalStages = stages.length;
  const progress = totalStages > 0 ? (completedStages / totalStages) * 100 : 0;

  return (
    <Container maxWidth="lg" sx={{ py: 4, px: { xs: 2, sm: 3 } }}>
      <Stack spacing={2} sx={{ mb: 3 }}>
        {/* Header con título y botón volver */}
        <Stack direction="row" alignItems="center" spacing={2}>
          <IconButton onClick={handleBack}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }} noWrap>
            {project.name}
          </Typography>
        </Stack>

        {/* Botones de acción - responsive */}
        <Stack 
          direction={{ xs: 'column', sm: 'row' }} 
          spacing={1}
          sx={{ 
            '& > button': { 
              minWidth: { xs: '100%', sm: 'auto' } 
            }
          }}
        >
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => setShowEditModal(true)}
            
          >
            Editar
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => setShowDeleteDialog(true)}
            
          >
            Eliminar
          </Button>
          {project.status === 'completed' ? (
            <>
              <Button
                variant="outlined"
                onClick={handleReopenProject}
                
              >
                Reabrir Proyecto
              </Button>
              <Chip 
                label="Completado" 
                color="success" 
                icon={<CheckCircleIcon />}
                sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}
              />
            </>
          ) : project.status === 'paused' ? (
            <>
              <Button
                variant="outlined"
                color="success"
                startIcon={<PlayCircleIcon />}
                onClick={handleResumeProject}
                
              >
                Reactivar Proyecto
              </Button>
              <Chip 
                label="Paralizado" 
                color="warning" 
                icon={<PauseCircleIcon />}
                sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}
              />
            </>
          ) : (
            <>
              <Button
                variant="outlined"
                color="warning"
                startIcon={<PauseCircleIcon />}
                onClick={handlePauseProject}
                
              >
                Paralizar Proyecto
              </Button>
              <Button
                variant="outlined"
                color="success"
                startIcon={<CheckCircleIcon />}
                onClick={handleCompleteProject}
                
              >
                Completar Proyecto
              </Button>
            </>
          )}
        </Stack>
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

            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
              {project.contact && (
                <Box>
                  <Typography variant="body2" color="text.secondary" component="span">
                    Contacto:{' '}
                  </Typography>
                  <Typography variant="body2" fontWeight="medium" component="span">
                    {project.contact}
                  </Typography>
                </Box>
              )}
              {project.responsible_name && (
                <Box>
                  <Typography variant="body2" color="text.secondary" component="span">
                    Responsable:{' '}
                  </Typography>
                  <Typography variant="body2" fontWeight="medium" component="span">
                    {project.responsible_name}
                  </Typography>
                </Box>
              )}
              <Typography variant="caption" color="text.secondary">
                Creado: {formatLocalDate(project.created_at)}
              </Typography>
              {project.updated_at && (
                <Typography variant="caption" color="text.secondary">
                  Actualizado: {formatLocalDate(project.updated_at)}
                </Typography>
              )}
              {project.deadline && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    Fecha límite:
                  </Typography>
                  <DeadlineChip
                    date={project.deadline}
                    isCompleted={project.status === 'completed'}
                    size="small"
                    showIcon={true}
                  />
                </Box>
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
            // Una etapa está "en curso" si ha iniciado y no está completada
            const isCurrentStage = !stage.is_completed && !!stage.start_date;
            
            return (
              <Box key={stage.id} sx={{ position: 'relative' }}>
                <Stack direction="row" spacing={1} alignItems="stretch">
                  {/* Botones de reorden y eliminar */}
                  <Stack spacing={0.5}>
                    <IconButton
                      size="small"
                      onClick={() => handleMoveStage(stage.id, 'up')}
                      disabled={index === 0}
                      sx={{ 
                        bgcolor: 'background.paper',
                        border: 1,
                        borderColor: 'divider',
                        '&:hover': { bgcolor: 'action.hover' }
                      }}
                    >
                      <ArrowUpwardIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteStageClick(stage)}
                      sx={{ 
                        bgcolor: 'background.paper',
                        border: 1,
                        borderColor: 'divider',
                        color: 'error.main',
                        '&:hover': { 
                          bgcolor: 'error.light',
                          borderColor: 'error.main'
                        }
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleMoveStage(stage.id, 'down')}
                      disabled={index === stages.length - 1}
                      sx={{ 
                        bgcolor: 'background.paper',
                        border: 1,
                        borderColor: 'divider',
                        '&:hover': { bgcolor: 'action.hover' }
                      }}
                    >
                      <ArrowDownwardIcon fontSize="small" />
                    </IconButton>
                  </Stack>

                  {/* StageCard */}
                  <Box sx={{ flex: 1 }}>
                    <StageCard
                      stage={stage}
                      isCurrentStage={isCurrentStage}
                      onCompleted={handleStageUpdated}
                      siblingLifecycleLoading={stageLifecycleLoading}
                      onLifecycleLoadingChange={setStageLifecycleLoading}
                    />
                  </Box>
                </Stack>
              </Box>
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

      <EditProjectModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSuccess={fetchProjectDetail}
        projectId={Number(id)}
        initialData={{
          name: project.name,
          description: project.description,
          contact: project.contact,
          client_id: project.client_id,
          responsible_id: project.responsible_id,
          deadline: project.deadline,
        }}
      />

      <Dialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
      >
        <DialogTitle>¿Eliminar proyecto?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Esta acción eliminará permanentemente el proyecto "{project.name}" y todas sus etapas asociadas.
            Esta acción no se puede deshacer.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteDialog(false)} disabled={deleting}>
            Cancelar
          </Button>
          <Button onClick={handleDeleteProject} color="error" variant="contained" disabled={deleting}>
            {deleting ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={showDeleteStageDialog}
        onClose={() => !deletingStage && setShowDeleteStageDialog(false)}
      >
        <DialogTitle>¿Eliminar etapa?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Esta acción eliminará permanentemente la etapa "{stageToDelete?.name}".
            Esta acción no se puede deshacer.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteStageDialog(false)} disabled={deletingStage}>
            Cancelar
          </Button>
          <Button onClick={handleDeleteStage} color="error" variant="contained" disabled={deletingStage}>
            {deletingStage ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
