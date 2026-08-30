// Renders a destructive action awaiting explicit human confirmation
// (design.md ADR D4, specs/assistant-actions "Confirmation Token Issuance
// and Redemption"). The model can never self-confirm: only a human click on
// "Confirmar" ever calls postConfirm, and this component is the only place
// that click can originate from.

import { Alert, Box, Button, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import type { PendingAction } from './types';

interface PendingActionCardProps {
  pending: PendingAction;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function PendingActionCard({ pending, busy, onConfirm, onCancel }: PendingActionCardProps) {
  const { view } = pending;

  return (
    <Alert severity="warning" icon={false} sx={{ mx: 1.5, mb: 1 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        Confirmación requerida
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.5 }}>
        Vas a eliminar: <strong>{view.entityName}</strong>
      </Typography>
      {view.consequences.length > 0 && (
        <Box component={List} dense sx={{ pl: 1, listStyleType: 'disc', py: 0 }}>
          {view.consequences.map((consequence, index) => (
            <ListItem key={index} sx={{ display: 'list-item', py: 0 }}>
              <ListItemText primary={<Typography variant="body2">{consequence}</Typography>} />
            </ListItem>
          ))}
        </Box>
      )}
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button size="small" variant="contained" color="error" onClick={onConfirm} disabled={busy}>
          Confirmar
        </Button>
        <Button size="small" variant="outlined" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
      </Stack>
    </Alert>
  );
}
