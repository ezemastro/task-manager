import { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  CircularProgress,
  Alert,
  Chip,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import { apiClient, type AuditLog, type AuditLogStats } from '../services/apiClient';
import { formatLocalDateTime } from '../utils/dateUtils';

export default function AuditLogsView() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<AuditLogStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Filtros
  const [entityType, setEntityType] = useState<string>('');
  const [action, setAction] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // Estado para el modal de detalles
  const [detailsDialog, setDetailsDialog] = useState<{ open: boolean; log: AuditLog | null }>({
    open: false,
    log: null,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [logsData, statsData] = await Promise.all([
        apiClient.getAuditLogs({
          entity_type: entityType || undefined,
          action: action || undefined,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          limit: 500,
        }),
        apiClient.getAuditLogStats(),
      ]);
      setLogs(logsData);
      setStats(statsData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar logs de auditoría';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleApplyFilters = () => {
    setPage(0);
    fetchData();
  };

  const handleClearFilters = () => {
    setEntityType('');
    setAction('');
    setFromDate('');
    setToDate('');
    setPage(0);
    fetchData();
  };

  const getActionColor = (action: string): 'success' | 'info' | 'warning' | 'error' | 'default' => {
    switch (action) {
      case 'CREATE':
        return 'success';
      case 'UPDATE':
        return 'info';
      case 'DELETE':
        return 'error';
      case 'COMPLETE':
      case 'START':
        return 'success';
      case 'UNCOMPLETE':
      case 'UNSTART':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getActionLabel = (action: string): string => {
    const labels: Record<string, string> = {
      CREATE: 'Crear',
      UPDATE: 'Actualizar',
      DELETE: 'Eliminar',
      COMPLETE: 'Completar',
      UNCOMPLETE: 'Reabrir',
      START: 'Iniciar',
      UNSTART: 'Des-iniciar',
    };
    return labels[action] || action;
  };

  const getEntityTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      project: 'Proyecto',
      stage: 'Etapa',
      client: 'Cliente',
      user: 'Usuario',
      comment: 'Comentario',
      tag: 'Etiqueta',
    };
    return labels[type] || type;
  };

  const handleOpenDetails = (log: AuditLog) => {
    setDetailsDialog({ open: true, log });
  };

  const handleCloseDetails = () => {
    setDetailsDialog({ open: false, log: null });
  };

  const parseDetails = (details: string | undefined): any => {
    if (!details) return null;
    try {
      return JSON.parse(details);
    } catch {
      return details;
    }
  };

  const totalActions = stats.reduce((sum, s) => sum + s.count, 0);
  const uniqueUsers = new Set(logs.map(l => l.user_id)).size;

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ py: 8, textAlign: 'center' }}>
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Cargando logs de auditoría...
        </Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" component="h1">
            Registro de cambios
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Historial completo de cambios y acciones en el sistema
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={fetchData}
        >
          Actualizar
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Estadísticas */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Card sx={{ flex: '1 1 300px' }}>
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              Total de Acciones
            </Typography>
            <Typography variant="h4">
              {totalActions}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: '1 1 300px' }}>
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              Usuarios Activos
            </Typography>
            <Typography variant="h4">
              {uniqueUsers}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: '1 1 300px' }}>
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              Registros Cargados
            </Typography>
            <Typography variant="h4">
              {logs.length}
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Filtros */}
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Filtros
        </Typography>
        <Stack spacing={2}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ flex: '1 1 200px', minWidth: '150px' }}>
              <FormControl fullWidth>
                <InputLabel>Tipo de Entidad</InputLabel>
                <Select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                  label="Tipo de Entidad"
                >
                  <MenuItem value="">
                    <em>Todos</em>
                  </MenuItem>
                  <MenuItem value="project">Proyectos</MenuItem>
                  <MenuItem value="stage">Etapas</MenuItem>
                  <MenuItem value="client">Clientes</MenuItem>
                  <MenuItem value="user">Usuarios</MenuItem>
                  <MenuItem value="comment">Comentarios</MenuItem>
                  <MenuItem value="tag">Etiquetas</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ flex: '1 1 200px', minWidth: '150px' }}>
              <FormControl fullWidth>
                <InputLabel>Acción</InputLabel>
                <Select
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  label="Acción"
                >
                  <MenuItem value="">
                    <em>Todas</em>
                  </MenuItem>
                  <MenuItem value="CREATE">Crear</MenuItem>
                  <MenuItem value="UPDATE">Actualizar</MenuItem>
                  <MenuItem value="DELETE">Eliminar</MenuItem>
                  <MenuItem value="COMPLETE">Completar</MenuItem>
                  <MenuItem value="UNCOMPLETE">Reabrir</MenuItem>
                  <MenuItem value="START">Iniciar</MenuItem>
                  <MenuItem value="UNSTART">Des-iniciar</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ flex: '1 1 200px', minWidth: '150px' }}>
              <TextField
                fullWidth
                label="Desde Fecha"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Box>

            <Box sx={{ flex: '1 1 200px', minWidth: '150px' }}>
              <TextField
                fullWidth
                label="Hasta Fecha"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="contained" onClick={handleApplyFilters}>
              Aplicar Filtros
            </Button>
            <Button variant="outlined" onClick={handleClearFilters}>
              Limpiar Filtros
            </Button>
          </Box>
        </Stack>
      </Paper>

      {/* Tabla de logs */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Fecha y Hora</TableCell>
              <TableCell>Usuario</TableCell>
              <TableCell>Acción</TableCell>
              <TableCell>Entidad</TableCell>
              <TableCell>Proyecto</TableCell>
              <TableCell>ID</TableCell>
              <TableCell>Detalles</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography variant="body2" color="text.secondary">
                    No hay registros de auditoría
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              logs
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((log) => (
                  <TableRow 
                    key={log.id} 
                    hover 
                    onClick={() => handleOpenDetails(log)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell sx={{ py: 1.5 }}>
                      <Typography variant="body2">
                        {formatLocalDateTime(log.created_at)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 1.5 }}>
                      <Typography variant="body2">
                        {log.user_name}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 1.5 }}>
                      <Chip
                        label={getActionLabel(log.action)}
                        color={getActionColor(log.action)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell sx={{ py: 1.5 }}>
                      <Typography variant="body2">
                        {getEntityTypeLabel(log.entity_type)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 1.5 }}>
                      <Typography variant="body2">
                        {log.project_name || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 1.5 }}>
                      <Typography variant="body2">
                        {log.entity_id || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ width: '100%', py: 1.5 }}>
                      {log.details ? (
                        <Typography
                          variant="body2"
                          sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {log.details}
                        </Typography>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                  </TableRow>
                ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={logs.length}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[10, 25, 50, 100]}
          labelRowsPerPage="Filas por página:"
        />
      </TableContainer>

      {/* Modal de detalles */}
      <Dialog
        open={detailsDialog.open}
        onClose={handleCloseDetails}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Detalles de la Acción</Typography>
          <IconButton onClick={handleCloseDetails} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {detailsDialog.log && (
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Fecha y Hora
                </Typography>
                <Typography variant="body1">
                  {formatLocalDateTime(detailsDialog.log.created_at)}
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Usuario
                </Typography>
                <Typography variant="body1">
                  {detailsDialog.log.user_name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  ID: {detailsDialog.log.user_id}
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Acción
                </Typography>
                <Chip
                  label={getActionLabel(detailsDialog.log.action)}
                  color={getActionColor(detailsDialog.log.action)}
                  size="small"
                />
              </Box>

              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Entidad
                </Typography>
                <Typography variant="body1">
                  {getEntityTypeLabel(detailsDialog.log.entity_type)}
                  {detailsDialog.log.entity_id && ` (ID: ${detailsDialog.log.entity_id})`}
                </Typography>
              </Box>

              {detailsDialog.log.ip_address && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Dirección IP
                  </Typography>
                  <Typography variant="body1">
                    {detailsDialog.log.ip_address}
                  </Typography>
                </Box>
              )}

              {detailsDialog.log.details && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Detalles del Cambio
                  </Typography>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      bgcolor: 'grey.50',
                      maxHeight: 400,
                      overflow: 'auto',
                    }}
                  >
                    <pre
                      style={{
                        margin: 0,
                        fontFamily: 'monospace',
                        fontSize: '0.875rem',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {JSON.stringify(parseDetails(detailsDialog.log.details), null, 2)}
                    </pre>
                  </Paper>
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDetails} variant="contained">
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
