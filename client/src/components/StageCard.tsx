import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Button,
  Stack,
  CircularProgress,
  Alert,
  IconButton,
  Divider,
  Paper,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LabelIcon from '@mui/icons-material/Label';
import CommentIcon from '@mui/icons-material/Comment';
import type { Stage } from '../services/apiClient';
import { apiClient } from '../services/apiClient';

interface StageCardProps {
  stage: Stage;
  isCurrentStage?: boolean;
  onCompleted?: () => void;
}

export default function StageCard({ stage, isCurrentStage, onCompleted }: StageCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Verificar si la etapa necesita datos - solo resaltar si está en proceso (isCurrentStage)
  const needsData = isCurrentStage && !stage.is_completed && (!stage.responsible_id || !stage.start_date || !stage.estimated_end_date);

  const handleComplete = async () => {
    if (!isCurrentStage) return;

    setLoading(true);
    setError('');

    try {
      await apiClient.completeStage(stage.id);
      if (onCompleted) onCompleted();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al completar la etapa';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date?: string) => {
    if (!date) return 'No definida';
    return new Date(date).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <Card 
      variant="outlined" 
      sx={{ 
        borderLeft: isCurrentStage ? 4 : 1,
        borderLeftColor: isCurrentStage ? 'primary.main' : 'divider',
        bgcolor: stage.is_completed ? 'action.hover' : 'background.paper',
        opacity: stage.is_completed ? 0.8 : 1,
        border: needsData ? '2px solid' : undefined,
        borderColor: needsData ? 'warning.main' : undefined,
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="h6" component="h3">
                Etapa {stage.order_number}: {stage.name}
              </Typography>
              <IconButton
                component={RouterLink}
                to={`/stages/${stage.id}`}
                size="small"
                color="primary"
                aria-label="Ver detalles de la etapa"
              >
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Stack>
            
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Responsable: <strong>{stage.responsible_name || 'No asignado'}</strong>
              {stage.responsible_role ? (
                <Typography component="span" variant="caption" color="text.secondary">
                  {' '}({stage.responsible_role})
                </Typography>
              ) : null}
            </Typography>
          </Box>

          <Stack direction="row" spacing={1}>
            {needsData ? (
              <Chip 
                label="Faltan datos" 
                color="warning" 
                size="small"
                sx={{ fontSize: '0.7rem' }}
              />
            ) : null}
            <Box>
              {stage.is_completed ? (
                <Chip label="Completada" color="success" size="small" />
              ) : isCurrentStage ? (
                <Chip label="En Curso" color="primary" size="small" />
              ) : (
                <Chip label="Pendiente" color="default" size="small" />
              )}
            </Box>
          </Stack>
        </Box>

        {/* Fechas */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Inicio
            </Typography>
            <Typography variant="body2">
              {formatDate(stage.start_date)}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary">
              Fin Estimado
            </Typography>
            <Typography variant="body2">
              {formatDate(stage.estimated_end_date)}
            </Typography>
          </Box>

          {stage.completed_date ? (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Completada
              </Typography>
              <Typography variant="body2" color="success.main">
                {formatDate(stage.completed_date)}
              </Typography>
            </Box>
          ) : null}
        </Stack>

        {/* Tags si existen */}
        {stage.tags && stage.tags.length > 0 ? (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
              <LabelIcon fontSize="small" /> Etiquetas:
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {stage.tags.map((tag) => (
                <Chip
                  key={tag.id}
                  label={tag.name}
                  size="small"
                  sx={{
                    bgcolor: tag.color || undefined,
                    color: tag.color ? '#fff' : undefined,
                    borderColor: tag.color || undefined,
                  }}
                />
              ))}
            </Stack>
          </Box>
        ) : null}

        {/* Comentarios recientes */}
        {stage.recent_comments && stage.recent_comments.length > 0 ? (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
              <CommentIcon fontSize="small" /> Últimos comentarios ({stage.comments_count || 0}):
            </Typography>
            <Stack spacing={1}>
              {stage.recent_comments.map((comment) => (
                <Paper key={comment.id} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                        <Typography variant="caption" fontWeight="bold" noWrap>
                          {comment.author}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {new Date(comment.created_at).toLocaleDateString('es-ES', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </Typography>
                      </Stack>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {comment.content}
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Box>
        ) : null}

        {/* Divider antes del botón */}
        {isCurrentStage && !stage.is_completed && ((stage.tags && stage.tags.length > 0) || (stage.recent_comments && stage.recent_comments.length > 0)) ? (
          <Divider sx={{ mt: 2, mb: 2 }} />
        ) : null}

        {/* Error message */}
        {error ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        ) : null}

        {/* Botón de completar */}
        {isCurrentStage && !stage.is_completed ? (
          <Button
            variant="contained"
            color="success"
            onClick={handleComplete}
            disabled={loading}
            fullWidth
            sx={{ mt: 3 }}
          >
            {loading ? (
              <>
                <CircularProgress size={20} sx={{ mr: 1 }} />
                Completando...
              </>
            ) : (
              '✓ Marcar como Completada'
            )}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
