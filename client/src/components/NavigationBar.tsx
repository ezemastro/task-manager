import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import HomeIcon from '@mui/icons-material/Home';
// import PeopleIcon from '@mui/icons-material/People';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import BusinessIcon from '@mui/icons-material/Business';
import LayersIcon from '@mui/icons-material/Layers';
import ViewListIcon from '@mui/icons-material/ViewList';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';

export default function NavigationBar() {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <AppBar position="sticky">
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 0, mr: 4 }}>
          Gestión de Obras
        </Typography>

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
        </Box>
      </Toolbar>
    </AppBar>
  );
}
