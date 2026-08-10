import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Container,
  FormControl,
  Grid,
  InputLabel,
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
import { apiClient, type ProjectSummary } from '../services/apiClient';

const currentYear = Number(new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
}).format(new Date()));

export default function SummaryView() {
  const [year, setYear] = useState(currentYear);
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    apiClient.getProjectSummary(year)
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
  }, [year]);

  // Keep the requested/server-selected year in the options while a new response loads.
  // This prevents MUI Select from receiving a value that is not represented by a MenuItem.
  const years = Array.from(new Set([
    ...(summary?.available_years || []),
    summary?.year ?? year,
    year,
    currentYear,
  ])).sort((a, b) => b - a);

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 4 }}>
        <Box>
          <Typography variant="overline" color="primary" sx={{ letterSpacing: 1.5 }}>Visión anual</Typography>
          <Typography variant="h3" component="h1" sx={{ fontWeight: 700, letterSpacing: '-0.03em' }}>Resumen de proyectos</Typography>
          <Typography color="text.secondary">Una lectura rápida del trabajo que llegó a término.</Typography>
        </Box>
        <FormControl sx={{ minWidth: 150 }} size="small">
          <InputLabel id="summary-year-label">Año</InputLabel>
          <Select labelId="summary-year-label" value={year} label="Año" onChange={(event) => setYear(Number(event.target.value))}>
            {years.map((availableYear) => <MenuItem key={availableYear} value={availableYear}>{availableYear}</MenuItem>)}
          </Select>
        </FormControl>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      {loading && !summary ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
      ) : summary ? (
        <Stack spacing={3}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Card sx={{ height: '100%', borderTop: 4, borderColor: 'primary.main' }}>
                <CardContent>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <EventAvailableIcon color="primary" />
                    <Box><Typography color="text.secondary" variant="body2">Proyectos creados en {summary.year}</Typography><Typography variant="h3" sx={{ fontWeight: 700 }}>{summary.projects_created}</Typography></Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Card sx={{ height: '100%', borderTop: 4, borderColor: 'success.main' }}>
                <CardContent>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <CheckCircleOutlineIcon color="success" />
                    <Box><Typography color="text.secondary" variant="body2">Proyectos completados en {summary.year}</Typography><Typography variant="h3" sx={{ fontWeight: 700 }}>{summary.projects_completed}</Typography></Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <CalendarMonthIcon color="primary" />
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Rendimiento por etapa</Typography>
              </Stack>
              {summary.stages.length === 0 ? (
                <Typography color="text.secondary">No hay etapas registradas en proyectos completados durante este año.</Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead><TableRow><TableCell>Etapa</TableCell><TableCell align="right">Días totales</TableCell><TableCell align="right">Ciclos demorados</TableCell></TableRow></TableHead>
                    <TableBody>{summary.stages.map((stage) => <TableRow key={stage.stage_name}><TableCell sx={{ fontWeight: 600 }}>{stage.stage_name}</TableCell><TableCell align="right">{stage.total_days}</TableCell><TableCell align="right">{stage.delayed_cycles}</TableCell></TableRow>)}</TableBody>
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
