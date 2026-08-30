// Presentational: renders a turn's progress steps as small, muted ("en
// grisecito") lines. Used both LIVE — while a turn is in flight, fed by
// polling GET /assistant/progress/:turnId — and after completion, fed by the
// chat response's own authoritative `steps` field (types.ts's ProgressStep).
// Every label shown here was generated server-side from a real tool
// dispatch; this component only renders it, never derives or rewrites it.

import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import type { ProgressStep } from './types';

const COLLAPSE_THRESHOLD = 3;

interface AssistantProgressStepsProps {
  steps: ProgressStep[];
  /** Completed turns default to a compact, expandable view once the list gets long; a live turn always shows everything. */
  collapsible?: boolean;
}

function statusGlyph(status: ProgressStep['status']): string {
  if (status === 'running') return '⋯';
  if (status === 'error') return '⚠';
  return '✓';
}

export default function AssistantProgressSteps({ steps, collapsible = false }: AssistantProgressStepsProps) {
  const [collapsed, setCollapsed] = useState(collapsible);

  if (steps.length === 0) return null;

  const offerToggle = collapsible && steps.length > COLLAPSE_THRESHOLD;
  const visibleSteps = offerToggle && collapsed ? steps.slice(-1) : steps;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, px: 0.5 }}>
      {offerToggle && (
        <Typography
          component="button"
          onClick={() => setCollapsed((prev) => !prev)}
          variant="caption"
          sx={{
            all: 'unset',
            cursor: 'pointer',
            color: 'text.disabled',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.25,
            '&:hover': { color: 'text.secondary' },
          }}
        >
          {collapsed ? <ExpandMoreIcon sx={{ fontSize: 14 }} /> : <ExpandLessIcon sx={{ fontSize: 14 }} />}
          {collapsed ? `Ver los ${steps.length} pasos` : 'Ocultar pasos'}
        </Typography>
      )}
      {visibleSteps.map((step) => (
        <Typography
          key={step.id}
          variant="caption"
          sx={{
            color: step.status === 'error' ? 'warning.main' : 'text.disabled',
            fontStyle: step.status === 'running' ? 'italic' : 'normal',
            lineHeight: 1.4,
          }}
        >
          {statusGlyph(step.status)} {step.label}
        </Typography>
      ))}
    </Box>
  );
}
