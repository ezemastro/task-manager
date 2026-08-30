// Presentational: renders the chat transcript. No API calls, no state.

import { Box, Paper, Typography } from '@mui/material';
import AssistantProgressSteps from './AssistantProgressSteps';
import type { ChatMessage } from './types';

interface AssistantMessageListProps {
  messages: ChatMessage[];
}

export default function AssistantMessageList({ messages }: AssistantMessageListProps) {
  if (messages.length === 0) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
        <Typography variant="body2" color="text.secondary" align="center">
          Preguntame sobre tus proyectos, etapas o clientes.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {messages.map((message) => (
        <Box
          key={message.id}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: message.role === 'user' ? 'flex-end' : 'flex-start',
            gap: 0.25,
          }}
        >
          {/* Steps are subordinate to the reply and rendered above the
              bubble, muted — audit trail of what actually ran, kept visible
              (compactly, once past a few steps) after the turn completes. */}
          {message.role === 'assistant' && message.steps && message.steps.length > 0 && (
            <Box sx={{ maxWidth: '85%' }}>
              <AssistantProgressSteps steps={message.steps} collapsible />
            </Box>
          )}
          <Paper
            elevation={0}
            sx={{
              maxWidth: '85%',
              px: 1.5,
              py: 1,
              bgcolor: message.role === 'user' ? 'primary.main' : 'grey.100',
              color: message.role === 'user' ? 'primary.contrastText' : 'text.primary',
              borderRadius: 2,
              border: message.degraded ? '1px solid' : 'none',
              borderColor: message.degraded ? 'warning.main' : 'transparent',
            }}
          >
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {message.content}
            </Typography>
          </Paper>
        </Box>
      ))}
    </Box>
  );
}
