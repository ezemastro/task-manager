import { useEffect, useState } from 'react';
import { Box, Button, Container, Typography, Card, CardContent, Grid, Paper, Stepper, Step, StepLabel, StepContent } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { 
  Dashboard as DashboardIcon,
  Assignment as AssignmentIcon,
  People as PeopleIcon,
  Timeline as TimelineIcon,
  Security as SecurityIcon,
  Speed as SpeedIcon,
  AccountTree as AccountTreeIcon,
  Layers as LayersIcon
} from '@mui/icons-material';
import { apiClient } from '../services/apiClient';

const LandingPage = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        await apiClient.getMe();
        setIsAuthenticated(true);
      } catch {
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, []);

  const handleGetStarted = () => {
    navigate(isAuthenticated ? '/dashboard' : '/login');
  };

  const features = [
    {
      icon: <DashboardIcon sx={{ fontSize: 50 }} />,
      title: 'Gestión de Proyectos',
      description: 'Organiza y administra proyectos con etapas secuenciales, fechas límite y estados personalizables.'
    },
    {
      icon: <LayersIcon sx={{ fontSize: 50 }} />,
      title: 'Etapas Secuenciales',
      description: 'Define flujos de trabajo con etapas que se completan en orden, con plantillas reutilizables.'
    },
    {
      icon: <PeopleIcon sx={{ fontSize: 50 }} />,
      title: 'Gestión de Clientes',
      description: 'Administra clientes, asigna proyectos y mantén toda la información organizada.'
    },
    {
      icon: <TimelineIcon sx={{ fontSize: 50 }} />,
      title: 'Seguimiento en Tiempo Real',
      description: 'Monitorea el progreso de proyectos y etapas con actualizaciones instantáneas.'
    },
    {
      icon: <AccountTreeIcon sx={{ fontSize: 50 }} />,
      title: 'Sistema de Tags',
      description: 'Organiza y filtra proyectos usando tags personalizados por organización.'
    },
    {
      icon: <SecurityIcon sx={{ fontSize: 50 }} />,
      title: 'Multi-tenancy Seguro',
      description: 'Aislamiento completo de datos entre organizaciones con roles y permisos.'
    },
    {
      icon: <SpeedIcon sx={{ fontSize: 50 }} />,
      title: 'Logs de Auditoría',
      description: 'Registra todas las acciones importantes para trazabilidad completa.'
    },
    {
      icon: <AssignmentIcon sx={{ fontSize: 50 }} />,
      title: 'Plantillas de Etapas',
      description: 'Crea plantillas de etapas reutilizables para estandarizar procesos.'
    }
  ];

  const tutorialSteps = [
    {
      label: 'Inicio de Sesión',
      description: 'Accede a la plataforma con tu cuenta de usuario. El sistema soporta verificación de email y recuperación de contraseña.',
      image: '/screenshots/login.png'
    },
    {
      label: 'Dashboard Principal',
      description: 'Visualiza todos tus proyectos activos en el dashboard. Puedes filtrar por estado, cliente, tags y ordenar por diferentes criterios.',
      image: '/screenshots/dashboard.png'
    },
    {
      label: 'Crear Proyecto',
      description: 'Crea un nuevo proyecto especificando nombre, descripción, cliente, fecha de inicio y fin, y asigna tags para organización.',
      image: '/screenshots/create-project.png'
    },
    {
      label: 'Gestionar Etapas',
      description: 'Cada proyecto tiene etapas secuenciales. Añade etapas manualmente o usa plantillas predefinidas. Las etapas se completan en orden.',
      image: '/screenshots/stages.png'
    },
    {
      label: 'Detalles de Proyecto',
      description: 'Visualiza y edita todos los detalles de un proyecto: descripción, fechas, etapas, comentarios y archivos adjuntos.',
      image: '/screenshots/project-details.png'
    },
    {
      label: 'Gestión de Clientes',
      description: 'Administra tu cartera de clientes desde un panel centralizado. Crea, edita y asocia clientes con proyectos.',
      image: '/screenshots/clients.png'
    },
    {
      label: 'Plantillas de Etapas',
      description: 'Crea plantillas reutilizables de etapas para estandarizar flujos de trabajo y agilizar la creación de proyectos.',
      image: '/screenshots/templates.png'
    },
    {
      label: 'Proyectos Completados y Pausados',
      description: 'Accede a vistas específicas de proyectos completados o pausados para mejor organización.',
      image: '/screenshots/completed-projects.png'
    },
    {
      label: 'Logs de Auditoría',
      description: 'Revisa el historial completo de acciones en la plataforma para trazabilidad y seguridad.',
      image: '/screenshots/audit-logs.png'
    },
    {
      label: 'Administración de Usuarios',
      description: 'Gestiona usuarios, roles y permisos. Define quién tiene acceso a qué funcionalidades (solo para administradores).',
      image: '/screenshots/users.png'
    }
  ];

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh' }}>
      {/* Hero Section */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'white',
          py: { xs: 8, md: 12 },
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={4} alignItems="center">
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h2" component="h1" gutterBottom fontWeight="bold">
                MASGestión
              </Typography>
              <Typography variant="h5" paragraph sx={{ mb: 4 }}>
                Organiza, gestiona y completa proyectos con etapas secuenciales, 
                clientes, tags y seguimiento completo en tiempo real.
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleGetStarted}
                  sx={{
                    bgcolor: 'white',
                    color: 'primary.main',
                    '&:hover': { bgcolor: 'grey.100' }
                  }}
                >
                  Comenzar
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  sx={{
                    borderColor: 'white',
                    color: 'white',
                    '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' }
                  }}
                  onClick={() => {
                    document.getElementById('tutorial')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  Ver Tutorial
                </Button>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box
                sx={{
                  bgcolor: 'white',
                  borderRadius: 2,
                  overflow: 'hidden',
                  boxShadow: 5,
                  aspectRatio: '16/9'
                }}
              >
                <img
                  src="/screenshots/hero-dashboard.png"
                  alt="Dashboard principal"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                  }}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Features Section */}
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Typography variant="h3" component="h2" align="center" gutterBottom fontWeight="bold">
          Características Principales
        </Typography>
        <Typography variant="h6" align="center" color="text.secondary" paragraph sx={{ mb: 6 }}>
          Todo lo que necesitas para gestionar proyectos de manera eficiente
        </Typography>
        
        <Grid container spacing={4}>
          {features.map((feature, index) => (
            <Grid size={{ xs: 12, sm: 6, md: 3 }} key={index}>
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'transform 0.3s, box-shadow 0.3s',
                  '&:hover': {
                    transform: 'translateY(-8px)',
                    boxShadow: 6
                  }
                }}
              >
                <CardContent sx={{ flexGrow: 1, textAlign: 'center' }}>
                  <Box sx={{ color: 'primary.main', mb: 2 }}>
                    {feature.icon}
                  </Box>
                  <Typography variant="h6" component="h3" gutterBottom fontWeight="bold">
                    {feature.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {feature.description}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* Screenshots Section */}
      <Box sx={{ bgcolor: 'grey.50', py: 8 }}>
        <Container maxWidth="lg">
          <Typography variant="h3" component="h2" align="center" gutterBottom fontWeight="bold">
            Capturas de Pantalla
          </Typography>
          <Typography variant="h6" align="center" color="text.secondary" paragraph sx={{ mb: 6 }}>
            Conoce la interfaz y las funcionalidades visuales
          </Typography>

          <Grid container spacing={4}>
            {[
              { title: 'Dashboard de Proyectos', image: '/screenshots/dashboard-full.png', description: 'Vista completa de todos tus proyectos activos' },
              { title: 'Detalle de Proyecto', image: '/screenshots/project-details-full.png', description: 'Gestiona etapas, comentarios y archivos' },
              { title: 'Vista de Etapas', image: '/screenshots/stages-view.png', description: 'Visualiza todas las etapas en progreso' },
              { title: 'Gestión de Clientes', image: '/screenshots/clients-full.png', description: 'Administra tu cartera de clientes' },
              { title: 'Plantillas de Etapas', image: '/screenshots/templates-full.png', description: 'Crea flujos de trabajo reutilizables' },
              { title: 'Logs de Auditoría', image: '/screenshots/audit-full.png', description: 'Trazabilidad completa de acciones' }
            ].map((screenshot, index) => (
              <Grid size={{ xs: 12, md: 6 }} key={index}>
                <Paper elevation={3} sx={{ overflow: 'hidden', height: '100%' }}>
                  <Box
                    sx={{
                      aspectRatio: '16/9',
                      bgcolor: 'grey.200',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: `linear-gradient(${45 + index * 30}deg, #${Math.floor(Math.random()*16777215).toString(16)} 0%, #${Math.floor(Math.random()*16777215).toString(16)} 100%)`
                    }}
                  >
                    <img
                      src={screenshot.image}
                      alt={screenshot.title}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                      }}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  </Box>
                  <Box sx={{ p: 2 }}>
                    <Typography variant="h6" gutterBottom fontWeight="bold">
                      {screenshot.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {screenshot.description}
                    </Typography>
                  </Box>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Tutorial Section */}
      <Container maxWidth="lg" sx={{ py: 8 }} id="tutorial">
        <Typography variant="h3" component="h2" align="center" gutterBottom fontWeight="bold">
          Tutorial Completo
        </Typography>
        <Typography variant="h6" align="center" color="text.secondary" paragraph sx={{ mb: 6 }}>
          Aprende a usar todas las funcionalidades paso a paso
        </Typography>

        <Paper elevation={2} sx={{ p: 4 }}>
          <Stepper orientation="vertical">
            {tutorialSteps.map((step, index) => (
              <Step key={index} active={true} completed={false}>
                <StepLabel>
                  <Typography variant="h6" fontWeight="bold">
                    {step.label}
                  </Typography>
                </StepLabel>
                <StepContent>
                  <Typography paragraph color="text.secondary">
                    {step.description}
                  </Typography>
                  <Box
                    sx={{
                      mt: 2,
                      mb: 3,
                      borderRadius: 2,
                      overflow: 'hidden',
                      boxShadow: 2,
                      aspectRatio: '16/9',
                      bgcolor: 'grey.100',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: `linear-gradient(${135 + index * 25}deg, #667eea 0%, #764ba2 100%)`
                    }}
                  >
                    <img
                      src={step.image}
                      alt={step.label}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        background: 'white'
                      }}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  </Box>
                </StepContent>
              </Step>
            ))}
          </Stepper>
        </Paper>
      </Container>

      {/* CTA Section */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'white',
          py: 8,
          textAlign: 'center'
        }}
      >
        <Container maxWidth="md">
          <Typography variant="h3" component="h2" gutterBottom fontWeight="bold">
            ¿Listo para Empezar?
          </Typography>
          <Typography variant="h6" paragraph sx={{ mb: 4 }}>
            Comienza a gestionar tus proyectos de manera eficiente
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={handleGetStarted}
            sx={{
              bgcolor: 'white',
              color: 'primary.main',
              px: 6,
              py: 2,
              fontSize: '1.1rem',
              '&:hover': { bgcolor: 'grey.100' }
            }}
          >
            {isAuthenticated ? 'Ir al Dashboard' : 'Comenzar'}
          </Button>
        </Container>
      </Box>

      {/* Footer Info */}
      <Box sx={{ bgcolor: 'grey.900', color: 'white', py: 4 }}>
        <Container maxWidth="lg">
          <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="h6" gutterBottom fontWeight="bold">
                MASGestión
              </Typography>
              <Typography variant="body2" color="grey.400">
                Plataforma completa para la gestión de proyectos con etapas secuenciales,
                clientes y seguimiento en tiempo real.
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="h6" gutterBottom fontWeight="bold">
                Tecnologías
              </Typography>
              <Typography variant="body2" color="grey.400">
                React • TypeScript • Material-UI • Express • SQLite • Docker
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="h6" gutterBottom fontWeight="bold">
                Características
              </Typography>
              <Typography variant="body2" color="grey.400">
                Multi-tenancy • JWT Auth • Logs de Auditoría • Roles y Permisos
              </Typography>
            </Grid>
          </Grid>
        </Container>
      </Box>
    </Box>
  );
};

export default LandingPage;
