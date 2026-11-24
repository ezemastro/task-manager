import { useState } from 'react';
import { Button, CircularProgress, Tooltip } from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { apiClient } from '../services/apiClient';
import type { ProjectType } from '../utils/projectTypes';

const currentYear = () => Number(new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
}).format(new Date()));

/**
 * "Exportar a Excel": descarga las mediciones del año (indicadores, proyectos,
 * etapas, esperas y cambios de fecha) para guardarlas como evidencia en el SGC.
 */
export default function ExportYearButton({ year, projectType = null }: { year?: number; projectType?: ProjectType | null }) {
  const [exporting, setExporting] = useState(false);
  const exportYear = year ?? currentYear();

  const handleExport = async () => {
    setExporting(true);
    try {
      await apiClient.downloadYearExport(exportYear, projectType);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo exportar');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Tooltip title={`Descarga un Excel con las mediciones de ${exportYear}: indicadores, proyectos, etapas, esperas y cambios de fecha`}>
      <span>
        <Button
          variant="outlined"
          size="small"
          startIcon={exporting ? <CircularProgress size={16} /> : <FileDownloadIcon />}
          onClick={handleExport}
          disabled={exporting}
          sx={{ whiteSpace: 'nowrap' }}
        >
          Exportar a Excel
        </Button>
      </span>
    </Tooltip>
  );
}
