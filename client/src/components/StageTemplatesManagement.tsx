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
  Tabs,
  Tab,
  Chip,
  Stack,
  Switch,
  FormControlLabel,
  FormHelperText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
} from '@mui/icons-material';
import { apiClient, type StageTemplate, type User } from '../services/apiClient';
import { PROJECT_TYPES, PROJECT_TYPE_LABELS, type ProjectType } from '../utils/projectTypes';
import {
  STAGE_KIND_LABELS,
  STAGE_MILESTONE_LABELS,
  STAGE_MILESTONE_SHORT_LABELS,
  STAGE_MILESTONE_HELP,
  countsWorkTime,
  type StageKind,
  type StageMilestone,
} from '../utils/stageAttributes';

interface TemplateFormData {
  name: string;
  order_number: number;
  default_responsible_id: string;
  estimated_duration_days: string;
  stage_kind: StageKind;
  milestone: StageMilestone | '';
  is_required: boolean;
  counts_work_time: boolean;
}

const EMPTY_ATTRIBUTES = {
  stage_kind: 'execution' as StageKind,
  milestone: '' as const,
  is_required: false,
  counts_work_time: true,
};

// Chips chicos con la configuración de control de cada etapa.
function StageAttributeChips({ template }: { template: StageTemplate }) {
  const chips: Array<{ label: string; color?: 'primary' | 'warning' | 'default' }> = [];
  if (template.milestone) chips.push({ label: STAGE_MILESTONE_SHORT_LABELS[template.milestone], color: 'primary' });
  if (template.stage_kind === 'control') chips.push({ label: 'Control' });
  if (template.is_required) chips.push({ label: 'Obligatoria', color: 'warning' });
  if (!countsWorkTime(template)) chips.push({ label: 'No suma tiempo' });
  if (chips.length === 0) return null;
  return (
    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
      {chips.map((chip) => (
        <Chip key={chip.label} label={chip.label} size="small" variant="outlined" color={chip.color ?? 'default'} sx={{ height: 20, fontSize: '0.7rem' }} />
      ))}
    </Stack>
  );
}

