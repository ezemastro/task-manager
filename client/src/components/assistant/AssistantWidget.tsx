// Container/gate (design.md section 9). Renders nothing while the status
// check is in flight or once resolved as disabled — no launcher, no error
// toast, zero impact on the rest of the app.

import { useState } from 'react';
import { Box, Drawer, Fab, IconButton, Typography } from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import CloseIcon from '@mui/icons-material/Close';
import AssistantChat from './AssistantChat';
import { useAssistantStatus } from './useAssistantStatus';

export default function AssistantWidget() {
  const { enabled, loading } = useAssistantStatus();
  const [open, setOpen] = useState(false);

  if (loading || !enabled) return null;

  return (
    <>
      {!open && (
        <Fab
          color="primary"
          aria-label="Abrir asistente de IA"
          onClick={() => setOpen(true)}
          sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: (theme) => theme.zIndex.drawer + 1 }}
        >
          <ChatIcon />
        </Fab>
      )}
      <Drawer anchor="right" open={open} onClose={() => setOpen(false)}>
        <Box
          sx={{
            width: { xs: '100vw', sm: 380 },
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 1.5,
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Typography variant="subtitle1" fontWeight={600}>
              Asistente
            </Typography>
            <IconButton onClick={() => setOpen(false)} aria-label="Cerrar asistente">
              <CloseIcon />
            </IconButton>
          </Box>
          <AssistantChat />
        </Box>
      </Drawer>
    </>
  );
}
