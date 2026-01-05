import { useState, useEffect } from 'react';
import { 
  AppBar, 
  Toolbar, 
  Typography, 
  Button, 
  Box, 
  IconButton, 
  Menu, 
  MenuItem, 
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  Chip,
  CircularProgress,
} from '@mui/material';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import HomeIcon from '@mui/icons-material/Home';
// import PeopleIcon from '@mui/icons-material/People';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import BusinessIcon from '@mui/icons-material/Business';
import LayersIcon from '@mui/icons-material/Layers';
import ViewListIcon from '@mui/icons-material/ViewList';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LockIcon from '@mui/icons-material/Lock';
import LogoutIcon from '@mui/icons-material/Logout';
import EditIcon from '@mui/icons-material/Edit';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import AddIcon from '@mui/icons-material/Add';
import { apiClient, type AuthUser } from '../services/apiClient';

interface Organization {
  id: number;
  name: string;
  role: string;
}

export default function NavigationBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [orgAnchorEl, setOrgAnchorEl] = useState<null | HTMLElement>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  
  const [showOrgDialog, setShowOrgDialog] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgError, setOrgError] = useState('');
  const [orgSuccess, setOrgSuccess] = useState(false);
  
  const [showCreateOrgDialog, setShowCreateOrgDialog] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [createOrgError, setCreateOrgError] = useState('');
  const [creatingOrg, setCreatingOrg] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await apiClient.getMe();
        setUser(userData);
      } catch {
        // Si falla, el usuario no está autenticado
      }
    };
    fetchUser();
  }, []);

  const loadOrganizations = async () => {
    setLoadingOrgs(true);
    try {
      const response = await fetch('/api/auth/my-organizations', {
        credentials: 'include',
      });
      const data = await response.json();
      if (response.ok) {
        setOrganizations(data);
      }
    } catch (error) {
      console.error('Error al cargar organizaciones:', error);
    } finally {
      setLoadingOrgs(false);
    }
  };

  const handleSwitchOrganization = async (accountId: number, orgId: number) => {
    try {
      const response = await fetch('/api/auth/select-organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, organizationId: orgId }),
        credentials: 'include',
      });

      if (response.ok) {
        // Recargar la página para actualizar el contexto
        window.location.reload();
      }
    } catch (error) {
      console.error('Error al cambiar organización:', error);
    }
  };

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleOrgMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setOrgAnchorEl(event.currentTarget);
    loadOrganizations();
  };

  const handleOrgMenuClose = () => {
    setOrgAnchorEl(null);
  };

  const handlePasswordDialogOpen = () => {
    setShowPasswordDialog(true);
    handleMenuClose();
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordSuccess(false);
  };

  const handlePasswordDialogClose = () => {
    setShowPasswordDialog(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordSuccess(false);
  };

  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    try {
      await apiClient.changePassword({
        currentPassword: currentPassword || undefined,
        newPassword,
      });
      setPasswordSuccess(true);
      setTimeout(() => {
        handlePasswordDialogClose();
      }, 1500);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Error al cambiar la contraseña');
    }
  };

  const handleLogout = async () => {
    try {
      await apiClient.logout();
      navigate('/login');
    } catch {
      // En caso de error, igual redirigir al login
      navigate('/login');
    }
  };

  const handleOrgDialogOpen = () => {
    setShowOrgDialog(true);
    handleMenuClose();
    setOrgName(user?.organizationName || '');
    setOrgError('');
    setOrgSuccess(false);
  };

  const handleOrgDialogClose = () => {
    setShowOrgDialog(false);
    setOrgName('');
    setOrgError('');
    setOrgSuccess(false);
  };

  const handleUpdateOrganization = async () => {
    setOrgError('');
    setOrgSuccess(false);

    if (!orgName.trim()) {
      setOrgError('El nombre de la organización no puede estar vacío');
      return;
    }

    if (!user?.organizationId) {
      setOrgError('No se pudo identificar la organización');
      return;
    }

    try {
      await apiClient.updateOrganization(user.organizationId, orgName.trim());
      setOrgSuccess(true);
      
      // Actualizar el nombre en el estado local
      setUser(prev => prev ? { ...prev, organizationName: orgName.trim() } : null);
      
      setTimeout(() => {
        handleOrgDialogClose();
      }, 1500);
    } catch (err) {
      setOrgError(err instanceof Error ? err.message : 'Error al actualizar el nombre');
    }
  };

  const handleCreateOrgDialogOpen = () => {
    setShowCreateOrgDialog(true);
    handleOrgMenuClose();
    setNewOrgName('');
    setCreateOrgError('');
    setCreatingOrg(false);
  };

  const handleCreateOrgDialogClose = () => {
    setShowCreateOrgDialog(false);
    setNewOrgName('');
    setCreateOrgError('');
    setCreatingOrg(false);
  };

  const handleCreateOrganization = async () => {
    if (!newOrgName.trim()) {
      setCreateOrgError('El nombre de la organización es requerido');
      return;
    }

    setCreatingOrg(true);
    setCreateOrgError('');

    try {
      const response = await fetch('/api/auth/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newOrgName }),
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al crear organización');
      }

      // Cambiar a la nueva organización automáticamente
      if (user?.accountId) {
        await handleSwitchOrganization(user.accountId, data.id);
      }
    } catch (err) {
      setCreateOrgError(err instanceof Error ? err.message : 'Error al crear organización');
      setCreatingOrg(false);
    }
  };

  return (
    <>
      <AppBar position="sticky">
        <Toolbar>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 4 }}>
            <Typography variant="h6" component="div">
              {user?.organizationName || 'Gestión de Obras'}
            </Typography>
            <IconButton
              size="small"
              color="inherit"
              onClick={handleOrgDialogOpen}
              sx={{ 
                opacity: 0.7,
                '&:hover': { opacity: 1 }
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
            <Chip
              icon={<SwapHorizIcon />}
              label="Cambiar"
              onClick={handleOrgMenuOpen}
              size="small"
              sx={{
                ml: 1,
                bgcolor: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                '&:hover': {
                  bgcolor: 'rgba(255, 255, 255, 0.3)',
                },
                '& .MuiChip-icon': {
                  color: 'white',
                },
              }}
            />
          </Box>

        <Box sx={{ flexGrow: 1, display: 'flex', gap: 1 }}>
          <Button
            component={RouterLink}
            to="/"
            color="inherit"
            startIcon={<HomeIcon />}
            variant={isActive('/') ? 'outlined' : 'text'}
            sx={{ 
              borderColor: 'white',
              '&:hover': { borderColor: 'white' }
            }}
          >
            Proyectos
          </Button>

          <Button
            component={RouterLink}
            to="/stages"
            color="inherit"
            startIcon={<ViewListIcon />}
            variant={isActive('/stages') ? 'outlined' : 'text'}
            sx={{ 
              borderColor: 'white',
              '&:hover': { borderColor: 'white' }
            }}
          >
            Etapas en Proceso
          </Button>

          <Button
            component={RouterLink}
            to="/completed-projects"
            color="inherit"
            startIcon={<CheckCircleIcon />}
            variant={isActive('/completed-projects') ? 'outlined' : 'text'}
            sx={{ 
              borderColor: 'white',
              '&:hover': { borderColor: 'white' }
            }}
          >
            Obras Completadas
          </Button>

          <Button
            component={RouterLink}
            to="/paused-projects"
            color="inherit"
            startIcon={<PauseCircleIcon />}
            variant={isActive('/paused-projects') ? 'outlined' : 'text'}
            sx={{ 
              borderColor: 'white',
              '&:hover': { borderColor: 'white' }
            }}
          >
            Obras Paralizadas
          </Button>

          {/* <Button
            component={RouterLink}
            to="/users"
            color="inherit"
            startIcon={<PeopleIcon />}
            variant={isActive('/users') ? 'outlined' : 'text'}
            sx={{ 
              borderColor: 'white',
              '&:hover': { borderColor: 'white' }
            }}
          >
            Panel Usuarios
          </Button> */}

          <Button
            component={RouterLink}
            to="/users-management"
            color="inherit"
            startIcon={<ManageAccountsIcon />}
            variant={isActive('/users-management') ? 'outlined' : 'text'}
            sx={{ 
              borderColor: 'white',
              '&:hover': { borderColor: 'white' }
            }}
          >
            Usuarios
          </Button>

          <Button
            component={RouterLink}
            to="/clients-management"
            color="inherit"
            startIcon={<BusinessIcon />}
            variant={isActive('/clients-management') ? 'outlined' : 'text'}
            sx={{ 
              borderColor: 'white',
              '&:hover': { borderColor: 'white' }
            }}
          >
            Clientes
          </Button>

          <Button
            component={RouterLink}
            to="/stage-templates"
            color="inherit"
            startIcon={<LayersIcon />}
            variant={isActive('/stage-templates') ? 'outlined' : 'text'}
            sx={{ 
              borderColor: 'white',
              '&:hover': { borderColor: 'white' }
            }}
          >
            Etapas Predefinidas
          </Button>

          <Button
            component={RouterLink}
            to="/audit-logs"
            color="inherit"
            startIcon={<LayersIcon />}
            variant={isActive('/audit-logs') ? 'outlined' : 'text'}
            sx={{ 
              borderColor: 'white',
              '&:hover': { borderColor: 'white' }
            }}
          >
            Historial
          </Button>
        </Box>

        <IconButton
          color="inherit"
          onClick={handleMenuOpen}
          sx={{ ml: 2 }}
        >
          <AccountCircleIcon />
        </IconButton>
        
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
        >
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              {user?.name || 'Usuario'}
            </Typography>
          </MenuItem>
          <MenuItem disabled>
            <Typography variant="caption" color="text.secondary">
              {user?.email || ''}
            </Typography>
          </MenuItem>
          <Divider />
          <MenuItem onClick={handlePasswordDialogOpen}>
            <LockIcon fontSize="small" sx={{ mr: 1 }} />
            Cambiar contraseña
          </MenuItem>
          <MenuItem onClick={handleLogout}>
            <LogoutIcon fontSize="small" sx={{ mr: 1 }} />
            Cerrar sesión
          </MenuItem>
        </Menu>

        {/* Menú de organizaciones */}
        <Menu
          anchorEl={orgAnchorEl}
          open={Boolean(orgAnchorEl)}
          onClose={handleOrgMenuClose}
          PaperProps={{
            sx: { minWidth: 250 }
          }}
        >
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary" fontWeight="bold">
              Tus Organizaciones
            </Typography>
          </MenuItem>
          <Divider />
          
          {loadingOrgs ? (
            <MenuItem disabled>
              <CircularProgress size={20} sx={{ mr: 1 }} />
              Cargando...
            </MenuItem>
          ) : (
            <>
              {organizations.map((org) => (
                <MenuItem
                  key={org.id}
                  onClick={() => {
                    if (user?.accountId) {
                      handleSwitchOrganization(user.accountId, org.id);
                    }
                  }}
                  selected={user?.organizationId === org.id}
                >
                  <Box>
                    <Typography variant="body2">{org.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {org.role}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
              <Divider />
              <MenuItem onClick={handleCreateOrgDialogOpen}>
                <AddIcon fontSize="small" sx={{ mr: 1 }} />
                Crear Nueva Organización
              </MenuItem>
            </>
          )}
        </Menu>
      </Toolbar>
    </AppBar>

    <Dialog open={showPasswordDialog} onClose={handlePasswordDialogClose} maxWidth="sm" fullWidth>
      <DialogTitle>Cambiar Contraseña</DialogTitle>
      <DialogContent>
        {passwordSuccess && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Contraseña cambiada exitosamente
          </Alert>
        )}
        {passwordError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {passwordError}
          </Alert>
        )}
        <TextField
          autoFocus
          margin="dense"
          label="Contraseña Actual"
          type="password"
          fullWidth
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          helperText="Dejar vacío si aún no tienes contraseña configurada"
          sx={{ mb: 2 }}
        />
        <TextField
          margin="dense"
          label="Nueva Contraseña"
          type="password"
          fullWidth
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          helperText="Mínimo 6 caracteres"
          sx={{ mb: 2 }}
        />
        <TextField
          margin="dense"
          label="Confirmar Nueva Contraseña"
          type="password"
          fullWidth
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handlePasswordDialogClose}>Cancelar</Button>
        <Button onClick={handleChangePassword} variant="contained" disabled={!newPassword || !confirmPassword}>
          Cambiar
        </Button>
      </DialogActions>
    </Dialog>

    <Dialog open={showOrgDialog} onClose={handleOrgDialogClose} maxWidth="sm" fullWidth>
      <DialogTitle>Editar Nombre de la Organización</DialogTitle>
      <DialogContent>
        {orgSuccess && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Nombre actualizado exitosamente
          </Alert>
        )}
        {orgError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {orgError}
          </Alert>
        )}
        <TextField
          autoFocus
          margin="dense"
          label="Nombre de la Organización"
          type="text"
          fullWidth
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          helperText="Este nombre aparecerá en la barra de navegación"
          sx={{ mt: 2 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleOrgDialogClose}>Cancelar</Button>
        <Button onClick={handleUpdateOrganization} variant="contained" disabled={!orgName.trim()}>
          Guardar
        </Button>
      </DialogActions>
    </Dialog>

    {/* Diálogo crear organización */}
    <Dialog open={showCreateOrgDialog} onClose={handleCreateOrgDialogClose} maxWidth="sm" fullWidth>
      <DialogTitle>Crear Nueva Organización</DialogTitle>
      <DialogContent>
        {createOrgError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {createOrgError}
          </Alert>
        )}
        <TextField
          autoFocus
          margin="dense"
          label="Nombre de la Organización"
          type="text"
          fullWidth
          value={newOrgName}
          onChange={(e) => setNewOrgName(e.target.value)}
          helperText="Serás el administrador de esta organización"
          sx={{ mt: 2 }}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && newOrgName.trim() && !creatingOrg) {
              handleCreateOrganization();
            }
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCreateOrgDialogClose} disabled={creatingOrg}>
          Cancelar
        </Button>
        <Button 
          onClick={handleCreateOrganization} 
          variant="contained" 
          disabled={!newOrgName.trim() || creatingOrg}
          startIcon={creatingOrg ? <CircularProgress size={20} /> : <AddIcon />}
        >
          {creatingOrg ? 'Creando...' : 'Crear'}
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
}
