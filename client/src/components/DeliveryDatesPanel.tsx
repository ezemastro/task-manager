import { Box, Chip, Stack, Typography } from '@mui/material';
import type { ProjectDelivery, Stage } from '../services/apiClient';
import { getDelayCauseLabel, type HoldPeriod } from '../utils/delayCauses';

// Fechas de calendario ya resueltas por la API (AAAA-MM-DD): se muestran
// tal cual, sin convertir zona horaria, para no correrlas un día.
function formatCalendarDate(value: string | null): string {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

const pluralDays = (days: number) => `${days} ${days === 1 ? 'día' : 'días'}`;

// Días en espera del proyecto (etapas + paralizado), agrupados por causa.
function holdDaysByCause(stages: Stage[], projectHolds: HoldPeriod[]) {
  const totals = new Map<string, number>();
  [...projectHolds, ...stages.flatMap((stage) => stage.holds ?? [])].forEach((hold) => {
    const label = getDelayCauseLabel(hold.cause);
    totals.set(label, (totals.get(label) ?? 0) + hold.days);
  });
  return Array.from(totals.entries()).filter(([, days]) => days > 0);
}

function statusChip(delivery: ProjectDelivery) {
  switch (delivery.status) {
    case 'on_time':
      return <Chip label="A tiempo" color="success" size="small" />;
    case 'late':
      return <Chip label={`Con ${pluralDays(delivery.delay_days)} de retraso`} color="error" size="small" />;
    case 'overdue':
      return <Chip label={`Sin entregar: ${pluralDays(delivery.delay_days)} de retraso`} color="error" variant="outlined" size="small" />;
    case 'pending':
      return <Chip label="En plazo" color="info" variant="outlined" size="small" />;
    default:
      return <Chip label="Sin fecha comprometida" size="small" />;
  }
}

/**
 * Comprometida / Entregada / Cerrada. El retraso compara la entrega real
 * con la fecha comprometida; el cierre del cliente no cuenta.
 */
export default function DeliveryDatesPanel({
  delivery,
  stages = [],
  projectHolds = [],
}: {
  delivery: ProjectDelivery;
  stages?: Stage[];
  projectHolds?: HoldPeriod[];
}) {
  const waiting = holdDaysByCause(stages, projectHolds);
  const attribution = delivery.attribution;
  const items = [
    { label: 'Comprometida', value: delivery.committed_date, hint: 'Acordada con el cliente' },
    { label: 'Entregada', value: delivery.delivered_date, hint: 'Al terminar "Entrega completa y revisada"' },
    { label: 'Cerrada', value: delivery.closed_date, hint: 'Cierre por parte de cliente (no cuenta para el retraso)' },
  ];

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="subtitle2">Entrega</Typography>
        {statusChip(delivery)}
      </Stack>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
          gap: 1,
        }}
      >
        {items.map((item) => (
          <Box key={item.label} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, px: 1.5, py: 1 }}>
            <Typography variant="caption" color="text.secondary">{item.label}</Typography>
            <Typography variant="body1" fontWeight="medium">{formatCalendarDate(item.value)}</Typography>
            <Typography variant="caption" color="text.secondary">{item.hint}</Typography>
          </Box>
        ))}
      </Box>
      {attribution && (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary">Retraso atribuible:</Typography>
          <Chip label={`Estudio: ${pluralDays(attribution.studio_days)}`} size="small" color="warning" variant="outlined" />
          <Chip label={`Cliente: ${pluralDays(attribution.client_days)}`} size="small" color="info" variant="outlined" />
        </Stack>
      )}
      {waiting.length > 0 && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
          Días en espera: {waiting.map(([label, days]) => `${label} ${pluralDays(days)}`).join(' · ')}
        </Typography>
      )}
    </Box>
  );
}
