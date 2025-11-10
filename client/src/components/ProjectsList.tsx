import { useEffect, useState, useMemo } from 'react';
import {
  Container,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Stack,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Chip,
  InputAdornment,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import { apiClient, type Project, type Stage, type Client } from '../services/apiClient';
import ProjectCard from './ProjectCard';
import CreateProjectModal from './CreateProjectModal';

interface ProjectWithStages extends Project {
  stages: Stage[];
}

type SortOption = 'name' | 'deadline' | 'progress' | 'recent';

export default function ProjectsList() {
  const [projects, setProjects] = useState<ProjectWithStages[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateProject, setShowCreateProject] = useState(false);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('all'); // all, today, week, month, overdue
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [showFilters, setShowFilters] = useState(false);

  const fetchProjects = async () => {
    setLoading(true);
    setError('');

    try {
      const [projectsList, clientsList] = await Promise.all([
        apiClient.getProjects({status: "active"}),
        apiClient.getClients(),
      ]);
      
      setClients(clientsList);
      
      // Cargar cada proyecto con sus etapas
      const projectsWithStages = await Promise.all(
        projectsList.map(async (project) => {
          const fullProject = await apiClient.getProject(project.id);
          return fullProject;
        })
      );

      setProjects(projectsWithStages);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar los proyectos';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  // Filtrar y ordenar proyectos
  const filteredAndSortedProjects = useMemo(() => {
    let filtered = [...projects];

    // Filtro por búsqueda
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.description?.toLowerCase().includes(term) ||
          p.client_name?.toLowerCase().includes(term)
      );
    }

    // Filtro por cliente
    if (selectedClient) {
      filtered = filtered.filter((p) => p.client_id?.toString() === selectedClient);
    }

    // Filtro por fecha
    if (dateFilter !== 'all' && filtered.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      filtered = filtered.filter((p) => {
        if (!p.deadline) return dateFilter === 'all';
        
        const deadline = new Date(p.deadline);
        deadline.setHours(0, 0, 0, 0);

        switch (dateFilter) {
          case 'today':
            return deadline.getTime() === today.getTime();
          case 'week': {
            const weekFromNow = new Date(today);
            weekFromNow.setDate(weekFromNow.getDate() + 7);
            return deadline >= today && deadline <= weekFromNow;
          }
          case 'month': {
            const monthFromNow = new Date(today);
            monthFromNow.setMonth(monthFromNow.getMonth() + 1);
            return deadline >= today && deadline <= monthFromNow;
          }
          case 'overdue':
            return deadline < today;
          default:
            return true;
        }
      });
    }

    // Ordenar
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'deadline': {
          if (!a.deadline && !b.deadline) return 0;
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        }
        case 'progress': {
          const progressA = a.stages.length > 0 
            ? (a.stages.filter(s => s.is_completed).length / a.stages.length) 
            : 0;
          const progressB = b.stages.length > 0 
            ? (b.stages.filter(s => s.is_completed).length / b.stages.length) 
            : 0;
          return progressB - progressA;
        }
        case 'recent':
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
    });

    return filtered;
  }, [projects, searchTerm, selectedClient, dateFilter, sortBy]);

  const handleRefresh = () => {
    fetchProjects();
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 8, textAlign: 'center' }}>
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Cargando proyectos...
        </Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button variant="contained" onClick={handleRefresh}>
          Reintentar
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4, px: { xs: 2, sm: 3 } }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1">
          Mis Proyectos
        </Typography>
        <Stack direction="row" spacing={2}>
          <Button 
            variant="outlined" 
            startIcon={<FilterListIcon />}
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? 'Ocultar' : 'Mostrar'} Filtros
          </Button>
          <Button variant="outlined" onClick={handleRefresh}>
            Actualizar
          </Button>
          <Button variant="contained" onClick={() => setShowCreateProject(true)}>
            + Nueva Obra
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
                  placeholder="Buscar por nombre, descripción o cliente..."
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
              <Box sx={{ flex: '1 1 200px', minWidth: '150px' }}>
                <FormControl fullWidth>
                  <InputLabel>Cliente</InputLabel>
                  <Select
                    value={selectedClient}
                    onChange={(e) => setSelectedClient(e.target.value)}
                    label="Cliente"
                  >
                    <MenuItem value="">
                      <em>Todos los clientes</em>
                    </MenuItem>
                    {clients.map((client) => (
                      <MenuItem key={client.id} value={client.id.toString()}>
                        {client.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ flex: '1 1 200px', minWidth: '150px' }}>
                <FormControl fullWidth>
                  <InputLabel>Fecha Límite</InputLabel>
                  <Select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    label="Fecha Límite"
                  >
                    <MenuItem value="all">Todas</MenuItem>
                    <MenuItem value="today">Hoy</MenuItem>
                    <MenuItem value="week">Esta semana</MenuItem>
                    <MenuItem value="month">Este mes</MenuItem>
                    <MenuItem value="overdue">Atrasadas</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ flex: '1 1 200px', minWidth: '150px' }}>
                <FormControl fullWidth>
                  <InputLabel>Ordenar por</InputLabel>
                  <Select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    label="Ordenar por"
                  >
                    <MenuItem value="recent">Más recientes</MenuItem>
                    <MenuItem value="name">Nombre (A-Z)</MenuItem>
                    <MenuItem value="deadline">Fecha límite</MenuItem>
                    <MenuItem value="progress">Progreso</MenuItem>
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
                {selectedClient && (
                  <Chip
                    label={`Cliente: ${clients.find(c => c.id.toString() === selectedClient)?.name}`}
                    size="small"
                    onDelete={() => setSelectedClient('')}
                  />
                )}
                {dateFilter !== 'all' && (
                  <Chip
                    label={`Fecha: ${dateFilter}`}
                    size="small"
                    onDelete={() => setDateFilter('all')}
                  />
                )}
                {(searchTerm || selectedClient || dateFilter !== 'all') && (
                  <Button
                    size="small"
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedClient('');
                      setDateFilter('all');
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
          Mostrando {filteredAndSortedProjects.length} de {projects.length} proyectos
        </Typography>
      </Box>

      {filteredAndSortedProjects.length === 0 ? (
        <Alert severity="info">
          {projects.length === 0 
            ? 'No hay proyectos creados. Comienza creando tu primera obra.'
            : 'No se encontraron proyectos con los filtros aplicados.'}
        </Alert>
      ) : (
        <Box 
          sx={{ 
            columnCount: {
              xs: 1,
              sm: 2,
              lg: 3,
            },
            columnGap: 1.5,
            '& > *': {
              breakInside: 'avoid',
              marginBottom: 1.5,
            }
          }}
        >
          {filteredAndSortedProjects.map((project) => (
            <ProjectCard
              key={project.id}
              projectId={project.id}
              projectName={project.name}
              projectDescription={project.description}
              clientName={project.client_name}
              deadline={project.deadline}
              stages={project.stages}
              onStageCompleted={handleRefresh}
            />
          ))}
        </Box>
      )}

      <CreateProjectModal
        open={showCreateProject}
        onClose={() => setShowCreateProject(false)}
        onSuccess={() => {
          setShowCreateProject(false);
          handleRefresh();
        }}
      />
    </Container>
  );
}
