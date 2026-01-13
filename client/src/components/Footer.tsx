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
                href="mailto:consultas@mastropietro.com.ar"
                color="inherit"
                underline="hover"
                title="Enviar email a consultas@mastropietro.com.ar"
              >
                consultas@mastropietro.com.ar
              </Link>
            </Typography>
            <IconButton
              component="a"
              href="mailto:consultas@mastropietro.com.ar"
              size="small"
              title="Enviar email a consultas@mastropietro.com.ar"
              sx={{ 
                color: 'text.secondary',
                '&:hover': { color: 'primary.main' }
              }}
            >
              <EmailIcon sx={{ fontSize: 16 }} />
            </IconButton>
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
