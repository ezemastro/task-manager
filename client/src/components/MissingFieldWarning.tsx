import { Box } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

/** Aviso en línea de un dato faltante. Es informativo: no impide guardar. */
export default function MissingFieldWarning({ message }: { message: string }) {
  return (
    <Box
      component="span"
      role="status"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'warning.main', fontWeight: 500 }}
    >
      <WarningAmberIcon sx={{ fontSize: 16 }} />
      {message}
    </Box>
  );
}
