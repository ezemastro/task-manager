import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LabelIcon from '@mui/icons-material/Label';
import CommentIcon from '@mui/icons-material/Comment';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import { apiClient, type StageDetail, type Tag, type CreateCommentRequest } from '../services/apiClient';
import EditStageModal from './EditStageModal';

export default function StageDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [stage, setStage] = useState<StageDetail | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddTagDialog, setShowAddTagDialog] = useState(false);
  const [showCreateTagDialog, setShowCreateTagDialog] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
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
    }
  }, [id, fetchStageDetail]);

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
          <Typography variant="h4" component="h1">
            {stage.name}
          </Typography>
          {stage.project_name && (
            <Typography variant="body2" color="text.secondary">
              Proyecto: {stage.project_name}
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
          startIcon={<EditIcon />}
          onClick={() => setShowEditModal(true)}
        >
          Editar
        </Button>
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
        ) : null}
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

            {/* Sección de Responsable y Fechas - Solo lectura */}
            <Box>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                Asignación
              </Typography>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Responsable
                </Typography>
                {stage.responsible_name ? (
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

              {stage.estimated_end_date && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Fecha límite estimada
                  </Typography>
                  <Typography variant="body2">
                    {new Date(stage.estimated_end_date).toLocaleDateString()}
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Fechas - mostrar si hay alguna fecha */}
            {(stage.start_date || stage.completed_date || (stage.is_completed && stage.estimated_end_date)) ? (
              <>
                <Divider />
                <Stack direction="row" spacing={4} flexWrap="wrap">
                  {stage.start_date && (
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        Fecha de inicio
                      </Typography>
                      <Typography variant="body2">
                        {new Date(stage.start_date).toLocaleDateString()}
                      </Typography>
                    </Box>
                  )}
                  {stage.completed_date && (
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        Fecha de finalización
                      </Typography>
                      <Typography variant="body2">
                        {new Date(stage.completed_date).toLocaleDateString()}
                      </Typography>
                    </Box>
                  )}
                  {stage.is_completed && stage.estimated_end_date ? (
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        Fecha límite estimada
                      </Typography>
                      <Typography variant="body2">
                        {new Date(stage.estimated_end_date).toLocaleDateString()}
                      </Typography>
                    </Box>
                  ) : null}
                </Stack>
              </>
            ) : null}
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
                      <IconButton
                        edge="end"
                        aria-label="delete"
                        onClick={() => handleDeleteComment(comment.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
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
                        <Typography variant="body2" sx={{ mt: 1 }}>
                          {comment.content}
                        </Typography>
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

      {/* Modal de edición */}
      {stage && (
        <EditStageModal
          open={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSuccess={fetchStageDetail}
          stageId={stage.id}
          initialData={{
            name: stage.name,
            responsible_id: stage.responsible_id,
            start_date: stage.start_date,
            estimated_end_date: stage.estimated_end_date,
          }}
        />
      )}

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
