import { useState } from 'react';
import { Alert, Box, Button, Chip, Stack, Tooltip, Typography } from '@mui/material';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import { apiClient, type Stage } from '../services/apiClient';
import { formatLocalDate, formatLocalDateTime } from '../utils/dateUtils';
import { getCauseSide, getDelayCauseLabel, isStageOverdue, pluralDays } from '../utils/delayCauses';
import CauseDialog from './CauseDialog';

interface StageDelayControlsProps {
  stage: Stage;
  onChanged?: () => void;
  disabled?: boolean;
}

/**
 * En la tarjeta de etapa: "Poner en espera" / "Reanudar" con su causa y los
 * días contados, y la causa del retraso cuando la etapa superó su fecha estimada.
 */
export default function StageDelayControls({ stage, onChanged, disabled = false }: StageDelayControlsProps) {
  const [dialog, setDialog] = useState<'hold' | 'delay' | null>(null);
  const [error, setError] = useState('');
  const [resuming, setResuming] = useState(false);

  const openHold = stage.open_hold ?? null;
  const closedHolds = (stage.holds ?? []).filter((hold) => hold.ended_at);
  const closedHoldDays = closedHolds.reduce((sum, hold) => sum + hold.days, 0);
  const overdue = isStageOverdue(stage);
  const canHold = !stage.is_completed && !stage.not_applicable;

  const handleResume = async () => {
    setResuming(true);
    setError('');
    try {
      await apiClient.resumeStage(stage.id);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reanudar la etapa');
    } finally {
      setResuming(false);
    }
  };

  // Cantidad de días por causa de las esperas ya cerradas: "Cliente 3 días · Interna 1 día".
  const closedSummary = Object.entries(closedHolds.reduce<Record<string, number>>((acc, hold) => {
    const label = getDelayCauseLabel(hold.cause);
    acc[label] = (acc[label] ?? 0) + hold.days;
    return acc;
  }, {})).map(([label, days]) => `${label} ${pluralDays(days)}`).join(' · ');

  if (!openHold && !overdue && !canHold && closedHolds.length === 0) return null;

  return (
    <Box sx={{ mt: 1.5 }}>
      <Stack spacing={1}>
        {openHold && (
          <Alert
            severity="warning"
            icon={<PauseCircleOutlineIcon />}
            action={
              <Button color="inherit" size="small" onClick={handleResume} disabled={disabled || resuming}>
                Reanudar
              </Button>
            }
          >
            <strong>En espera · {getDelayCauseLabel(openHold.cause)}</strong> · {pluralDays(openHold.days)}
            <Typography variant="caption" component="div">
              Desde {formatLocalDateTime(openHold.started_at)}{openHold.started_by_name ? ` · ${openHold.started_by_name}` : ''}
              {openHold.note ? ` · ${openHold.note}` : ''}
            </Typography>
          </Alert>
        )}

        {overdue && !stage.delay_cause && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => setDialog('delay')} disabled={disabled}>
                Indicar causa
              </Button>
            }
          >
            Superó la fecha estimada{stage.estimated_end_date ? ` (${formatLocalDate(stage.estimated_end_date)})` : ''}. Indicá la causa del retraso.
          </Alert>
        )}

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          {stage.delay_cause && (
            <Tooltip
              title={`Atribuible al ${getCauseSide(stage.delay_cause)}${stage.delay_cause_note ? ` · ${stage.delay_cause_note}` : ''}${stage.delay_cause_by_name ? ` · ${stage.delay_cause_by_name}` : ''}${stage.delay_cause_at ? ` · ${formatLocalDateTime(stage.delay_cause_at)}` : ''} · Clic para cambiar`}
            >
              <Chip
                label={`Causa del retraso: ${getDelayCauseLabel(stage.delay_cause)}`}
                size="small"
                color={getCauseSide(stage.delay_cause) === 'cliente' ? 'info' : 'warning'}
                variant="outlined"
                onClick={disabled ? undefined : () => setDialog('delay')}
              />
            </Tooltip>
          )}
          {closedHolds.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              Estuvo en espera: {closedSummary}
            </Typography>
          )}
          {canHold && !openHold && (
            <Button
              size="small"
              color="warning"
              startIcon={<PauseCircleOutlineIcon fontSize="small" />}
              onClick={() => setDialog('hold')}
              disabled={disabled}
            >
              Poner en espera
            </Button>
          )}
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>

      <CauseDialog
        open={dialog === 'hold'}
        title={`Poner "${stage.name}" en espera`}
        description="Los días en espera se cuentan solos hasta que la reanudes. ¿Por qué queda en espera?"
        confirmLabel="Poner en espera"
        onClose={() => setDialog(null)}
        onConfirm={async (cause, note) => {
          await apiClient.holdStage(stage.id, cause, note);
          setDialog(null);
          onChanged?.();
        }}
      />
      <CauseDialog
        open={dialog === 'delay'}
        title={`Causa del retraso de "${stage.name}"`}
        description={`La etapa superó su fecha estimada${closedHoldDays > 0 ? ` (estuvo ${pluralDays(closedHoldDays)} en espera)` : ''}. ¿A qué se debe?`}
        confirmLabel="Guardar causa"
        initialCause={stage.delay_cause ?? null}
        initialNote={stage.delay_cause_note ?? null}
        onClose={() => setDialog(null)}
        onConfirm={async (cause, note) => {
          await apiClient.setStageDelayCause(stage.id, cause, note);
          setDialog(null);
          onChanged?.();
        }}
      />
    </Box>
  );
}
