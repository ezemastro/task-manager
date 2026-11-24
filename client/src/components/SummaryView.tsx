import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  Grid,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import ScheduleIcon from '@mui/icons-material/Schedule';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import GroupsIcon from '@mui/icons-material/Groups';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import { apiClient, type ProjectSummary } from '../services/apiClient';
import { PROJECT_TYPES, PROJECT_TYPE_LABELS, type ProjectType } from '../utils/projectTypes';
import { DELAY_CAUSES, getCauseSide, getDelayCauseLabel } from '../utils/delayCauses';

const currentYear = Number(new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
}).format(new Date()));

// Tarjeta de indicador: título, valor grande y una línea de detalle.
function IndicatorCard({
  icon,
  color,
  title,
  value,
  detail,
}: {
  icon: ReactNode;
  color: 'primary' | 'success' | 'warning' | 'info' | 'error';
  title: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <Card sx={{ height: '100%', borderTop: 4, borderColor: `${color}.main` }}>
      <CardContent>
        <Stack direction="row" spacing={2} alignItems="flex-start">
          {icon}
          <Box sx={{ minWidth: 0 }}>
            <Typography color="text.secondary" variant="body2">{title}</Typography>
            <Typography variant="h3" sx={{ fontWeight: 700 }}>{value}</Typography>
            {detail && <Typography color="text.secondary" variant="caption" component="p">{detail}</Typography>}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

const pluralDays = (days: number) => `${days} ${days === 1 ? 'día' : 'días'}`;

// Orden fijo de causas para la lista de días en espera; "sin causa" al final.
const HOLD_CAUSE_ORDER = [...DELAY_CAUSES, 'unspecified'];

export default function SummaryView() {
  const [year, setYear] = useState(currentYear);
  // '' = todos los tipos de trabajo.
  const [projectType, setProjectType] = useState<ProjectType | ''>('');
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    apiClient.getProjectSummary(year, projectType || null)
      .then((data) => {
        if (!active) return;
        setSummary(data);
        setYear(data.year);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Error al cargar el resumen');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [year, projectType]);

  const deliveries = summary?.deliveries;
  const recurring = summary?.recurring_clients;
  const typeLabel = projectType ? ` · ${PROJECT_TYPE_LABELS[projectType]}` : '';

  // Keep the requested/server-selected year in the options while a new response loads.
  // This prevents MUI Select from receiving a value that is not represented by a MenuItem.
  const years = Array.from(new Set([
    ...(summary?.available_years || []),
    summary?.year ?? year,
    year,
    currentYear,
  ])).sort((a, b) => b - a);

  // Hide stages without recorded duration. A stage with zero days but delayed
  // cycles stays visible so the delay is not silently discarded.
  const visibleStages = (summary?.stages ?? []).filter(
    (stage) => stage.total_days > 0 || stage.delayed_cycles > 0,
  );

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 4 }}>
        <Box>
          <Typography variant="overline" color="primary" sx={{ letterSpacing: 1.5 }}>Visión anual</Typography>
          <Typography variant="h3" component="h1" sx={{ fontWeight: 700, letterSpacing: '-0.03em' }}>Resumen de proyectos</Typography>
          <Typography color="text.secondary">Una lectura rápida del trabajo que llegó a término.</Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <FormControl sx={{ minWidth: 160 }} size="small">
            <InputLabel id="summary-type-label">Tipo de trabajo</InputLabel>
            <Select
              labelId="summary-type-label"
              value={projectType}
              label="Tipo de trabajo"
              onChange={(event) => setProjectType(event.target.value as ProjectType | '')}
            >
              <MenuItem value="">Todos</MenuItem>
              {PROJECT_TYPES.map((type) => <MenuItem key={type} value={type}>{PROJECT_TYPE_LABELS[type]}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl sx={{ minWidth: 110 }} size="small">
            <InputLabel id="summary-year-label">Año</InputLabel>
            <Select labelId="summary-year-label" value={year} label="Año" onChange={(event) => setYear(Number(event.target.value))}>
              {years.map((availableYear) => <MenuItem key={availableYear} value={availableYear}>{availableYear}</MenuItem>)}
            </Select>
          </FormControl>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      {loading && !summary ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
      ) : summary ? (
        <Stack spacing={3}>
          {/* Indicadores de los objetivos de calidad (Manual de Calidad MDC_5). */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <IndicatorCard
                icon={<CheckCircleOutlineIcon color="success" />}
                color="success"
                title={`Entregados a tiempo · ${summary.year}${typeLabel}`}
                value={deliveries?.on_time_percentage != null ? `${deliveries.on_time_percentage}%` : '—'}
                detail={deliveries && deliveries.with_commitment > 0
                  ? `Objetivo 1.1 · ${deliveries.on_time} de ${deliveries.with_commitment} entregas con fecha comprometida. No incluye el cierre del cliente.`
                  : 'Objetivo 1.1 · Sin entregas con fecha comprometida en el período.'}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <IndicatorCard
                icon={<ScheduleIcon color="warning" />}
                color="warning"
                title="Retraso promedio"
                value={deliveries?.average_delay_days != null ? pluralDays(deliveries.average_delay_days) : '—'}
                detail={deliveries && deliveries.late > 0
                  ? `Promedio de los ${deliveries.late} proyectos entregados tarde.`
                  : 'Ningún proyecto entregado tarde en el período.'}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <IndicatorCard
                icon={<TaskAltIcon color="primary" />}
                color="primary"
                title={`Proyectos completados · ${summary.year}${typeLabel}`}
                value={summary.projects_completed}
                detail={`Objetivo 1.3 (denominador del índice de errores) · Creados en el año: ${summary.projects_created}.`}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <IndicatorCard
                icon={<GroupsIcon color="info" />}
                color="info"
                title="Clientes recurrentes"
                value={recurring?.count ?? '—'}
                detail={recurring
                  ? `Fidelización B2B · Clientes con más de ${recurring.min_projects - 1} proyectos iniciados en el año (de ${recurring.clients_with_projects} clientes con proyectos).`
                  : undefined}
              />
            </Grid>
          </Grid>

          {deliveries && (
            <Card>
              <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <CallSplitIcon color="primary" />
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>Retraso por origen</Typography>
                </Stack>
                <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
                  De los {pluralDays(deliveries.total_delay_days)} de retraso de las entregas tardías{typeLabel}.
                  Cliente = esperas y retrasos con causa Cliente, Falta de información o Cambio de arquitectura; el resto es del estudio.
                </Typography>
                {deliveries.total_delay_days > 0 ? (
                  <>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Typography color="text.secondary" variant="body2">Atribuible al estudio</Typography>
                        <Typography variant="h4" sx={{ fontWeight: 700 }} color="warning.main">
                          {pluralDays(deliveries.studio_delay_days ?? 0)}
                          {deliveries.studio_delay_percentage != null && <Typography component="span" variant="h6" color="text.secondary"> · {deliveries.studio_delay_percentage}%</Typography>}
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Typography color="text.secondary" variant="body2">Atribuible al cliente</Typography>
                        <Typography variant="h4" sx={{ fontWeight: 700 }} color="info.main">
                          {pluralDays(deliveries.client_delay_days ?? 0)}
                          {deliveries.client_delay_percentage != null && <Typography component="span" variant="h6" color="text.secondary"> · {deliveries.client_delay_percentage}%</Typography>}
                        </Typography>
                      </Grid>
                    </Grid>
                    <LinearProgress
                      variant="determinate"
                      value={deliveries.studio_delay_percentage ?? 0}
                      color="warning"
                      sx={{ mt: 2, height: 10, borderRadius: 5, bgcolor: 'info.light' }}
                      aria-label="Proporción del retraso atribuible al estudio"
                    />
                  </>
                ) : (
                  <Typography color="text.secondary">Sin retrasos en las entregas del período.</Typography>
                )}
                {summary.hold_days_by_cause && Object.keys(summary.hold_days_by_cause).length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography color="text.secondary" variant="body2" sx={{ mb: 1 }}>Días en espera en {summary.year} (etapas en espera y proyectos paralizados):</Typography>
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                      {HOLD_CAUSE_ORDER
                        .filter((cause) => summary.hold_days_by_cause?.[cause])
                        .map((cause) => (
                          <Chip
                            key={cause}
                            label={`${cause === 'unspecified' ? 'Sin causa' : getDelayCauseLabel(cause)} · ${pluralDays(summary.hold_days_by_cause![cause])}`}
                            color={cause !== 'unspecified' && getCauseSide(cause) === 'cliente' ? 'info' : 'warning'}
                            variant="outlined"
                          />
                        ))}
                    </Stack>
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          {recurring && recurring.clients.length > 0 && (
            <Card>
              <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                  <EventAvailableIcon color="info" />
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>Clientes recurrentes</Typography>
                </Stack>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  {recurring.clients.map((client) => (
                    <Chip key={client.id} label={`${client.name} · ${client.projects} proyectos`} variant="outlined" />
                  ))}
                </Stack>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <CalendarMonthIcon color="primary" />
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Rendimiento por etapa</Typography>
              </Stack>
              {summary.work_days !== undefined && visibleStages.length > 0 && (
                <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
                  Días de trabajo: <strong>{summary.work_days}</strong> (solo las etapas que suman tiempo de trabajo)
                </Typography>
              )}
              {visibleStages.length === 0 ? (
                <Typography color="text.secondary">No hay etapas con actividad registrada en proyectos completados durante este año.</Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead><TableRow><TableCell>Etapa</TableCell><TableCell align="right">Días totales</TableCell><TableCell align="right">Ciclos demorados</TableCell><TableCell align="right">Suma tiempo</TableCell></TableRow></TableHead>
                    <TableBody>{visibleStages.map((stage) => (
                      <TableRow key={stage.stage_name} sx={stage.counts_work_time === false ? { '& td': { color: 'text.secondary' } } : undefined}>
                        <TableCell sx={{ fontWeight: 600 }}>
                          {stage.stage_name}
                          {stage.is_control && <Chip label="Control" size="small" variant="outlined" sx={{ ml: 1, height: 20 }} />}
                        </TableCell>
                        <TableCell align="right">{stage.total_days}</TableCell>
                        <TableCell align="right">{stage.delayed_cycles}</TableCell>
                        <TableCell align="right">{stage.counts_work_time === false ? 'No' : 'Sí'}</TableCell>
                      </TableRow>
                    ))}</TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Stack>
      ) : null}
    </Container>
  );
}
