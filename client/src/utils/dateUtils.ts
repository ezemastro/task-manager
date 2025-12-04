/**
 * Utilidades para manejo de fechas con zona horaria local (Buenos Aires)
 */

/**
 * Convierte una fecha en formato YYYY-MM-DD a ISO string con hora local a mediodía
 * Esto evita problemas de zona horaria al enviar fechas al backend
 * 
 * @param dateString - Fecha en formato YYYY-MM-DD (del input type="date")
 * @returns ISO string con hora local a las 12:00 (mediodía)
 */
export function dateStringToLocalISO(dateString: string | undefined): string | undefined {
  if (!dateString) return undefined;
  
  // Crear fecha en zona horaria local a las 12:00 para evitar cambios de día
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  
  return date.toISOString();
}

/**
 * Convierte un ISO string del backend a formato YYYY-MM-DD para inputs type="date"
 * 
 * @param isoString - Fecha en formato ISO del backend
 * @returns Fecha en formato YYYY-MM-DD
 */
export function isoToDateString(isoString: string | undefined): string {
  if (!isoString) return '';
  
  // Parsear la fecha en zona horaria local
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Formatea una fecha ISO a formato local legible (DD/MM/YYYY)
 * 
 * @param isoString - Fecha en formato ISO (UTC desde el backend)
 * @returns Fecha formateada en DD/MM/YYYY
 */
export function formatLocalDate(isoString: string): string {
  // Si el string no tiene 'Z' al final ni offset, agregarle 'Z' para indicar que es UTC
  let dateString = isoString;
  if (!dateString.endsWith('Z') && !dateString.includes('+') && !dateString.includes('T')) {
    // Formato SQLite: "YYYY-MM-DD HH:MM:SS" - Tratarlo como UTC
    dateString = dateString.replace(' ', 'T') + 'Z';
  } else if (dateString.includes('T') && !dateString.endsWith('Z') && !dateString.includes('+')) {
    // Formato ISO sin timezone: "YYYY-MM-DDTHH:MM:SS" - Agregarle Z
    dateString = dateString + 'Z';
  }
  
  const date = new Date(dateString);
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires'
  });
}

/**
 * Formatea una fecha y hora ISO a formato local legible
 * 
 * @param isoString - Fecha en formato ISO (UTC desde el backend)
 * @returns Fecha y hora formateada en zona horaria de Buenos Aires
 */
export function formatLocalDateTime(isoString: string): string {
  // Si el string no tiene 'Z' al final ni offset, agregarle 'Z' para indicar que es UTC
  let dateString = isoString;
  if (!dateString.endsWith('Z') && !dateString.includes('+') && !dateString.includes('T')) {
    // Formato SQLite: "YYYY-MM-DD HH:MM:SS" - Tratarlo como UTC
    dateString = dateString.replace(' ', 'T') + 'Z';
  } else if (dateString.includes('T') && !dateString.endsWith('Z') && !dateString.includes('+')) {
    // Formato ISO sin timezone: "YYYY-MM-DDTHH:MM:SS" - Agregarle Z
    dateString = dateString + 'Z';
  }
  
  const date = new Date(dateString);
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires'
  });
}

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD para inputs type="date"
 * 
 * @returns Fecha actual en formato YYYY-MM-DD
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}
