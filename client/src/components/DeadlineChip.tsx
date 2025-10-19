import { Chip } from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';

interface DeadlineChipProps {
  date: string | null | undefined;
  isCompleted?: boolean;
  size?: 'small' | 'medium';
  showIcon?: boolean;
  label?: string;
}

export default function DeadlineChip({ 
  date, 
  isCompleted = false, 
  size = 'small',
  showIcon = true,
  label
}: DeadlineChipProps) {
  if (!date) return null;

  const deadlineDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  deadlineDate.setHours(0, 0, 0, 0);

  const diffTime = deadlineDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // Si está completado, mostrar en gris
  if (isCompleted) {
    return (
      <Chip
        icon={showIcon ? <EventIcon /> : undefined}
        label={label || deadlineDate.toLocaleDateString('es-ES')}
        size={size}
        sx={{ 
          height: size === 'small' ? 22 : undefined, 
          fontSize: size === 'small' ? '0.75rem' : undefined 
        }}
      />
    );
  }

  // Si ya pasó la fecha (overdue)
  if (diffDays < 0) {
    return (
      <Chip
        icon={showIcon ? <ErrorIcon /> : undefined}
        label={label || `Vencido: ${deadlineDate.toLocaleDateString('es-ES')}`}
        size={size}
        color="error"
        sx={{ 
          height: size === 'small' ? 22 : undefined, 
          fontSize: size === 'small' ? '0.75rem' : undefined 
        }}
      />
    );
  }

  // Si es hoy
  if (diffDays === 0) {
    return (
      <Chip
        icon={showIcon ? <WarningIcon /> : undefined}
        label={label || 'Hoy'}
        size={size}
        color="warning"
        sx={{ 
          height: size === 'small' ? 22 : undefined, 
          fontSize: size === 'small' ? '0.75rem' : undefined 
        }}
      />
    );
  }

  // Si es mañana o en los próximos 3 días
  if (diffDays <= 3) {
    return (
      <Chip
        icon={showIcon ? <WarningIcon /> : undefined}
        label={label || `${diffDays} día${diffDays > 1 ? 's' : ''}: ${deadlineDate.toLocaleDateString('es-ES')}`}
        size={size}
        color="warning"
        variant="outlined"
        sx={{ 
          height: size === 'small' ? 22 : undefined, 
          fontSize: size === 'small' ? '0.75rem' : undefined 
        }}
      />
    );
  }

  // Si faltan más de 3 días (normal)
  return (
    <Chip
      icon={showIcon ? <EventIcon /> : undefined}
      label={label || deadlineDate.toLocaleDateString('es-ES')}
      size={size}
      sx={{ 
        height: size === 'small' ? 22 : undefined, 
        fontSize: size === 'small' ? '0.75rem' : undefined 
      }}
    />
  );
}
