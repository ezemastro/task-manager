import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Stack,
  Button,
  Chip,
  Divider,
  IconButton,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  Paper,
  Autocomplete,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Link,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LabelIcon from '@mui/icons-material/Label';
import CommentIcon from '@mui/icons-material/Comment';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import { apiClient, type StageDetail, type Tag, type CreateCommentRequest, type User } from '../services/apiClient';

export default function StageDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [stage, setStage] = useState<StageDetail | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddTagDialog, setShowAddTagDialog] = useState(false);
  const [showCreateTagDialog, setShowCreateTagDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#1976d2');
  const [commentContent, setCommentContent] = useState('');
  const [commentAuthor, setCommentAuthor] = useState(() => {
    // Obtener el nombre del autor desde localStorage como valor inicial
    return localStorage.getItem('commentAuthor') || '';
  });

  // Estados para edición de comentarios
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editCommentContent, setEditCommentContent] = useState('');

  // Estados para edición inline de la etapa
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [editingResponsible, setEditingResponsible] = useState(false);
  const [editResponsible, setEditResponsible] = useState<number | null>(null);
  const [editingStartDate, setEditingStartDate] = useState(false);
  const [editStartDate, setEditStartDate] = useState('');
  const [editingEstimatedDate, setEditingEstimatedDate] = useState(false);
  const [editEstimatedDate, setEditEstimatedDate] = useState('');
  const [editingCompletedDate, setEditingCompletedDate] = useState(false);
  const [editCompletedDate, setEditCompletedDate] = useState('');

  // Estados para edición inline de fecha intermedia de la etapa
  const [editingIntermediateDate, setEditingIntermediateDate] = useState(false);
  const [editIntermediateDate, setEditIntermediateDate] = useState('');
  const [editingIntermediateDateNote, setEditingIntermediateDateNote] = useState(false);
  const [editIntermediateDateNote, setEditIntermediateDateNote] = useState('');

  const fetchStageDetail = useCallback(async () => {
    if (!id) return;
    
    setLoading(true);
    setError('');
    try {
      const stageData = await apiClient.getStage(Number(id));
      setStage(stageData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar etapa';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchStageDetail();
      fetchAllTags();
      fetchUsers();
    }
  }, [id, fetchStageDetail]);

  const fetchUsers = async () => {
    try {
      const usersData = await apiClient.getUsers();
      setUsers(usersData);
    } catch (err) {
      console.error('Error al cargar usuarios:', err);
    }
  };

  const fetchAllTags = async () => {
    try {
      const tags = await apiClient.getTags();
      setAllTags(tags);
    } catch (err) {
      console.error('Error al cargar tags:', err);
    }
  };

  const handleCompleteStage = async () => {
    if (!id) return;
    
    try {
      await apiClient.completeStage(Number(id));
      await fetchStageDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al completar etapa';
      setError(message);
    }
  };

  const handleUncompleteStage = async () => {
    if (!id) return;
    
    try {
      await apiClient.uncompleteStage(Number(id));
      await fetchStageDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al reabrir etapa';
      setError(message);
    }
  };

  const handleDeleteStage = async () => {
    if (!id) return;
    
    setDeleting(true);
    try {
      await apiClient.deleteStage(Number(id));
      navigate(-1); // Volver a la vista anterior
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al eliminar etapa';
      setError(message);
      setShowDeleteDialog(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleAddTag = async () => {
    if (!id || !selectedTag) return;
    
    try {
      await apiClient.addTagToStage(Number(id), { tag_id: selectedTag.id });
      setShowAddTagDialog(false);
      setSelectedTag(null);
      await fetchStageDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al agregar etiqueta';
      setError(message);
    }
  };

  const handleRemoveTag = async (tagId: number) => {
    if (!id) return;
    
    try {
      await apiClient.removeTagFromStage(Number(id), tagId);
      await fetchStageDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al remover etiqueta';
      setError(message);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    
    try {
      await apiClient.createTag({ name: newTagName, color: newTagColor });
      setShowCreateTagDialog(false);
      setNewTagName('');
      setNewTagColor('#1976d2');
      await fetchAllTags();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al crear etiqueta';
      setError(message);
    }
  };

  const handleAddComment = async () => {
    if (!id || !commentContent.trim() || !commentAuthor.trim()) return;
    
    // Guardar el nombre del autor en localStorage para futuros comentarios
    localStorage.setItem('commentAuthor', commentAuthor);
    
    const commentData: CreateCommentRequest = {
      stage_id: Number(id),
      content: commentContent,
      author: commentAuthor,
    };

    try {
      await apiClient.createComment(commentData);
      setCommentContent('');
      await fetchStageDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al agregar comentario';
      setError(message);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    try {
      await apiClient.deleteComment(commentId);
      await fetchStageDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al eliminar comentario';
      setError(message);
    }
  };

  const startEditingComment = (commentId: number, currentContent: string) => {
    setEditingCommentId(commentId);
    setEditCommentContent(currentContent);
  };

  const handleUpdateComment = async (commentId: number) => {
    if (!editCommentContent.trim()) return;
    
    try {
      await apiClient.updateComment(commentId, { content: editCommentContent });
      setEditingCommentId(null);
      setEditCommentContent('');
      await fetchStageDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al actualizar comentario';
      setError(message);
    }
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditCommentContent('');
  };

  // Funciones de edición inline
  const handleSaveName = async () => {
    if (!id || !editName.trim()) return;
    try {
      await apiClient.updateStage(Number(id), { name: editName });
      setEditingName(false);
      await fetchStageDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al actualizar nombre';
      setError(message);
    }
  };

  const handleSaveResponsible = async () => {
    if (!id) return;
    try {
      await apiClient.updateStage(Number(id), { 
        responsible_id: editResponsible || null 
      });
      setEditingResponsible(false);
      await fetchStageDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al actualizar responsable';
      setError(message);
    }
  };

  const handleSaveStartDate = async () => {
    if (!id) return;
    try {
      await apiClient.updateStage(Number(id), { 
        start_date: editStartDate || null 
      });
      setEditingStartDate(false);
      await fetchStageDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al actualizar fecha de inicio';
      setError(message);
    }
  };

  const handleSaveEstimatedDate = async () => {
    if (!id) return;
    try {
      await apiClient.updateStage(Number(id), { 
        estimated_end_date: editEstimatedDate || null 
      });
      setEditingEstimatedDate(false);
      await fetchStageDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al actualizar fecha estimada';
      setError(message);
    }
  };

  const handleSaveCompletedDate = async () => {
    if (!id) return;
    try {
      await apiClient.updateStage(Number(id), { 
        completed_date: editCompletedDate || null 
      });
      setEditingCompletedDate(false);
      await fetchStageDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al actualizar fecha de finalización';
      setError(message);
    }
  };

  const handleSaveIntermediateDate = async () => {
    if (!id) return;
    try {
      await apiClient.updateStage(Number(id), { 
        intermediate_date: editIntermediateDate || null 
      });
      setEditingIntermediateDate(false);
      await fetchStageDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al actualizar fecha intermedia';
      setError(message);
    }
  };

  const handleSaveIntermediateDateNote = async () => {
    if (!id) return;
    try {
      await apiClient.updateStage(Number(id), { 
        intermediate_date_note: editIntermediateDateNote || null 
      });
      setEditingIntermediateDateNote(false);
      await fetchStageDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al actualizar nota de fecha intermedia';
      setError(message);
    }
  };

  const startEditingName = () => {
    setEditName(stage?.name || '');
    setEditingName(true);
  };

  const startEditingResponsible = () => {
    setEditResponsible(stage?.responsible_id || null);
    setEditingResponsible(true);
  };

  const startEditingStartDate = () => {
    setEditStartDate(stage?.start_date ? stage.start_date.split('T')[0] : '');
    setEditingStartDate(true);
  };

  const startEditingEstimatedDate = () => {
    setEditEstimatedDate(stage?.estimated_end_date ? stage.estimated_end_date.split('T')[0] : '');
    setEditingEstimatedDate(true);
  };

  const startEditingCompletedDate = () => {
    setEditCompletedDate(stage?.completed_date ? stage.completed_date.split('T')[0] : '');
    setEditingCompletedDate(true);
  };

  const startEditingIntermediateDate = () => {
    setEditIntermediateDate(stage?.intermediate_date ? stage.intermediate_date.split('T')[0] : '');
    setEditingIntermediateDate(true);
  };

  const startEditingIntermediateDateNote = () => {
    setEditIntermediateDateNote(stage?.intermediate_date_note || '');
    setEditingIntermediateDateNote(true);
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 8, textAlign: 'center' }}>
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Cargando etapa...
        </Typography>
      </Container>
    );
  }

  if (!stage) {
    return (
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Alert severity="error">Etapa no encontrada</Alert>
        <Button onClick={() => navigate(-1)} sx={{ mt: 2 }}>
          Volver
        </Button>
      </Container>
    );
  }

  const availableTags = allTags.filter(
    tag => !stage.tags.some(stageTag => stageTag.id === tag.id)
  );

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
        <IconButton onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flexGrow: 1 }}>
          {editingName ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                size="small"
                autoFocus
                fullWidth
              />
              <IconButton color="primary" onClick={handleSaveName} size="small">
                <SaveIcon />
              </IconButton>
              <IconButton onClick={() => setEditingName(false)} size="small">
                <CloseIcon />
              </IconButton>
            </Stack>
          ) : (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h4" component="h1">
                {stage.name}
              </Typography>
              <IconButton size="small" onClick={startEditingName}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Stack>
          )}
          {stage.project_name && stage.project_id && (
            <Typography variant="body2" color="text.secondary">
              Proyecto:{' '}
              <Link
                component={RouterLink}
                to={`/projects/${stage.project_id}`}
                sx={{
                  color: 'primary.main',
                  textDecoration: 'none',
                  '&:hover': {
                    textDecoration: 'underline',
                  },
                }}
              >
                {stage.project_name}
              </Link>
            </Typography>
          )}
        </Box>
        <Chip
          label={`Etapa ${stage.order_number}`}
          color="default"
          variant="outlined"
        />
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteIcon />}
          onClick={() => setShowDeleteDialog(true)}
        >
          Eliminar
        </Button>
        {!stage.is_completed ? (
          <Button
            variant="contained"
            color="success"
            startIcon={<CheckCircleIcon />}
            onClick={handleCompleteStage}
          >
            Marcar como Completada
          </Button>
        ) : (
          <Button
            variant="outlined"
            color="warning"
            onClick={handleUncompleteStage}
          >
            ↺ Reabrir Etapa
          </Button>
        )}
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Información de la etapa */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Estado
              </Typography>
              <Chip
                label={stage.is_completed ? 'Completada' : 'En Proceso'}
                color={stage.is_completed ? 'success' : 'primary'}
                icon={stage.is_completed ? <CheckCircleIcon /> : undefined}
              />
            </Box>

            <Divider />

            {/* Sección de Responsable y Fechas - Editable inline */}
            <Box>
              {/* Responsable */}
              <Box sx={{ mb: 3 }}>
                <Stack direction="row" justifyContent="start" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Responsable
                  </Typography>
                  {!editingResponsible && (
                    <IconButton size="small" onClick={startEditingResponsible}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  )}
                </Stack>
                {editingResponsible ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <FormControl size="small" fullWidth>
                      <InputLabel>Responsable</InputLabel>
                      <Select
                        value={editResponsible || ''}
                        onChange={(e) => setEditResponsible(e.target.value ? Number(e.target.value) : null)}
                        label="Responsable"
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
                    <IconButton color="primary" onClick={handleSaveResponsible} size="small">
                      <SaveIcon />
                    </IconButton>
                    <IconButton onClick={() => setEditingResponsible(false)} size="small">
                      <CloseIcon />
                    </IconButton>
                  </Stack>
                ) : stage.responsible_name ? (
                  <>
                    <Typography variant="body1">
                      {stage.responsible_name}
                      {stage.responsible_role && ` • ${stage.responsible_role}`}
                    </Typography>
                    {stage.responsible_email && (
                      <Typography variant="caption" color="text.secondary">
                        {stage.responsible_email}
                      </Typography>
                    )}
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary" fontStyle="italic">
                    Sin asignar
                  </Typography>
                )}
              </Box>

              <Divider sx={{ mb: 3 }} />

              {/* Fechas en fila */}
              <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap' }}>
                {/* Fecha de inicio */}
                <Box sx={{ flex: 1, minWidth: 200 }}>
                  <Stack direction="row" justifyContent="start" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Fecha de inicio
                    </Typography>
                    {!editingStartDate && (
                      <IconButton size="small" onClick={startEditingStartDate}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Stack>
                  {editingStartDate ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <TextField
                        type="date"
                        value={editStartDate}
                        onChange={(e) => setEditStartDate(e.target.value)}
                        size="small"
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                      />
                      <IconButton color="primary" onClick={handleSaveStartDate} size="small">
                        <SaveIcon />
                      </IconButton>
                      <IconButton onClick={() => setEditingStartDate(false)} size="small">
                        <CloseIcon />
                      </IconButton>
                    </Stack>
                  ) : stage.start_date ? (
                    <Typography variant="body2">
                      {new Date(stage.start_date).toLocaleDateString()}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary" fontStyle="italic">
                      Sin fecha
                    </Typography>
                  )}
                </Box>

                {/* Fecha límite estimada */}
                <Box sx={{ flex: 1, minWidth: 200 }}>
                  <Stack direction="row" justifyContent="start" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Fecha límite estimada
                    </Typography>
                    {!editingEstimatedDate && (
                      <IconButton size="small" onClick={startEditingEstimatedDate}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Stack>
                  {editingEstimatedDate ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <TextField
                        type="date"
                        value={editEstimatedDate}
                        onChange={(e) => setEditEstimatedDate(e.target.value)}
                        size="small"
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                      />
                      <IconButton color="primary" onClick={handleSaveEstimatedDate} size="small">
                        <SaveIcon />
                      </IconButton>
                      <IconButton onClick={() => setEditingEstimatedDate(false)} size="small">
                        <CloseIcon />
                      </IconButton>
                    </Stack>
                  ) : stage.estimated_end_date ? (
                    <Typography variant="body2">
                      {new Date(stage.estimated_end_date).toLocaleDateString()}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary" fontStyle="italic">
                      Sin fecha
                    </Typography>
                  )}
                </Box>

                {/* Fecha de finalización (solo si está completada) */}
                {stage.is_completed ? (
                  <Box sx={{ flex: 1, minWidth: 200 }}>
                    <Stack direction="row" justifyContent="start" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Fecha de finalización
                      </Typography>
                      {!editingCompletedDate && (
                        <IconButton size="small" onClick={startEditingCompletedDate}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Stack>
                    {editingCompletedDate ? (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <TextField
                          type="date"
                          value={editCompletedDate}
                          onChange={(e) => setEditCompletedDate(e.target.value)}
                          size="small"
                          fullWidth
                          InputLabelProps={{ shrink: true }}
                        />
                        <IconButton color="primary" onClick={handleSaveCompletedDate} size="small">
                          <SaveIcon />
                        </IconButton>
                        <IconButton onClick={() => setEditingCompletedDate(false)} size="small">
                          <CloseIcon />
                        </IconButton>
                      </Stack>
                    ) : stage.completed_date ? (
                      <Typography variant="body2">
                        {new Date(stage.completed_date).toLocaleDateString()}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary" fontStyle="italic">
                        Sin fecha
                      </Typography>
                    )}
                  </Box>
                ): null}
              </Stack>

              {/* Fecha intermedia de la etapa */}
              <Divider sx={{ my: 3 }} />
              
              <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                Fecha Intermedia
              </Typography>

              <Stack spacing={2}>
                {/* Fecha intermedia */}
                <Box>
                  <Stack direction="row" justifyContent="start" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Fecha
                    </Typography>
                    {!editingIntermediateDate && (
                      <IconButton size="small" onClick={startEditingIntermediateDate}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Stack>
                  {editingIntermediateDate ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <TextField
                        type="date"
                        value={editIntermediateDate}
                        onChange={(e) => setEditIntermediateDate(e.target.value)}
                        size="small"
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                      />
                      <IconButton color="primary" onClick={handleSaveIntermediateDate} size="small">
                        <SaveIcon />
                      </IconButton>
                      <IconButton onClick={() => setEditingIntermediateDate(false)} size="small">
                        <CloseIcon />
                      </IconButton>
                    </Stack>
                  ) : stage.intermediate_date ? (
                    <Typography variant="body2">
                      {new Date(stage.intermediate_date).toLocaleDateString()}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary" fontStyle="italic">
                      Sin fecha
                    </Typography>
                  )}
                </Box>

                {/* Comentario de fecha intermedia */}
                <Box>
                  <Stack direction="row" justifyContent="start" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Comentario
                    </Typography>
                    {!editingIntermediateDateNote && (
                      <IconButton size="small" onClick={startEditingIntermediateDateNote}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Stack>
                  {editingIntermediateDateNote ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <TextField
                        value={editIntermediateDateNote}
                        onChange={(e) => setEditIntermediateDateNote(e.target.value)}
                        size="small"
                        fullWidth
                        multiline
                        rows={2}
                        placeholder="Escribe un comentario sobre esta fecha..."
                      />
                      <Stack direction="column" spacing={0.5}>
                        <IconButton color="primary" onClick={handleSaveIntermediateDateNote} size="small">
                          <SaveIcon />
                        </IconButton>
                        <IconButton onClick={() => setEditingIntermediateDateNote(false)} size="small">
                          <CloseIcon />
                        </IconButton>
                      </Stack>
                    </Stack>
                  ) : stage.intermediate_date_note ? (
                    <Typography variant="body2">
                      {stage.intermediate_date_note}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary" fontStyle="italic">
                      Sin comentario
                    </Typography>
                  )}
                </Box>
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Etiquetas */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <LabelIcon /> Etiquetas
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setShowCreateTagDialog(true)}
              >
                Crear Etiqueta
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setShowAddTagDialog(true)}
                disabled={availableTags.length === 0}
              >
                Agregar Etiqueta
              </Button>
            </Stack>
          </Stack>

          {stage.tags.length === 0 ? (
            <Alert severity="info">No hay etiquetas asignadas a esta etapa.</Alert>
          ) : (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {stage.tags.map((tag) => (
                <Chip
                  key={tag.id}
                  label={tag.name}
                  sx={{
                    bgcolor: tag.color || undefined,
                    color: tag.color ? '#fff' : undefined,
                  }}
                  onDelete={() => handleRemoveTag(tag.id)}
                  deleteIcon={<DeleteIcon />}
                />
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Comentarios */}
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <CommentIcon /> Comentarios ({stage.comments.length})
          </Typography>

          {/* Formulario para agregar comentario */}
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Agregar Comentario
            </Typography>
            <Stack spacing={2}>
              <TextField
                fullWidth
                label="Tu nombre"
                value={commentAuthor}
                onChange={(e) => setCommentAuthor(e.target.value)}
                size="small"
              />
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Comentario"
                value={commentContent}
                onChange={(e) => setCommentContent(e.target.value)}
              />
              <Button
                variant="contained"
                onClick={handleAddComment}
                disabled={!commentContent.trim() || !commentAuthor.trim()}
              >
                Publicar Comentario
              </Button>
            </Stack>
          </Paper>

          {/* Lista de comentarios */}
          {stage.comments.length === 0 ? (
            <Alert severity="info">No hay comentarios todavía.</Alert>
          ) : (
            <List>
              {stage.comments.map((comment, index) => (
                <Box key={comment.id}>
                  <ListItem
                    alignItems="flex-start"
                    secondaryAction={
                      editingCommentId === comment.id ? (
                        <Stack direction="row" spacing={1}>
                          <IconButton
                            edge="end"
                            aria-label="save"
                            onClick={() => handleUpdateComment(comment.id)}
                            color="primary"
                            size="small"
                          >
                            <SaveIcon />
                          </IconButton>
                          <IconButton
                            edge="end"
                            aria-label="cancel"
                            onClick={cancelEditComment}
                            size="small"
                          >
                            <CloseIcon />
                          </IconButton>
                        </Stack>
                      ) : (
                        <Stack direction="row" spacing={1}>
                          <IconButton
                            edge="end"
                            aria-label="edit"
                            onClick={() => startEditingComment(comment.id, comment.content)}
                            size="small"
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            edge="end"
                            aria-label="delete"
                            onClick={() => handleDeleteComment(comment.id)}
                            size="small"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Stack>
                      )
                    }
                  >
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="subtitle2">{comment.author}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(comment.created_at).toLocaleString()}
                          </Typography>
                        </Stack>
                      }
                      secondary={
                        editingCommentId === comment.id ? (
                          <TextField
                            fullWidth
                            multiline
                            rows={3}
                            value={editCommentContent}
                            onChange={(e) => setEditCommentContent(e.target.value)}
                            size="small"
                            sx={{ mt: 1 }}
                            autoFocus
                          />
                        ) : (
                          <Typography variant="body2" sx={{ mt: 1 }}>
                            {comment.content}
                          </Typography>
                        )
                      }
                    />
                  </ListItem>
                  {index < stage.comments.length - 1 && <Divider />}
                </Box>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      {/* Dialog para agregar etiqueta existente */}
      <Dialog open={showAddTagDialog} onClose={() => setShowAddTagDialog(false)}>
        <DialogTitle>Agregar Etiqueta</DialogTitle>
        <DialogContent sx={{ minWidth: 400 }}>
          <Autocomplete
            options={availableTags}
            getOptionLabel={(option) => option.name}
            value={selectedTag}
            onChange={(_, newValue) => setSelectedTag(newValue)}
            renderInput={(params) => <TextField {...params} label="Seleccionar etiqueta" />}
            renderOption={(props, option) => {
              const { key, ...otherProps } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
              return (
                <li key={key} {...otherProps}>
                  <Chip
                    label={option.name}
                    size="small"
                    sx={{
                      bgcolor: option.color || undefined,
                      color: option.color ? '#fff' : undefined,
                    }}
                  />
                </li>
              );
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAddTagDialog(false)}>Cancelar</Button>
          <Button onClick={handleAddTag} variant="contained" disabled={!selectedTag}>
            Agregar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog para crear nueva etiqueta */}
      <Dialog open={showCreateTagDialog} onClose={() => setShowCreateTagDialog(false)}>
        <DialogTitle>Crear Nueva Etiqueta</DialogTitle>
        <DialogContent sx={{ minWidth: 400 }}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              fullWidth
              label="Nombre de la etiqueta"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
            />
            <TextField
              fullWidth
              type="color"
              label="Color"
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
            />
            <Box>
              <Typography variant="caption" color="text.secondary">
                Vista previa:
              </Typography>
              <Chip
                label={newTagName || 'Nueva etiqueta'}
                sx={{
                  bgcolor: newTagColor,
                  color: '#fff',
                  mt: 1,
                }}
              />
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreateTagDialog(false)}>Cancelar</Button>
          <Button
            onClick={handleCreateTag}
            variant="contained"
            disabled={!newTagName.trim()}
          >
            Crear
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo de confirmación de eliminación */}
      <Dialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
      >
        <DialogTitle>¿Eliminar etapa?</DialogTitle>
        <DialogContent>
          <Typography>
            Esta acción eliminará permanentemente la etapa "{stage?.name}".
            Esta acción no se puede deshacer.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteDialog(false)} disabled={deleting}>
            Cancelar
          </Button>
          <Button onClick={handleDeleteStage} color="error" variant="contained" disabled={deleting}>
            {deleting ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
