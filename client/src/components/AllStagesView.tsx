import { useEffect, useState, useMemo, useRef } from 'react';
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
  Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import { apiClient, type Stage, type User, type Client } from '../services/apiClient';
import DeadlineChip from './DeadlineChip';

type SortOption = 'project' | 'stage' | 'responsible' | 'deadline' | 'intermediate_date';

const STORAGE_KEY = 'allStagesView_filters';
const SCROLL_KEY = 'allStagesView_scroll';

export default function AllStagesView() {
  const scrollPositionRef = useRef<number>(0);
  const [stages, setStages] = useState<Stage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Restaurar filtros desde sessionStorage
  const getInitialFilters = () => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return {};
      }
    }
    return {};
  };

  const initialFilters = getInitialFilters();

  // Filtros con valores iniciales restaurados
  const [searchTerm, setSearchTerm] = useState<string>(initialFilters.searchTerm || '');
  const [selectedUser, setSelectedUser] = useState<string>(initialFilters.selectedUser || '');
  const [selectedClient, setSelectedClient] = useState<string>(initialFilters.selectedClient || '');
  const [sortBy, setSortBy] = useState<SortOption>(initialFilters.sortBy || 'project');
  const [showFilters, setShowFilters] = useState<boolean>(initialFilters.showFilters ?? true);

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

  // Guardar filtros en sessionStorage cuando cambien
  useEffect(() => {
    const filters = {
      searchTerm,
      selectedUser,
      selectedClient,
      sortBy,
      showFilters,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  }, [searchTerm, selectedUser, selectedClient, sortBy, showFilters]);

  // Guardar posición de scroll antes de navegar
  useEffect(() => {
    const handleScroll = () => {
      scrollPositionRef.current = window.scrollY;
      sessionStorage.setItem(SCROLL_KEY, window.scrollY.toString());
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Restaurar posición de scroll cuando se carga la página
  useEffect(() => {
    const savedScroll = sessionStorage.getItem(SCROLL_KEY);
    if (savedScroll && !loading) {
      // Usar setTimeout para asegurarse de que el DOM esté completamente renderizado
      setTimeout(() => {
        window.scrollTo(0, parseInt(savedScroll, 10));
      }, 100);
    }
  }, [loading]);

  // Filtrar y ordenar etapas - SOLO MOSTRAR ETAPAS EN PROCESO
  const filteredAndSortedStages = useMemo(() => {
    // Filtrar solo etapas en proceso (tienen start_date y no están completadas)
    let filtered = stages.filter((s) => !s.is_completed && s.start_date);

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
        case 'intermediate_date': {
          if (!a.intermediate_date && !b.intermediate_date) return 0;
          if (!a.intermediate_date) return 1;
          if (!b.intermediate_date) return -1;
          return new Date(a.intermediate_date).getTime() - new Date(b.intermediate_date).getTime();
        }
        default:
          return 0;
      }
    });

    return filtered;
  }, [stages, searchTerm, selectedUser, selectedClient, sortBy]);

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

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1">
          Etapas en Proceso
        </Typography>
        <Button
          variant="outlined"
          startIcon={<FilterListIcon />}
          onClick={() => setShowFilters(!showFilters)}
        >
          {showFilters ? 'Ocultar' : 'Mostrar'} Filtros
        </Button>
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
                  <InputLabel>Ordenar por</InputLabel>
                  <Select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    label="Ordenar por"
                  >
                    <MenuItem value="project">Proyecto</MenuItem>
                    <MenuItem value="stage">Etapa</MenuItem>
                    <MenuItem value="responsible">Responsable</MenuItem>
                    <MenuItem value="intermediate_date">Fecha Intermedia</MenuItem>
                    <MenuItem value="deadline">Fecha Límite</MenuItem>
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
                {(searchTerm || selectedUser || selectedClient) && (
                  <Button
                    size="small"
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedUser('');
                      setSelectedClient('');
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
          {stages.filter(s => !s.is_completed && s.start_date).length === 0
            ? 'No hay etapas en proceso en este momento.'
            : 'No se encontraron etapas con los filtros aplicados.'}
        </Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: '15%' }}><strong>Proyecto</strong></TableCell>
                <TableCell sx={{ width: '15%' }}><strong>Etapa</strong></TableCell>
                <TableCell sx={{ width: '12%' }}><strong>Responsable</strong></TableCell>
                <TableCell sx={{ width: '10%' }}><strong>Fecha Intermedia</strong></TableCell>
                <TableCell sx={{ width: '10%' }}><strong>Fecha Límite</strong></TableCell>
                <TableCell sx={{ width: '15%' }}><strong>Etiquetas</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredAndSortedStages.map((stage) => {
                const recentComment = stage.recent_comments && stage.recent_comments.length > 0 
                  ? stage.recent_comments[0] 
                  : null;
                const truncatedContent = recentComment 
                  ? (recentComment.content.length > 150 
                      ? recentComment.content.substring(0, 150) + '...' 
                      : recentComment.content)
                  : null;
                
                const handleStageClick = () => {
                  // Guardar posición de scroll antes de navegar
                  sessionStorage.setItem(SCROLL_KEY, window.scrollY.toString());
                };

                return (
                  <>
                    <TableRow 
                      key={stage.id}
                      component={RouterLink}
                      to={`/stages/${stage.id}`}
                      onClick={handleStageClick}
                      sx={{
                        textDecoration: 'none',
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {stage.project_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{stage.name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color={stage.responsible_id ? 'inherit' : 'warning.main'}>
                          {stage.responsible_name || 'Sin asignar'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {stage.intermediate_date ? (
                          <Tooltip 
                            title={stage.intermediate_date_note || 'Sin comentario'} 
                            arrow
                            placement="top"
                          >
                            <Box sx={{ display: 'inline-block', cursor: 'help' }}>
                              <DeadlineChip
                                date={stage.intermediate_date}
                                isCompleted={false}
                                size="small"
                                showIcon={false}
                              />
                            </Box>
                          </Tooltip>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            -
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {stage.estimated_end_date ? (
                          <DeadlineChip
                            date={stage.estimated_end_date}
                            isCompleted={stage.is_completed}
                            size="small"
                            showIcon={false}
                          />
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            Sin fecha
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {stage.tags && stage.tags.length > 0 ? (
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                            {stage.tags.slice(0, 3).map((tag) => (
                              <Chip
                                key={tag.id}
                                label={tag.name}
                                size="small"
                                sx={{
                                  bgcolor: tag.color || undefined,
                                  color: tag.color ? '#fff' : undefined,
                                  fontSize: '0.7rem',
                                  height: 20,
                                }}
                              />
                            ))}
                            {stage.tags.length > 3 && (
                              <Chip
                                label={`+${stage.tags.length - 3}`}
                                size="small"
                                sx={{
                                  fontSize: '0.7rem',
                                  height: 20,
                                }}
                              />
                            )}
                          </Stack>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            -
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                    
                    {/* Fila de comentario justo debajo de la etapa */}
                    {truncatedContent && recentComment && (
                      <TableRow key={`${stage.id}-comment`}>
                        <TableCell 
                          colSpan={6} 
                          sx={{ 
                            py: 1, 
                            bgcolor: 'action.hover',
                            borderBottom: 2,
                            borderColor: 'divider'
                          }}
                        >
                          <Stack direction="row" spacing={1} alignItems="baseline" sx={{ px: 1 }}>
                            <Typography 
                              variant="caption" 
                              color="primary"
                              sx={{ 
                                fontWeight: 600,
                                flexShrink: 0
                              }}
                            >
                              💬 {recentComment.author}:
                            </Typography>
                            <Typography 
                              variant="caption" 
                              color="text.secondary"
                              sx={{ 
                                fontStyle: 'italic',
                              }}
                            >
                              {truncatedContent}
                            </Typography>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Container>
  );
}
