import { Link as RouterLink } from 'react-router-dom';
import {
  Card,
  CardContent,
  Typography,
  Box,
  LinearProgress,
  Stack,
  IconButton,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import BusinessIcon from '@mui/icons-material/Business';
import PersonIcon from '@mui/icons-material/Person';
import type { Stage } from '../services/apiClient';
import StageInProgressCard from './StageInProgressCard';
import DeadlineChip from './DeadlineChip';
import { saveProjectReturnSnapshot, type ProjectReturnFilters } from '../utils/projectReturnSnapshot';

interface ProjectCardProps {
  projectId: number;
  projectName: string;
  projectDescription?: string;
  clientName?: string;
  responsibleName?: string;
  deadline?: string;
  stages: Stage[];
  onStageCompleted?: () => void;
  dashboardLocationKey?: string;
  filters?: ProjectReturnFilters;
}

export default function ProjectCard({
  projectId,
  projectName,
  projectDescription,
  clientName,
  responsibleName,
  deadline,
  stages,
  dashboardLocationKey,
  filters,
}: ProjectCardProps) {
  const completedStages = stages.filter(stage => stage.is_completed).length;
  const totalStages = stages.length;
  const progress = totalStages > 0 ? (completedStages / totalStages) * 100 : 0;
  const isCompleted = totalStages > 0 && completedStages === totalStages;
  
  // Obtener TODAS las etapas en proceso (con start_date y no completadas)
  const stagesInProgress = stages.filter(stage => stage.start_date && !stage.is_completed);

  return (
    <Card 
      elevation={2} 
      sx={{ 
        position: 'relative',
        width: '100%',
        height: 'fit-content',
      }}
    >
      <CardContent sx={{ pb: 2, '&:last-child': { pb: 2 } }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, gap: 2 }}>
          {/* Info del proyecto */}
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
              <Typography 
                variant="h5" 
                component="h2" 
                sx={{ 
                  lineHeight: 1.3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flexShrink: 1,
                }}
              >
                {projectName}
              </Typography>
              
              {/* Progreso inline */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                <Typography variant="caption" color="text.secondary">
                  {completedStages}/{totalStages}
                </Typography>
                <Box sx={{ width: 60, position: 'relative' }}>
                  <LinearProgress 
                    variant="determinate" 
                    value={progress} 
                    sx={{ height: 6, borderRadius: 3 }}
                  />
                </Box>
                <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ minWidth: 35 }}>
                  {Math.round(progress)}%
                </Typography>
              </Box>
            </Stack>
            
            {/* Metadata inline */}
            <Stack direction="row" spacing={2} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
              {projectDescription && (
                <Typography 
                  variant="body2" 
                  color="text.secondary" 
                  sx={{ 
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 300,
                  }}
                >
                  {projectDescription}
                </Typography>
              )}
              {clientName && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                  <BusinessIcon fontSize="small" color="action" />
                  <Typography variant="caption" color="text.secondary">
                    {clientName}
                  </Typography>
                </Box>
              )}
              {responsibleName && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                  <PersonIcon fontSize="small" color="action" />
                  <Typography variant="caption" color="text.secondary">
                    {responsibleName}
                  </Typography>
                </Box>
              )}
              {deadline && (
                <DeadlineChip 
                  date={deadline} 
                  isCompleted={isCompleted}
                  size="small"
                  showIcon={true}
                />
              )}
            </Stack>
          </Box>
          
          <IconButton
            component={RouterLink}
            to={`/projects/${projectId}`}
            onClick={() => {
              if (dashboardLocationKey && filters) {
                saveProjectReturnSnapshot({
                  dashboardKey: dashboardLocationKey,
                  projectId,
                  filters,
                  scrollY: window.scrollY,
                  viewportHeight: window.innerHeight,
                  savedAt: Date.now(),
                });
              }
            }}
            color="primary"
            size="small"
            aria-label="Ver detalles del proyecto"
            sx={{ flexShrink: 0 }}
          >
            <OpenInNewIcon />
          </IconButton>
        </Box>

        {/* Etapas en proceso - Layout horizontal compacto */}
        {stagesInProgress.length > 0 ? (
          <Box sx={{ mt: 2 }}>
            <Stack spacing={1}>
              {stagesInProgress.map((stage) => (
                <StageInProgressCard 
                  key={stage.id} 
                  stage={stage}
                  showStageNumber={true}
                  compact={true}
                />
              ))}
            </Stack>
          </Box>
        ) : stages.some(s => !s.is_completed) ? (
          <Box sx={{ bgcolor: 'info.lighter', px: 2, py: 0.75, borderRadius: 1, mt: 2 }}>
            <Typography variant="body2" color="info.dark" fontWeight="bold">
              ⏸ Etapas pendientes de iniciar
            </Typography>
          </Box>
        ) : (
          <Box sx={{ bgcolor: 'success.light', px: 2, py: 0.75, borderRadius: 1, mt: 2 }}>
            <Typography variant="body2" color="success.dark" fontWeight="bold">
              ✓ Proyecto Completado
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
