export interface ProjectReturnFilters {
  searchTerm: string;
  selectedClient: string;
  selectedResponsible: string;
  dateFilter: string;
  sortBy: string;
  showFilters: boolean;
}

export interface ProjectReturnSnapshot {
  dashboardKey: string;
  projectId: number;
  filters: ProjectReturnFilters;
  scrollY: number;
  viewportHeight: number;
  savedAt: number;
}

export const PROJECT_RETURN_SNAPSHOT_KEY = 'projectsList_return_snapshot';
const SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1000;

export function saveProjectReturnSnapshot(snapshot: ProjectReturnSnapshot): void {
  try {
    sessionStorage.setItem(PROJECT_RETURN_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Session storage may be unavailable in restricted browser contexts.
  }
}

export function clearProjectReturnSnapshot(projectId?: number): void {
  try {
    const snapshot = readProjectReturnSnapshot();
    if (projectId === undefined || snapshot?.projectId === projectId) {
      sessionStorage.removeItem(PROJECT_RETURN_SNAPSHOT_KEY);
    }
  } catch {
    // Ignore storage failures; navigation must remain usable.
  }
}

export function readProjectReturnSnapshot(): ProjectReturnSnapshot | null {
  try {
    const raw = sessionStorage.getItem(PROJECT_RETURN_SNAPSHOT_KEY);
    if (!raw) return null;

    const candidate = JSON.parse(raw) as Partial<ProjectReturnSnapshot>;
    const filters = candidate.filters as Partial<ProjectReturnFilters> | undefined;
    const scrollY = candidate.scrollY;
    const viewportHeight = candidate.viewportHeight;
    const savedAt = candidate.savedAt;
    const dashboardKey = candidate.dashboardKey;
    const projectId = candidate.projectId;
    if (
      !candidate ||
      typeof dashboardKey !== 'string' ||
      typeof projectId !== 'number' ||
      !Number.isInteger(projectId) ||
      !filters ||
      typeof filters.searchTerm !== 'string' ||
      typeof filters.selectedClient !== 'string' ||
      typeof filters.selectedResponsible !== 'string' ||
      typeof filters.dateFilter !== 'string' ||
      typeof filters.sortBy !== 'string' ||
      typeof filters.showFilters !== 'boolean' ||
      typeof scrollY !== 'number' ||
      !Number.isFinite(scrollY) ||
      scrollY < 0 ||
      typeof viewportHeight !== 'number' ||
      !Number.isFinite(viewportHeight) ||
      viewportHeight <= 0 ||
      typeof savedAt !== 'number' ||
      !Number.isFinite(savedAt) ||
      Date.now() - savedAt > SNAPSHOT_MAX_AGE_MS
    ) {
      sessionStorage.removeItem(PROJECT_RETURN_SNAPSHOT_KEY);
      return null;
    }

    return {
      dashboardKey,
      projectId,
      filters: {
        searchTerm: filters.searchTerm,
        selectedClient: filters.selectedClient,
        selectedResponsible: filters.selectedResponsible,
        dateFilter: filters.dateFilter,
        sortBy: filters.sortBy,
        showFilters: filters.showFilters,
      },
      scrollY,
      viewportHeight,
      savedAt,
    };
  } catch {
    return null;
  }
}

export function filtersMatch(a: ProjectReturnFilters, b: ProjectReturnFilters): boolean {
  return (
    a.searchTerm === b.searchTerm &&
    a.selectedClient === b.selectedClient &&
    a.selectedResponsible === b.selectedResponsible &&
    a.dateFilter === b.dateFilter &&
    a.sortBy === b.sortBy &&
    a.showFilters === b.showFilters
  );
}
