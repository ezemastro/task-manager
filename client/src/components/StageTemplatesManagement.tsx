import { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
} from '@mui/icons-material';
import { apiClient, type StageTemplate, type User } from '../services/apiClient';

export default function StageTemplatesManagement() {
  const [templates, setTemplates] = useState<StageTemplate[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<StageTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    order_number: 1,
    default_responsible_id: '',
    estimated_duration_days: '',
  });

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getStageTemplates();
      setTemplates(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar las plantillas');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await apiClient.getUsers();
      setUsers(data);
    } catch (err) {
      console.error('Error al cargar usuarios:', err);
    }
  };

  useEffect(() => {
    fetchTemplates();
    fetchUsers();
  }, []);

  const handleOpenCreate = () => {
    setSelectedTemplate(null);
    setFormData({
      name: '',
      order_number: templates.length + 1,
      default_responsible_id: '',
      estimated_duration_days: '',
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (template: StageTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      order_number: template.order_number,
      default_responsible_id: template.default_responsible_id?.toString() || '',
      estimated_duration_days: template.estimated_duration_days?.toString() || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError('El nombre es requerido');
      return;
    }

    try {
      const data = {
        name: formData.name,
        order_number: formData.order_number,
        default_responsible_id: formData.default_responsible_id ? parseInt(formData.default_responsible_id) : undefined,
        estimated_duration_days: formData.estimated_duration_days ? parseInt(formData.estimated_duration_days) : undefined,
      };

      if (selectedTemplate) {
        await apiClient.updateStageTemplate(selectedTemplate.id, data);
      } else {
        await apiClient.createStageTemplate(data);
      }
      
      setDialogOpen(false);
      fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar la plantilla');
    }
  };

  const handleDelete = (template: StageTemplate) => {
    setSelectedTemplate(template);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedTemplate) return;

    try {
      await apiClient.deleteStageTemplate(selectedTemplate.id);
      setDeleteDialogOpen(false);
      setSelectedTemplate(null);
      fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar la plantilla');
      setDeleteDialogOpen(false);
    }
  };

  const handleReorder = async (template: StageTemplate, direction: 'up' | 'down') => {
    const currentIndex = templates.findIndex(t => t.id === template.id);
    if (
      (direction === 'up' && currentIndex === 0) ||
      (direction === 'down' && currentIndex === templates.length - 1)
    ) {
      return;
    }

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const otherTemplate = templates[newIndex];

    try {
      await Promise.all([
        apiClient.updateStageTemplate(template.id, { order_number: otherTemplate.order_number }),
        apiClient.updateStageTemplate(otherTemplate.id, { order_number: template.order_number }),
      ]);
      fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al reordenar');
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Gestión de Etapas Predefinidas
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
        >
          Nueva Etapa
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Alert severity="info" sx={{ mb: 2 }}>
        Estas plantillas se duplicarán automáticamente al crear nuevos proyectos. 
        Al completar una etapa, la siguiente se creará automáticamente según este orden.
      </Alert>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell width="80"><strong>Orden</strong></TableCell>
              <TableCell><strong>Nombre</strong></TableCell>
              <TableCell><strong>Responsable por Defecto</strong></TableCell>
              <TableCell><strong>Duración Estimada (días)</strong></TableCell>
              <TableCell align="right"><strong>Acciones</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : templates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  No hay plantillas de etapas. Crea la primera para que los proyectos se generen automáticamente con etapas.
                </TableCell>
              </TableRow>
            ) : (
              templates.map((template, index) => (
                <TableRow key={template.id}>
                  <TableCell>{template.order_number}</TableCell>
                  <TableCell><strong>{template.name}</strong></TableCell>
                  <TableCell>{template.default_responsible_name || 'Sin asignar'}</TableCell>
                  <TableCell>{template.estimated_duration_days || '-'}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      onClick={() => handleReorder(template, 'up')}
                      disabled={index === 0}
                      size="small"
                    >
                      <ArrowUpIcon />
                    </IconButton>
                    <IconButton
                      onClick={() => handleReorder(template, 'down')}
                      disabled={index === templates.length - 1}
                      size="small"
                    >
                      <ArrowDownIcon />
                    </IconButton>
                    <IconButton onClick={() => handleOpenEdit(template)} color="primary">
                      <EditIcon />
                    </IconButton>
                    <IconButton onClick={() => handleDelete(template)} color="error">
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{selectedTemplate ? 'Editar' : 'Crear'} Plantilla de Etapa</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Nombre de la Etapa"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Número de Orden"
              type="number"
              value={formData.order_number}
              onChange={(e) => setFormData({ ...formData, order_number: parseInt(e.target.value) })}
              fullWidth
              required
            />
            <FormControl fullWidth>
              <InputLabel>Responsable por Defecto</InputLabel>
              <Select
                value={formData.default_responsible_id}
                onChange={(e) => setFormData({ ...formData, default_responsible_id: e.target.value })}
                label="Responsable por Defecto"
              >
                <MenuItem value="">
                  <em>Sin asignar</em>
                </MenuItem>
                {users.map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Duración Estimada (días)"
              type="number"
              value={formData.estimated_duration_days}
              onChange={(e) => setFormData({ ...formData, estimated_duration_days: e.target.value })}
              fullWidth
              helperText="Opcional: se usará para calcular la fecha estimada de finalización"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} variant="contained">
            {selectedTemplate ? 'Guardar' : 'Crear'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Confirmar Eliminación</DialogTitle>
        <DialogContent>
          <Typography>
            ¿Estás seguro de que deseas eliminar la plantilla "{selectedTemplate?.name}"?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Esto no afectará las etapas ya creadas en proyectos existentes.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained">
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
