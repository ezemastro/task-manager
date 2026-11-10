import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Stack,
  Typography,
  TextField,
  Button,
  Chip,
  Checkbox,
  IconButton,
  Alert,
  CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import LabelIcon from '@mui/icons-material/Label';
import { apiClient, type Tag } from '../services/apiClient';

interface ProjectTagsDialogProps {
  open: boolean;
  projectId: number;
  projectName: string;
  assignedTags: Tag[];
  onClose: () => void;
  onChanged: () => void;
}

const DEFAULT_COLOR = '#1976d2';

export default function ProjectTagsDialog({
  open,
  projectId,
  projectName,
  assignedTags,
  onClose,
  onChanged,
}: ProjectTagsDialogProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [localAssigned, setLocalAssigned] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // New tag form
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(DEFAULT_COLOR);

  // Inline editing
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(DEFAULT_COLOR);

  // Delete confirmation
  const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);
  const [deletingTag, setDeletingTag] = useState(false);

  // Cargar las etiquetas de la organización al abrir el diálogo.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    apiClient
      .getTags()
      .then((tags) => setAllTags(tags))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Error al cargar las etiquetas');
      })
      .finally(() => setLoading(false));
  }, [open]);

  // Sincronizar las etiquetas asignadas desde el prop mientras el diálogo está abierto.
  useEffect(() => {
    if (!open) return;
    setLocalAssigned(assignedTags.map((tag) => tag.id));
  }, [open, assignedTags]);

  const assignedTagObjects = allTags.filter((tag) => localAssigned.includes(tag.id));

  const handleToggle = async (tag: Tag, checked: boolean) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (checked) {
        await apiClient.addTagToProject(projectId, { tag_id: tag.id });
        setLocalAssigned((prev) => (prev.includes(tag.id) ? prev : [...prev, tag.id]));
      } else {
        await apiClient.removeTagFromProject(projectId, tag.id);
        setLocalAssigned((prev) => prev.filter((id) => id !== tag.id));
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar la etiqueta');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveAssigned = async (tagId: number) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.removeTagFromProject(projectId, tagId);
      setLocalAssigned((prev) => prev.filter((id) => id !== tagId));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al remover la etiqueta');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (tag: Tag) => {
    setEditingTagId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color || DEFAULT_COLOR);
  };

  const cancelEdit = () => {
    setEditingTagId(null);
    setEditName('');
    setEditColor(DEFAULT_COLOR);
  };

  const saveEdit = async () => {
    if (editingTagId === null || !editName.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.updateTag(editingTagId, { name: editName.trim(), color: editColor });
      const refreshed = await apiClient.getTags();
      setAllTags(refreshed);
      setEditingTagId(null);
      setEditName('');
      setEditColor(DEFAULT_COLOR);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar la etiqueta');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!tagToDelete || deletingTag) return;
    setDeletingTag(true);
    setError('');
    try {
      await apiClient.deleteTag(tagToDelete.id);
      const refreshed = await apiClient.getTags();
      setAllTags(refreshed);
      setLocalAssigned((prev) => prev.filter((id) => id !== tagToDelete.id));
      setTagToDelete(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar la etiqueta');
    } finally {
      setDeletingTag(false);
    }
  };

  const handleCreate = async () => {
    if (!newTagName.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const created = await apiClient.createTag({ name: newTagName.trim(), color: newTagColor });
      const refreshed = await apiClient.getTags();
      setAllTags(refreshed);
      await apiClient.addTagToProject(projectId, { tag_id: created.id });
      setLocalAssigned((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
      setNewTagName('');
      setNewTagColor(DEFAULT_COLOR);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la etiqueta');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LabelIcon /> Etiquetas del proyecto {projectName ? `· ${projectName}` : ''}
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Stack spacing={3}>
            {error && <Alert severity="error">{error}</Alert>}

            {/* Asignadas */}
            <Box>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                Asignadas
              </Typography>
              {assignedTagObjects.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Sin etiquetas asignadas.
                </Typography>
              ) : (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {assignedTagObjects.map((tag) => (
                    <Chip
                      key={tag.id}
                      label={tag.name}
                      sx={{
                        bgcolor: tag.color || undefined,
                        color: tag.color ? '#fff' : undefined,
                      }}
                      onDelete={() => handleRemoveAssigned(tag.id)}
                      deleteIcon={<DeleteIcon />}
                    />
                  ))}
                </Stack>
              )}
            </Box>

            {/* Todas las etiquetas */}
            <Box>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                Todas las etiquetas
              </Typography>
              {allTags.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No hay etiquetas en tu organización.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {allTags.map((tag) => {
                    const isAssigned = localAssigned.includes(tag.id);
                    const isEditing = editingTagId === tag.id;
                    return (
                      <Box
                        key={tag.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          flexWrap: 'wrap',
                          opacity: busy && !isEditing ? 0.6 : 1,
                        }}
                      >
                        <Checkbox
                          checked={isAssigned}
                          disabled={busy}
                          onChange={(e) => handleToggle(tag, e.target.checked)}
                        />
                        {isEditing ? (
                          <>
                            <TextField
                              size="small"
                              label="Nombre"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              sx={{ minWidth: 140 }}
                            />
                            <TextField
                              type="color"
                              size="small"
                              value={editColor}
                              onChange={(e) => setEditColor(e.target.value)}
                              sx={{ width: 60 }}
                            />
                            <Button size="small" variant="contained" onClick={saveEdit} disabled={busy || !editName.trim()}>
                              Guardar
                            </Button>
                            <Button size="small" onClick={cancelEdit} disabled={busy}>
                              Cancelar
                            </Button>
                          </>
                        ) : (
                          <>
                            <Chip
                              label={tag.name}
                              sx={{
                                bgcolor: tag.color || undefined,
                                color: tag.color ? '#fff' : undefined,
                              }}
                            />
                            <IconButton size="small" onClick={() => startEdit(tag)} disabled={busy} aria-label={`Editar etiqueta ${tag.name}`}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => setTagToDelete(tag)}
                              disabled={busy}
                              aria-label={`Eliminar etiqueta ${tag.name}`}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </>
                        )}
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </Box>

            {/* Nueva etiqueta */}
            <Box>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                Nueva etiqueta
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <TextField
                  size="small"
                  label="Nombre"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  sx={{ minWidth: 160 }}
                />
                <TextField
                  type="color"
                  size="small"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  sx={{ width: 60 }}
                />
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={handleCreate}
                  disabled={busy || !newTagName.trim()}
                >
                  Crear y asignar
                </Button>
              </Stack>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cerrar
        </Button>
      </DialogActions>

      {/* Confirmación de eliminación de etiqueta */}
      <Dialog
        open={tagToDelete !== null}
        onClose={() => !deletingTag && setTagToDelete(null)}
      >
        <DialogTitle>¿Eliminar etiqueta?</DialogTitle>
        <DialogContent>
          <Typography>
            ¿Estás seguro de que quieres eliminar la etiqueta &quot;{tagToDelete?.name}&quot;? Esta acción no se puede deshacer.
          </Typography>
          <Alert severity="warning" sx={{ mt: 2 }}>
            Eliminar esta etiqueta también la quitará de los proyectos y etapas que la tengan asignada.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTagToDelete(null)} disabled={deletingTag}>
            Cancelar
          </Button>
          <Button onClick={confirmDelete} color="error" variant="contained" disabled={deletingTag}>
            {deletingTag ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
