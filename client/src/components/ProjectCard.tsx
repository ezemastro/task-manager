import { Link as RouterLink } from 'react-router-dom';
import {
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  LinearProgress,
  Stack,
  IconButton,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import BusinessIcon from '@mui/icons-material/Business';
import EventIcon from '@mui/icons-material/Event';
import type { Stage } from '../services/apiClient';

interface ProjectCardProps {
  projectId: number;
  projectName: string;
  projectDescription?: string;
  clientName?: string;
  deadline?: string;
  stages: Stage[];
  onStageCompleted?: () => void;
}

export default function ProjectCard({
  projectId,
  projectName,
  projectDescription,
  clientName,
  deadline,
  stages,
}: ProjectCardProps) {
  const completedStages = stages.filter(stage => stage.is_completed).length;
  const totalStages = stages.length;
  const progress = totalStages > 0 ? (completedStages / totalStages) * 100 : 0;
  
  // Obtener TODAS las etapas en proceso (con start_date y no completadas)
  const stagesInProgress = stages.filter(stage => stage.start_date && !stage.is_completed);
  
  // Calcular si está atrasado
  const isOverdue = deadline && new Date(deadline) < new Date();

  return (
    <Card 
      elevation={2} 
      sx={{ 
        mb: 2,
        position: 'relative',
      }}
    >
      <CardContent sx={{ pb: 2, '&:last-child': { pb: 2 } }}>
        {/* Header compacto */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
          <Box sx={{ flexGrow: 1, pr: 1 }}>
            <Typography variant="h4" component="h2" sx={{ mb: 0.5, lineHeight: 1.3 }}>
              {projectName}
            </Typography>
            
            {projectDescription && (
              <Typography 
                variant="body2" 
                color="text.secondary" 
                sx={{ 
                  mb: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  lineHeight: 1.4,
                }}
              >
                {projectDescription}
              </Typography>
            )}

            {/* Cliente y Fecha límite */}
            <Stack direction="row" spacing={2} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
              {clientName && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <BusinessIcon fontSize="small" color="action" />
                  <Typography variant="caption" color="text.secondary">
                    {clientName}
                  </Typography>
                </Box>
              )}
              {deadline && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <EventIcon fontSize="small" color={isOverdue ? 'error' : 'action'} />
                  <Typography variant="caption" color={isOverdue ? 'error' : 'text.secondary'}>
                    {new Date(deadline).toLocaleDateString('es-ES')}
                  </Typography>
                </Box>
              )}
            </Stack>
          </Box>
          
          <IconButton
            component={RouterLink}
            to={`/projects/${projectId}`}
            color="primary"
            size="small"
            aria-label="Ver detalles del proyecto"
          >
            <OpenInNewIcon />
          </IconButton>
        </Stack>

        {/* Barra de progreso compacta */}
        <Box sx={{ mb: 1.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Progreso: {completedStages}/{totalStages} etapas
            </Typography>
            <Typography variant="caption" fontWeight="bold" color="text.secondary">
              {Math.round(progress)}%
            </Typography>
          </Stack>
          <LinearProgress 
            variant="determinate" 
            value={progress} 
            sx={{ height: 6, borderRadius: 3 }}
          />
        </Box>

        {/* Etapas en proceso */}
        {stagesInProgress.length > 0 ? (
          <Box>
            {stagesInProgress.map((stage, index) => {
              return (
                <Box 
                  key={stage.id} 
                  sx={{ 
                    bgcolor: 'action.hover', 
                    p: 1.5, 
                    borderRadius: 1, 
                    mt: index === 0 ? 1 : 1.5 
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight="bold">
                      EN PROCESO - ETAPA {stage.order_number}
                    </Typography>
                    <IconButton
                      component={RouterLink}
                      to={`/stages/${stage.id}`}
                      color="primary"
                      size="small"
                      sx={{ padding: 0.5 }}
                      aria-label="Ver detalles de la etapa"
                    >
                      <OpenInNewIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                  <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 0.5 }}>
                    {stage.name}
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 0.5 }}>
                    <Chip 
                      label={stage.responsible_name || 'Sin responsable'}
                      size="small"
                      color={stage.responsible_id ? 'default' : 'warning'}
                      sx={{ height: 22, fontSize: '0.75rem' }}
                    />
                    {stage.estimated_end_date && (
                      <Chip 
                        label={`Hasta: ${new Date(stage.estimated_end_date).toLocaleDateString('es-ES')}`}
                        size="small"
                        sx={{ height: 22, fontSize: '0.75rem' }}
                      />
                    )}
                  </Stack>
                  
                  {/* Último comentario */}
                  {stage.recent_comments && stage.recent_comments.length > 0 && (
                    <Box sx={{ mt: 1, p: 1, bgcolor: 'background.default', borderRadius: 0.5 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight="bold">
                        Último comentario:
                      </Typography>
                      <Typography variant="caption" display="block" sx={{ mt: 0.3 }}>
                        <strong>{stage.recent_comments[0].author}:</strong> {stage.recent_comments[0].content}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(stage.recent_comments[0].created_at).toLocaleDateString('es-ES', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </Typography>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        ) : stages.some(s => !s.is_completed) ? (
          <Box sx={{ bgcolor: 'info.lighter', p: 1.5, borderRadius: 1, mt: 1 }}>
            <Typography variant="body2" color="info.dark" fontWeight="bold">
              ⏸ Etapas pendientes de iniciar
            </Typography>
          </Box>
        ) : (
          <Box sx={{ bgcolor: 'success.light', p: 1.5, borderRadius: 1, mt: 1 }}>
            <Typography variant="body2" color="success.dark" fontWeight="bold">
              ✓ Proyecto Completado
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
