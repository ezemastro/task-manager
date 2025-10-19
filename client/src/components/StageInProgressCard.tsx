import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Typography,
  Chip,
  Stack,
  IconButton,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { Stage } from '../services/apiClient';
import DeadlineChip from './DeadlineChip';

interface StageInProgressCardProps {
  stage: Stage;
  showProjectName?: boolean;
  showStageNumber?: boolean;
  variant?: 'in-progress' | 'pending';
}

export default function StageInProgressCard({ 
  stage, 
  showProjectName = false,
  showStageNumber = true,
  variant = 'in-progress'
}: StageInProgressCardProps) {
  const isInProgress = variant === 'in-progress';
  
  return (
    <Box 
      sx={{ 
        bgcolor: 'action.hover', 
        p: 1.5, 
        borderRadius: 1,
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary" fontWeight="bold">
          {isInProgress ? 'EN PROCESO' : 'PENDIENTE'}
          {showStageNumber && stage.order_number ? ` - ETAPA ${stage.order_number}` : ''}
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
      
      {/* Nombre del proyecto (opcional) */}
      {showProjectName && stage.project_name && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
          Proyecto: {stage.project_name}
        </Typography>
      )}
      
      {/* Etiquetas */}
      {stage.tags && stage.tags.length > 0 && (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ gap: 0.5, mb: 0.5 }}>
          {stage.tags.map((tag) => (
            <Chip
              key={tag.id}
              label={tag.name}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.7rem',
                bgcolor: tag.color || undefined,
                color: tag.color ? '#fff' : undefined,
                borderColor: tag.color || undefined,
              }}
            />
          ))}
        </Stack>
      )}
      
      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 0.5 }}>
        {stage.responsible_id && (
          <Chip 
            label={stage.responsible_name || 'Sin responsable'}
            size="small"
            sx={{ height: 22, fontSize: '0.75rem' }}
          />
        )}
        {stage.estimated_end_date && (
          <DeadlineChip
            date={stage.estimated_end_date}
            isCompleted={stage.is_completed}
            size="small"
            showIcon={true}
            label={`Hasta: ${new Date(stage.estimated_end_date).toLocaleDateString('es-ES')}`}
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
}
