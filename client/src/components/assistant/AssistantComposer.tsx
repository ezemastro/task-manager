// Presentational: text input + send button. Disables while a turn is in
// flight (design.md task 5.4).

import { useState, type KeyboardEvent } from 'react';
import { Box, CircularProgress, IconButton, TextField } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';

interface AssistantComposerProps {
  disabled: boolean;
  onSend: (message: string) => void;
}

export default function AssistantComposer({ disabled, onSend }: AssistantComposerProps) {
  const [value, setValue] = useState('');

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <Box sx={{ display: 'flex', gap: 1, p: 1.5, borderTop: 1, borderColor: 'divider' }}>
      <TextField
        fullWidth
        size="small"
        multiline
        maxRows={4}
        placeholder="Escribí tu consulta..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <IconButton
        color="primary"
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        aria-label="Enviar mensaje"
      >
        {disabled ? <CircularProgress size={20} /> : <SendIcon />}
      </IconButton>
    </Box>
  );
}