export default function StageTemplatesManagement() {
  // Cada tipo de proyecto tiene su propia lista de etapas predefinidas.
  const [projectType, setProjectType] = useState<ProjectType>('obra_nueva');
  const [templates, setTemplates] = useState<StageTemplate[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<StageTemplate | null>(null);
  const [formData, setFormData] = useState<TemplateFormData>({
    name: '',
    order_number: 1,
    default_responsible_id: '',
    estimated_duration_days: '',
    ...EMPTY_ATTRIBUTES,
  });
  const hasDeliveryStage = templates.some((t) => t.milestone === 'delivery');

  const fetchTemplates = async (type: ProjectType = projectType) => {
    try {
      setLoading(true);
      const data = await apiClient.getStageTemplates(type);
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
    fetchUsers();
  }, []);

  useEffect(() => {
    setTemplates([]);
    fetchTemplates(projectType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectType]);

  const handleOpenCreate = () => {
    setSelectedTemplate(null);
    setFormData({
      name: '',
      // Va al final: después del número más alto (por si quedaron huecos de antes).
      order_number: templates.reduce((max, t) => Math.max(max, t.order_number), 0) + 1,
      default_responsible_id: '',
      estimated_duration_days: '',
      ...EMPTY_ATTRIBUTES,
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
      stage_kind: template.stage_kind ?? 'execution',
      milestone: template.milestone ?? '',
      is_required: Boolean(template.is_required),
      counts_work_time: countsWorkTime(template),
    });
    setDialogOpen(true);
  };

  // Otra etapa de este tipo que ya tiene la función elegida (se le quitará).
  const milestoneOwner = formData.milestone
    ? templates.find((t) => t.milestone === formData.milestone && t.id !== selectedTemplate?.id)
    : undefined;

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError('El nombre es requerido');
      return;
    }

    try {
      const data = {
        name: formData.name,
        order_number: formData.order_number,
        default_responsible_id: formData.default_responsible_id ? parseInt(formData.default_responsible_id) : null,
        estimated_duration_days: formData.estimated_duration_days ? parseInt(formData.estimated_duration_days) : null,
        stage_kind: formData.stage_kind,
        milestone: formData.milestone || null,
        is_required: formData.is_required,
        counts_work_time: formData.counts_work_time,
      };

      if (selectedTemplate) {
        await apiClient.updateStageTemplate(selectedTemplate.id, data);
      } else {
        await apiClient.createStageTemplate({ ...data, project_type: projectType });
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
      // Renumerar las que quedan para no dejar huecos (1, 2, 4…).
      const remaining = templates
        .filter((t) => t.id !== selectedTemplate.id)
        .map((t, index) => ({ id: t.id, order_number: index + 1 }));
      if (remaining.length > 0) {
        await apiClient.reorderStageTemplates(remaining);
      }
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
    const swapped = [...templates];
    [swapped[currentIndex], swapped[newIndex]] = [swapped[newIndex], swapped[currentIndex]];
    // El número de orden es siempre la posición en la lista (1, 2, 3…).
    const newTemplates = swapped.map((t, index) => ({ ...t, order_number: index + 1 }));

    // Actualizar orden local inmediatamente para UX
    setTemplates(newTemplates);

    try {
      // Enviar nuevo orden al backend
      await apiClient.reorderStageTemplates(newTemplates.map((t) => ({ id: t.id, order_number: t.order_number })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al reordenar');
      // Revertir en caso de error
      fetchTemplates();
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

      <Tabs
        value={projectType}
        onChange={(_, value: ProjectType) => setProjectType(value)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        {PROJECT_TYPES.map((type) => (
          <Tab key={type} value={type} label={PROJECT_TYPE_LABELS[type]} />
        ))}
      </Tabs>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Alert severity="info" sx={{ mb: 2 }}>
        Estas etapas se copiarán automáticamente al crear un proyecto de tipo <strong>{PROJECT_TYPE_LABELS[projectType]}</strong>.
        Al completar una etapa, la siguiente se creará automáticamente según este orden.
      </Alert>

      {!loading && templates.length > 0 && !hasDeliveryStage && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Ninguna etapa de {PROJECT_TYPE_LABELS[projectType]} marca la entrega: los proyectos nuevos de este tipo
          no medirán retraso. Editá la etapa de entrega y, en "Configuración de control", elegí la función "{STAGE_MILESTONE_LABELS.delivery}".
        </Alert>
      )}

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
                  No hay etapas predefinidas para {PROJECT_TYPE_LABELS[projectType]}. Crea la primera para que estos proyectos se generen automáticamente con etapas.
                </TableCell>
              </TableRow>
            ) : (
              templates.map((template, index) => (
                <TableRow key={template.id}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>
                    <strong>{template.name}</strong>
                    <StageAttributeChips template={template} />
                  </TableCell>
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
        <DialogTitle>
          {selectedTemplate ? 'Editar' : 'Crear'} Plantilla de Etapa · {PROJECT_TYPE_LABELS[projectType]}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Nombre de la Etapa"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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

            {/* Se define una vez por empresa: va plegado para no estorbar. */}
            <Accordion
              disableGutters
              variant="outlined"
              defaultExpanded={Boolean(selectedTemplate?.milestone || selectedTemplate?.stage_kind === 'control' || selectedTemplate?.is_required)}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="body2" color="text.secondary">Configuración de control (se define una vez)</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Tipo de etapa</InputLabel>
                    <Select
                      value={formData.stage_kind}
                      label="Tipo de etapa"
                      onChange={(e) => {
                        const stageKind = e.target.value as StageKind;
                        // En una etapa nueva, las de control por defecto no suman tiempo.
                        setFormData({
                          ...formData,
                          stage_kind: stageKind,
                          counts_work_time: selectedTemplate ? formData.counts_work_time : stageKind === 'execution',
                        });
                      }}
                    >
                      {(Object.keys(STAGE_KIND_LABELS) as StageKind[]).map((kind) => (
                        <MenuItem key={kind} value={kind}>{STAGE_KIND_LABELS[kind]}</MenuItem>
                      ))}
                    </Select>
                    <FormHelperText>Ejecución: tareas del equipo. Control: revisiones o esperas.</FormHelperText>
                  </FormControl>

                  <FormControl fullWidth size="small">
                    <InputLabel>Función</InputLabel>
                    <Select
                      value={formData.milestone}
                      label="Función"
                      onChange={(e) => setFormData({ ...formData, milestone: e.target.value as StageMilestone | '' })}
                    >
                      <MenuItem value=""><em>Ninguna</em></MenuItem>
                      {(Object.keys(STAGE_MILESTONE_LABELS) as StageMilestone[]).map((milestone) => (
                        <MenuItem key={milestone} value={milestone}>{STAGE_MILESTONE_LABELS[milestone]}</MenuItem>
                      ))}
                    </Select>
                    <FormHelperText>
                      {formData.milestone
                        ? milestoneOwner
                          ? `Hoy la tiene "${milestoneOwner.name}"; al guardar pasará a esta etapa.`
                          : STAGE_MILESTONE_HELP[formData.milestone]
                        : 'Solo una etapa por tipo de proyecto puede marcar la entrega o el cierre.'}
                    </FormHelperText>
                  </FormControl>

                  <FormControlLabel
                    control={<Switch checked={formData.is_required} onChange={(e) => setFormData({ ...formData, is_required: e.target.checked })} />}
                    label="Obligatoria (no se puede eliminar del proyecto)"
                  />
                  <FormControlLabel
                    control={<Switch checked={formData.counts_work_time} onChange={(e) => setFormData({ ...formData, counts_work_time: e.target.checked })} />}
                    label="Suma tiempo de trabajo (en el resumen anual)"
                  />
                  {selectedTemplate && (
                    <FormHelperText>Los cambios se aplican a los proyectos nuevos; los existentes conservan su configuración.</FormHelperText>
                  )}
                </Stack>
              </AccordionDetails>
            </Accordion>
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
          {selectedTemplate?.milestone === 'delivery' && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Esta etapa marca la entrega. Si la eliminás, los proyectos nuevos de tipo {PROJECT_TYPE_LABELS[projectType]} no
              medirán retraso hasta que otra etapa tenga esa función.
            </Alert>
          )}
          {selectedTemplate?.milestone === 'client_closing' && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Esta etapa marca el cierre del cliente. Si la eliminás, los proyectos nuevos de tipo {PROJECT_TYPE_LABELS[projectType]} no
              registrarán la fecha de cierre.
            </Alert>
          )}
          {selectedTemplate?.is_required && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Es una etapa obligatoria: los proyectos nuevos de este tipo ya no la tendrán.
            </Alert>
          )}
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
