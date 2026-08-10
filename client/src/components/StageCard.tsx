import { useCallback, useEffect, useState } from 'react';
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
import type { Stage, StageCycle } from '../services/apiClient';
import { apiClient } from '../services/apiClient';
import { formatLocalDate, formatLocalDateTime } from '../utils/dateUtils';

interface StageCardProps {
  stage: Stage;
  isCurrentStage?: boolean;
  onCompleted?: () => void;
  siblingLifecycleLoading?: boolean;
  onLifecycleLoadingChange?: (loading: boolean) => void;
}

export default function StageCard({ stage, isCurrentStage, onCompleted, siblingLifecycleLoading = false, onLifecycleLoadingChange }: StageCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cycles, setCycles] = useState<StageCycle[]>([]);
  const [cycleLoading, setCycleLoading] = useState(false);
  const [cyclesLoaded, setCyclesLoaded] = useState(false);
  const [stageStartConfirmed, setStageStartConfirmed] = useState(Boolean(stage.start_date));

  const fetchCycles = useCallback(async () => {
    let loaded = false;
    try {
      const fetchedCycles = await apiClient.getStageCycles(stage.id);
      setCycles(fetchedCycles);
      loaded = true;
      if (!stage.start_date && !fetchedCycles.some((cycle) => !cycle.ended_at)) {
        setStageStartConfirmed(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar historial de ciclos');
    } finally {
      setCyclesLoaded(loaded);
    }
  }, [stage.id, stage.start_date]);

  useEffect(() => {
    setCyclesLoaded(false);
    fetchCycles();
  }, [fetchCycles]);

  const openCycle = cycles.find((cycle) => !cycle.ended_at);
  // An open cycle is authoritative immediately after the start endpoint returns,
  // before the parent project refresh replaces the stage prop with start_date.
  const isInProgress = (Boolean(stage.start_date) || Boolean(openCycle)) && !stage.is_completed;

  const handleStartCycle = async () => {
    setCycleLoading(true); onLifecycleLoadingChange?.(true); setError('');
    try { await apiClient.startStageCycle(stage.id); await fetchCycles(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Error al iniciar ciclo'); }
    finally { setCycleLoading(false); onLifecycleLoadingChange?.(false); }
  };

  const handleFinishCycle = async () => {
    if (!openCycle) return;
    setCycleLoading(true); onLifecycleLoadingChange?.(true); setError('');
    try { await apiClient.finishStageCycle(stage.id, openCycle.id); await fetchCycles(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Error al cerrar ciclo'); }
    finally { setCycleLoading(false); onLifecycleLoadingChange?.(false); }
  };

  const handleComplete = async () => {
    if (!isCurrentStage) return;

    setLoading(true);
    onLifecycleLoadingChange?.(true);
    setError('');

    try {
      await apiClient.completeStage(stage.id);
      await fetchCycles();
      if (onCompleted) onCompleted();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al completar la etapa';
      setError(message);
    } finally {
      setLoading(false);
      onLifecycleLoadingChange?.(false);
    }
  };

  const handleStart = async () => {
    setLoading(true);
    onLifecycleLoadingChange?.(true);
    setError('');

    try {
      await apiClient.startStage(stage.id);
      setStageStartConfirmed(true);
      await fetchCycles();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al iniciar la etapa';
      setError(message);
    } finally {
      onCompleted?.();
      setLoading(false);
      onLifecycleLoadingChange?.(false);
    }
  };

  const handleUncomplete = async () => {
    setLoading(true);
    onLifecycleLoadingChange?.(true);
    setError('');

    try {
      await apiClient.uncompleteStage(stage.id);
      await fetchCycles();
      if (onCompleted) onCompleted();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al reabrir la etapa';
      setError(message);
    } finally {
      setLoading(false);
      onLifecycleLoadingChange?.(false);
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

          <Box>
            {stage.is_completed ? (
              <Chip label="Completada" color="success" size="small" />
            ) : isCurrentStage ? (
              <Chip label="En Curso" color="primary" size="small" />
            ) : (
              <Chip label="Pendiente" color="default" size="small" />
            )}
          </Box>
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

        {isInProgress && cyclesLoaded ? (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
            {!openCycle ? (
              <Button variant="outlined" color="primary" onClick={handleStartCycle} disabled={siblingLifecycleLoading || loading || cycleLoading}>
                {cycleLoading ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null} COMIENZO
              </Button>
            ) : (
              <Button variant="contained" color="warning" onClick={handleFinishCycle} disabled={siblingLifecycleLoading || loading || cycleLoading}>
                {cycleLoading ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null} FIN (cerrar ciclo)
              </Button>
            )}
          </Stack>
        ) : null}

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

        <Box sx={{ mt: 2 }}>
          {cycles.length > 0 ? (
            <Paper variant="outlined" sx={{ mt: 1.5, p: 1.5 }}>
              <Typography variant="caption" color="text.secondary" fontWeight="bold">Historial de ciclos</Typography>
              <Stack spacing={0.75} sx={{ mt: 1 }}>
                {cycles.map((cycle) => {
                  const comparison = cycle.comparison;
                  const color = !cycle.ended_at ? 'info.main' : comparison?.status === 'sin_fecha' ? 'text.secondary' : comparison?.status === 'late' ? 'error.main' : 'success.main';
                  const resultLabel = !cycle.ended_at ? `· En curso · ${cycle.duration_days ?? 0} días` : comparison?.status === 'sin_fecha' ? '· Sin fecha límite' : comparison?.status === 'late' ? `· ${comparison.days_late} días atrasado` : `· ${comparison?.days_early || 0} días antes`;
                  const durationLabel = cycle.ended_at ? `${cycle.duration_days ?? 0} días de duración` : '';
                  const deadlineForDisplay = cycle.deadline_for_display || cycle.deadline_used;
                  return <Box key={cycle.id} sx={{ borderLeft: 3, borderColor: color, pl: 1 }}>
                    <Typography variant="body2" color={color} fontWeight="bold">
                      Ciclo {cycle.cycle_number} {resultLabel}
                      {durationLabel ? ` · ${durationLabel}` : ''}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      COMIENZO: {formatLocalDateTime(cycle.started_at)} · {cycle.started_by_name || 'Usuario'}
                      {cycle.ended_at ? ` · FIN: ${formatLocalDateTime(cycle.ended_at)}` : ''}
                      {deadlineForDisplay ? ` · Límite: ${formatLocalDate(deadlineForDisplay)}` : ''}
                    </Typography>
                  </Box>;
                })}
              </Stack>
            </Paper>
          ) : null}
        </Box>

        {/* Botón de iniciar (si está pendiente) */}
        {!stage.is_completed && !stage.start_date && !stageStartConfirmed && !openCycle ? (
          <Button
            variant="outlined"
            color="primary"
            onClick={handleStart}
            disabled={loading || siblingLifecycleLoading || cycleLoading}
            fullWidth
            sx={{ mt: 3 }}
          >
            {loading ? (
              <>
                <CircularProgress size={20} sx={{ mr: 1 }} />
                Iniciando...
              </>
            ) : (
              '▶ Iniciar Etapa'
            )}
          </Button>
        ) : null}

        {/* Botón de completar (si está en proceso) */}
        {isCurrentStage && !stage.is_completed && stage.start_date ? (
          <Button
            variant="contained"
            color="success"
            onClick={handleComplete}
            disabled={loading || siblingLifecycleLoading || cycleLoading}
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

        {/* Botón de reabrir (si está completada) */}
        {stage.is_completed ? (
          <Button
            variant="outlined"
            color="warning"
            onClick={handleUncomplete}
            disabled={loading || siblingLifecycleLoading || cycleLoading}
            fullWidth
            sx={{ mt: 3 }}
          >
            {loading ? (
              <>
                <CircularProgress size={20} sx={{ mr: 1 }} />
                Reabriendo...
              </>
            ) : (
              '↺ Reabrir Etapa'
            )}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
