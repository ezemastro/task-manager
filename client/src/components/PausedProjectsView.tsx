import { useEffect, useState, useMemo } from 'react';
import {
  Container,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Stack,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Chip,
  InputAdornment,
  IconButton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import { useNavigate } from 'react-router-dom';
import { apiClient, type Project, type Stage, type Client } from '../services/apiClient';
import ProjectCard from './ProjectCard';

interface ProjectWithStages extends Project {
  stages: Stage[];
}

type SortOption = 'name' | 'deadline' | 'recent';

export default function PausedProjectsView() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectWithStages[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [showFilters, setShowFilters] = useState(false);

  const fetchProjects = async () => {
    setLoading(true);
    setError('');

    try {
      const [projectsList, clientsList] = await Promise.all([
        apiClient.getProjects({status: "paused"}),
        apiClient.getClients(),
      ]);
      
      setClients(clientsList);
      
      // Filtrar solo proyectos paralizados
      const pausedProjects = projectsList.filter(p => p.status === 'paused');
      
      // Cargar cada proyecto con sus etapas
      const projectsWithStages = await Promise.all(
        pausedProjects.map(async (project) => {
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

    // Ordenar
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'deadline':
          if (!a.deadline && !b.deadline) return 0;
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        case 'recent':
        default:
          return new Date(b.updated_at || b.created_at).getTime() - 
                 new Date(a.updated_at || a.created_at).getTime();
      }
    });

    return filtered;
  }, [projects, searchTerm, selectedClient, sortBy]);

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ py: 8, textAlign: 'center' }}>
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Cargando proyectos paralizados...
        </Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4, px: { xs: 2, sm: 3 } }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
        <IconButton onClick={() => navigate(-1)}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" component="h1" sx={{ flexGrow: 1 }}>
          Obras Paralizadas
        </Typography>
        <Chip 
          label={`${projects.length} ${projects.length === 1 ? 'obra' : 'obras'}`} 
          color="warning"
          icon={<PauseCircleIcon />}
        />
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Barra de filtros */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: showFilters ? 2 : 0 }}>
          <TextField
            placeholder="Buscar por nombre, descripción o cliente..."
            variant="outlined"
            size="small"
            fullWidth
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
          <IconButton
            onClick={() => setShowFilters(!showFilters)}
            color={showFilters ? 'primary' : 'default'}
          >
            <FilterListIcon />
          </IconButton>
        </Stack>

        {showFilters && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Cliente</InputLabel>
              <Select
                value={selectedClient}
                label="Cliente"
                onChange={(e) => setSelectedClient(e.target.value)}
              >
                <MenuItem value="">Todos</MenuItem>
                {clients.map((client) => (
                  <MenuItem key={client.id} value={client.id.toString()}>
                    {client.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Ordenar por</InputLabel>
              <Select
                value={sortBy}
                label="Ordenar por"
                onChange={(e) => setSortBy(e.target.value as SortOption)}
              >
                <MenuItem value="recent">Más recientes</MenuItem>
                <MenuItem value="name">Nombre (A-Z)</MenuItem>
                <MenuItem value="deadline">Fecha límite</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        )}
      </Paper>

      {/* Filtros activos */}
      {(searchTerm || selectedClient) && (
        <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
          {searchTerm && (
            <Chip
              label={`Buscar: ${searchTerm}`}
              onDelete={() => setSearchTerm('')}
              size="small"
            />
          )}
          {selectedClient && (
            <Chip
              label={`Cliente: ${clients.find(c => c.id.toString() === selectedClient)?.name}`}
              onDelete={() => setSelectedClient('')}
              size="small"
            />
          )}
          {(searchTerm || selectedClient) && (
            <Chip
              label="Limpiar filtros"
              onClick={() => {
                setSearchTerm('');
                setSelectedClient('');
              }}
              color="primary"
              size="small"
              variant="outlined"
            />
          )}
        </Stack>
      )}

      {/* Lista de proyectos */}
      {filteredAndSortedProjects.length === 0 ? (
        <Alert severity="info">
          {projects.length === 0
            ? 'No hay proyectos paralizados.'
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
              responsibleName={project.responsible_name}
              deadline={project.deadline}
              stages={project.stages || []}
              onStageCompleted={fetchProjects}
            />
          ))}
        </Box>
      )}
    </Container>
  );
}
