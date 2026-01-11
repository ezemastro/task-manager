import { Box, Container, Typography, Link, Stack, IconButton } from '@mui/material';
import GitHubIcon from '@mui/icons-material/GitHub';
import EmailIcon from '@mui/icons-material/Email';

export default function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        py: 2,
        px: 2,
        mt: 'auto',
        backgroundColor: 'background.paper',
        borderTop: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Container maxWidth="lg">
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={{ xs: 1, sm: 2 }}
          alignItems="center"
          justifyContent="space-between"
        >
          {/* Izquierda: Open Source y contacto */}
          <Stack 
            direction="row" 
            spacing={1} 
            alignItems="center"
            sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
          >
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
            >
              Open Source •{' '}
              <Link
                href="mailto:marcelo@mastropietro.com"
                color="inherit"
                underline="hover"
              >
                ¿Dudas, sugerencias o errores?
              </Link>
            </Typography>
            <Link
              href="mailto:marcelo@mastropietro.com"
              sx={{ 
                display: 'flex',
                alignItems: 'center',
                color: 'text.secondary',
                '&:hover': { color: 'primary.main' }
              }}
            >
              <EmailIcon sx={{ fontSize: 16 }} />
            </Link>
          </Stack>

          {/* Derecha: GitHub */}
          <Stack direction="row" spacing={1} alignItems="center">
            <IconButton
              component="a"
              href="https://github.com/ezemastro/task-manager"
              target="_blank"
              rel="noopener noreferrer"
              size="small"
              sx={{ 
                color: 'text.secondary',
                '&:hover': { color: 'primary.main' }
              }}
            >
              <GitHubIcon fontSize="small" />
            </IconButton>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ 
                display: { xs: 'none', sm: 'block' },
                fontSize: '0.75rem'
              }}
            >
              <Link
                href="https://github.com/ezemastro/task-manager"
                target="_blank"
                rel="noopener noreferrer"
                color="inherit"
                underline="hover"
              >
                Ver código fuente
              </Link>
            </Typography>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
