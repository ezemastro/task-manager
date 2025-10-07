import { useEffect, useState, useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Paper,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Stack,
  Button,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WarningIcon from '@mui/icons-material/Warning';
import { apiClient, type Stage, type User, type Client } from '../services/apiClient';

type SortOption = 'project' | 'stage' | 'responsible' | 'deadline' | 'status';

export default function AllStagesView() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all'); // all, active, completed
  const [needsDataFilter, setNeedsDataFilter] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('project');
  const [showFilters, setShowFilters] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError('');

    try {
      const [stagesData, usersData, clientsData] = await Promise.all([
        apiClient.getStages(),
        apiClient.getUsers(),
        apiClient.getClients(),
      ]);

      setStages(stagesData);
      setUsers(usersData);
      setClients(clientsData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar las etapas';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtrar y ordenar etapas
  const filteredAndSortedStages = useMemo(() => {
    let filtered = [...stages];

    // Filtro por búsqueda
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(term) ||
          s.project_name?.toLowerCase().includes(term) ||
          s.responsible_name?.toLowerCase().includes(term) ||
          s.client_name?.toLowerCase().includes(term)
      );
    }

    // Filtro por usuario responsable
    if (selectedUser) {
      filtered = filtered.filter((s) => s.responsible_id?.toString() === selectedUser);
    }

    // Filtro por cliente
    if (selectedClient) {
      filtered = filtered.filter((s) => s.client_id?.toString() === selectedClient);
    }

    // Filtro por estado
    if (statusFilter === 'active') {
      filtered = filtered.filter((s) => !s.is_completed);
    } else if (statusFilter === 'completed') {
      filtered = filtered.filter((s) => s.is_completed);
    }

    // Filtro por datos faltantes
    if (needsDataFilter) {
      filtered = filtered.filter(
        (s) => !s.is_completed && (!s.responsible_id || !s.start_date || !s.estimated_end_date)
      );
    }

    // Ordenar
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'project':
          return (a.project_name || '').localeCompare(b.project_name || '');
        case 'stage':
          return a.name.localeCompare(b.name);
        case 'responsible':
          return (a.responsible_name || '').localeCompare(b.responsible_name || '');
        case 'deadline': {
          if (!a.estimated_end_date && !b.estimated_end_date) return 0;
          if (!a.estimated_end_date) return 1;
          if (!b.estimated_end_date) return -1;
          return new Date(a.estimated_end_date).getTime() - new Date(b.estimated_end_date).getTime();
        }
        case 'status':
          return (a.is_completed ? 1 : 0) - (b.is_completed ? 1 : 0);
        default:
          return 0;
      }
    });

    return filtered;
  }, [stages, searchTerm, selectedUser, selectedClient, statusFilter, needsDataFilter, sortBy]);

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ py: 8, textAlign: 'center' }}>
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Cargando etapas...
        </Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="xl" sx={{ py: 8 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button variant="contained" onClick={fetchData}>
          Reintentar
        </Button>
      </Container>
    );
  }

  const needsData = (stage: Stage) =>
    stage.start_date && !stage.is_completed && (!stage.responsible_id || !stage.estimated_end_date);

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1">
          Todas las Etapas
        </Typography>
        <Stack direction="row" spacing={2}>
          <Button
            variant="outlined"
            startIcon={<FilterListIcon />}
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? 'Ocultar' : 'Mostrar'} Filtros
          </Button>
          <Button variant="outlined" onClick={fetchData}>
            Actualizar
          </Button>
        </Stack>
      </Box>

      {/* Panel de Filtros */}
      {showFilters && (
        <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
          <Stack spacing={2}>
            {/* Primera fila */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ flex: '1 1 400px', minWidth: '200px' }}>
                <TextField
                  fullWidth
                  label="Buscar"
                  placeholder="Buscar por etapa, proyecto, responsable o cliente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>
            </Box>

            {/* Segunda fila */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ flex: '1 1 180px', minWidth: '150px' }}>
                <FormControl fullWidth>
                  <InputLabel>Responsable</InputLabel>
                  <Select
                    value={selectedUser}
                    onChange={(e) => setSelectedUser(e.target.value)}
                    label="Responsable"
                  >
                    <MenuItem value="">
                      <em>Todos</em>
                    </MenuItem>
                    {users.map((user) => (
                      <MenuItem key={user.id} value={user.id.toString()}>
                        {user.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ flex: '1 1 180px', minWidth: '150px' }}>
                <FormControl fullWidth>
                  <InputLabel>Cliente</InputLabel>
                  <Select
                    value={selectedClient}
                    onChange={(e) => setSelectedClient(e.target.value)}
                    label="Cliente"
                  >
                    <MenuItem value="">
                      <em>Todos</em>
                    </MenuItem>
                    {clients.map((client) => (
                      <MenuItem key={client.id} value={client.id.toString()}>
                        {client.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ flex: '1 1 180px', minWidth: '150px' }}>
                <FormControl fullWidth>
                  <InputLabel>Estado</InputLabel>
                  <Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    label="Estado"
                  >
                    <MenuItem value="all">Todas</MenuItem>
                    <MenuItem value="active">En proceso</MenuItem>
                    <MenuItem value="completed">Completadas</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ flex: '1 1 180px', minWidth: '150px' }}>
                <FormControl fullWidth>
                  <InputLabel>Ordenar por</InputLabel>
                  <Select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    label="Ordenar por"
                  >
                    <MenuItem value="project">Proyecto</MenuItem>
                    <MenuItem value="stage">Etapa</MenuItem>
                    <MenuItem value="responsible">Responsable</MenuItem>
                    <MenuItem value="deadline">Fecha límite</MenuItem>
                    <MenuItem value="status">Estado</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ flex: '1 1 200px', minWidth: '150px' }}>
                <FormControl fullWidth>
                  <InputLabel>Filtros especiales</InputLabel>
                  <Select
                    value={needsDataFilter ? 'needs-data' : 'none'}
                    onChange={(e) => setNeedsDataFilter(e.target.value === 'needs-data')}
                    label="Filtros especiales"
                  >
                    <MenuItem value="none">Ninguno</MenuItem>
                    <MenuItem value="needs-data">Solo etapas sin datos completos</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </Box>

            {/* Filtros activos */}
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ gap: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Filtros activos:
                </Typography>
                {searchTerm && (
                  <Chip
                    label={`Búsqueda: "${searchTerm}"`}
                    size="small"
                    onDelete={() => setSearchTerm('')}
                  />
                )}
                {selectedUser && (
                  <Chip
                    label={`Responsable: ${users.find((u) => u.id.toString() === selectedUser)?.name}`}
                    size="small"
                    onDelete={() => setSelectedUser('')}
                  />
                )}
                {selectedClient && (
                  <Chip
                    label={`Cliente: ${clients.find((c) => c.id.toString() === selectedClient)?.name}`}
                    size="small"
                    onDelete={() => setSelectedClient('')}
                  />
                )}
                {statusFilter !== 'all' && (
                  <Chip
                    label={`Estado: ${statusFilter === 'active' ? 'En proceso' : 'Completadas'}`}
                    size="small"
                    onDelete={() => setStatusFilter('all')}
                  />
                )}
                {needsDataFilter && (
                  <Chip
                    label="Sin datos completos"
                    size="small"
                    color="warning"
                    onDelete={() => setNeedsDataFilter(false)}
                  />
                )}
                {(searchTerm || selectedUser || selectedClient || statusFilter !== 'all' || needsDataFilter) && (
                  <Button
                    size="small"
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedUser('');
                      setSelectedClient('');
                      setStatusFilter('all');
                      setNeedsDataFilter(false);
                    }}
                  >
                    Limpiar todo
                  </Button>
                )}
              </Stack>
            </Box>
          </Stack>
        </Paper>
      )}

      {/* Resultados */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Mostrando {filteredAndSortedStages.length} de {stages.length} etapas
        </Typography>
      </Box>

      {filteredAndSortedStages.length === 0 ? (
        <Alert severity="info">
          {stages.length === 0
            ? 'No hay etapas en el sistema.'
            : 'No se encontraron etapas con los filtros aplicados.'}
        </Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>Proyecto</strong></TableCell>
                <TableCell><strong>Etapa</strong></TableCell>
                <TableCell><strong>Responsable</strong></TableCell>
                <TableCell><strong>Cliente</strong></TableCell>
                <TableCell><strong>Fecha Inicio</strong></TableCell>
                <TableCell><strong>Fecha Límite</strong></TableCell>
                <TableCell><strong>Estado</strong></TableCell>
                <TableCell align="right"><strong>Acciones</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredAndSortedStages.map((stage) => (
                <TableRow 
                  key={stage.id}
                  sx={{
                    bgcolor: needsData(stage) ? 'warning.lighter' : 'inherit',
                    '&:hover': { bgcolor: needsData(stage) ? 'warning.light' : 'action.hover' },
                  }}
                >
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {stage.project_name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2">{stage.name}</Typography>
                      {needsData(stage) && (
                        <Chip
                          icon={<WarningIcon />}
                          label="Faltan datos"
                          color="warning"
                          size="small"
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color={stage.responsible_id ? 'inherit' : 'warning.main'}>
                      {stage.responsible_name || 'Sin asignar'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {stage.client_name || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color={stage.start_date ? 'inherit' : 'text.secondary'}>
                      {stage.start_date
                        ? new Date(stage.start_date).toLocaleDateString('es-ES')
                        : 'Sin fecha'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color={stage.estimated_end_date ? 'inherit' : 'text.secondary'}>
                      {stage.estimated_end_date
                        ? new Date(stage.estimated_end_date).toLocaleDateString('es-ES')
                        : 'Sin fecha'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={
                        stage.is_completed 
                          ? 'Completada' 
                          : stage.start_date 
                            ? 'En proceso' 
                            : 'Pendiente'
                      }
                      color={
                        stage.is_completed 
                          ? 'success' 
                          : stage.start_date 
                            ? 'primary' 
                            : 'default'
                      }
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      component={RouterLink}
                      to={`/stages/${stage.id}`}
                      color="primary"
                      size="small"
                      aria-label="Ver detalles"
                    >
                      <OpenInNewIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Container>
  );
}
