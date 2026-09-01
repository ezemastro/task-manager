// Presentational: text input + send button + optional voice input via the
// Web Speech API (design.md task 5.4). Disables while a turn is in flight
// (design.md task 5.4). The mic button only renders when the browser
// supports speech recognition; the recognized transcript is appended to the
// draft before the user hits send.

import { useState, type KeyboardEvent } from 'react';
import { Box, CircularProgress, IconButton, TextField, Tooltip } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import MicIcon from '@mui/icons-material/Mic';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import { useVoiceInput } from './useVoiceInput';

interface AssistantComposerProps {
  disabled: boolean;
  onSend: (message: string) => void;
}

export default function AssistantComposer({ disabled, onSend }: AssistantComposerProps) {
  const [value, setValue] = useState('');
  const { supported, listening, error, start, stop } = useVoiceInput((transcript) => {
    setValue((prev) => (prev ? `${prev.trimEnd()} ${transcript}` : transcript));
  });

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    if (listening) stop();
    onSend(trimmed);
    setValue('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleMicClick = () => {
    if (listening) {
      stop();
    } else {
      start();
    }
  };

  return (
    <Box sx={{ display: 'flex', gap: 1, p: 1.5, borderTop: 1, borderColor: 'divider' }}>
      {supported && (
        <Tooltip title={error ?? (listening ? 'Grabando... tocá para detener' : 'Escribir por voz')}>
          <IconButton
            onClick={handleMicClick}
            disabled={disabled}
            color={listening ? 'error' : 'default'}
            aria-label="Escribir por voz"
            sx={
              listening
                ? {
                    backgroundColor: (theme) => theme.palette.error.light,
                    '&:hover': { backgroundColor: (theme) => theme.palette.error.light },
                  }
                : undefined
            }
          >
            {listening ? <StopCircleIcon /> : <MicIcon />}
          </IconButton>
        </Tooltip>
      )}
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