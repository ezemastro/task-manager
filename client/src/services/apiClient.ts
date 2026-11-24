import type { ProjectType } from '../utils/projectTypes';
import type { StageAttributes } from '../utils/stageAttributes';
import type { DelayCause, HoldPeriod } from '../utils/delayCauses';

// ==================== TYPES & INTERFACES ====================

export interface User {
  id: number;
  name: string;
  email: string;
  role?: string;
  created_at: string;
}

export interface Client {
  id: number;
  name: string;
  preferences?: string;
  created_at: string;
}

export interface StageTemplate extends StageAttributes {
  id: number;
  name: string;
  order_number: number;
  default_responsible_id?: number;
  default_responsible_name?: string;
  estimated_duration_days?: number;
  project_type?: ProjectType | null;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  description?: string;
  contact?: string;
  status: string;
  completed_date?: string | null;
  client_id?: number;
  client_name?: string;
  responsible_id?: number;
  responsible_name?: string;
  deadline?: string;
  project_type?: ProjectType | null;
  /** Solo en GET /projects/:id: fechas comprometida/entregada/cerrada y retraso. */
  delivery?: ProjectDelivery;
  /** Solo en GET /projects/:id: períodos en que el proyecto estuvo paralizado. */
  project_holds?: HoldPeriod[];
  created_at: string;
  updated_at: string;
  total_stages?: number;
  completed_stages?: number;
  current_stage?: string;
  tags?: Tag[];
}

export interface Stage extends StageAttributes {
  id: number;
  /** Causa declarada cuando la etapa superó su fecha estimada. */
  delay_cause?: DelayCause | null;
  delay_cause_note?: string | null;
  delay_cause_by_name?: string | null;
  delay_cause_at?: string | null;
  /** Solo en GET /projects/:id: períodos "En espera" de la etapa. */
  holds?: HoldPeriod[];
  open_hold?: HoldPeriod | null;
  hold_days?: number;
  project_id: number;
  template_id?: number;
  name: string;
  responsible_id?: number;
  responsible_name?: string;
  responsible_email?: string;
  responsible_role?: string;
  start_date?: string;
  estimated_end_date?: string;
  completed_date?: string;
  intermediate_date?: string;
  intermediate_date_note?: string;
  order_number: number;
  is_completed: boolean;
  created_at: string;
  project_name?: string;
  client_id?: number;
  client_name?: string;
  tags?: Array<{
    id: number;
    name: string;
    color?: string;
  }>;
  comments_count?: number;
  recent_comments?: Array<{
    id: number;
    author: string;
    content: string;
    created_at: string;
  }>;
}

export interface StageCycleComparison {
  status: 'early' | 'late' | 'sin_fecha';
  days_early: number;
  days_late: number;
}

export interface StageCycle {
  id: number;
  organization_id: number;
  project_id: number;
  stage_id: number;
  cycle_number: number;
  started_at: string;
  started_by: number;
  started_by_name?: string;
  ended_at?: string;
  ended_by?: number;
  ended_by_name?: string;
  deadline_used?: string;
  deadline_for_display?: string;
  duration_days?: number | null;
  cycle_status?: 'open' | 'closed';
  comparison?: StageCycleComparison | null;
}

export interface StageDetail extends StageAttributes {
  id: number;
  project_id: number;
  template_id?: number;
  name: string;
  responsible_id?: number;
  responsible_name?: string;
  responsible_email?: string;
  responsible_role?: string;
  start_date?: string;
  estimated_end_date?: string;
  completed_date?: string;
  intermediate_date?: string;
  intermediate_date_note?: string;
  order_number: number;
  is_completed: boolean;
  created_at: string;
  project_name?: string;
  client_id?: number;
  client_name?: string;
  tags: Tag[];
  comments: Comment[];
}

export interface Tag {
  id: number;
  name: string;
  color?: string;
  created_at: string;
  usage_count?: number;
}

export interface Comment {
  id: number;
  stage_id: number;
  content: string;
  author: string;
  created_at: string;
  stage_name?: string;
  project_name?: string;
}

// Request DTOs
export interface CreateProjectRequest {
  name: string;
  project_type?: ProjectType;
  description?: string;
  contact?: string;
  client_id?: number;
  responsible_id?: number;
  deadline?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  project_type?: ProjectType;
  description?: string;
  contact?: string | null;
  status?: string;
  client_id?: number;
  responsible_id?: number;
  deadline?: string | null;
  /** Al paralizar: causa y nota (obligatoria si la causa es "Otra"). */
  pause_cause?: DelayCause;
  pause_note?: string | null;
}

export interface ProjectSummaryStage {
  stage_name: string;
  total_days: number;
  delayed_cycles: number;
  counts_work_time?: boolean;
  is_control?: boolean;
}

export interface ProjectSummary {
  year: number;
  available_years: number[];
  projects_created: number;
  projects_completed: number;
  stages: ProjectSummaryStage[];
  /** Días totales solo de las etapas que suman tiempo de trabajo. */
  work_days?: number;
  deliveries?: {
    delivered: number;
    with_commitment: number;
    late: number;
    on_time: number;
    on_time_percentage?: number | null;
    late_percentage: number | null;
    total_delay_days: number;
    average_delay_days?: number | null;
    client_delay_days?: number;
    studio_delay_days?: number;
    client_delay_percentage?: number | null;
    studio_delay_percentage?: number | null;
  };
  /** Días en espera dentro del año, por causa ('unspecified' = sin causa). */
  hold_days_by_cause?: Record<string, number>;
  /** Clientes con más de 2 proyectos iniciados en el año (fidelización B2B). */
  recurring_clients?: {
    min_projects: number;
    count: number;
    clients_with_projects: number;
    clients: Array<{ id: number; name: string; projects: number }>;
  };
  project_type?: ProjectType | null;
}

// Retraso medido entre la fecha comprometida y la entrega real (etapa
// "Entrega completa y revisada"); el cierre del cliente no cuenta.
export interface ProjectDelivery {
  committed_date: string | null;
  delivered_date: string | null;
  closed_date: string | null;
  status: 'on_time' | 'late' | 'pending' | 'overdue' | 'no_commitment';
  delay_days: number;
  /** Retraso separado por origen (solo si está tarde). */
  attribution?: { client_days: number; studio_days: number } | null;
}

export interface CreateStageRequest {
  project_id: number;
  name: string;
  responsible_id: number;
  start_date?: string;
  estimated_end_date?: string;
}

export interface UpdateStageRequest {
  name?: string;
  responsible_id?: number | null;
  start_date?: string | null;
  estimated_end_date?: string | null;
  completed_date?: string | null;
  intermediate_date?: string | null;
  intermediate_date_note?: string | null;
}

export interface CreateUserRequest {
  name: string;
  email: string;
  role?: string;
}

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  role?: string;
}

export interface CreateTagRequest {
  name: string;
  color?: string;
}

export interface UpdateTagRequest {
  name?: string;
  color?: string;
}

export interface CreateCommentRequest {
  stage_id: number;
  content: string;
}

export interface AddTagToStageRequest {
  tag_id: number;
}

export interface AddTagToProjectRequest {
  tag_id: number;
}

// Filter interfaces
export interface ProjectFilters {
  name?: string;
  status?: string;
  has_completed_stages?: boolean;
  has_pending_stages?: boolean;
}

export interface StageFilters {
  project_id?: number;
  responsible_id?: number;
  is_completed?: boolean;
  tag?: string;
  start_date_from?: string;
  start_date_to?: string;
  estimated_end_date_from?: string;
  estimated_end_date_to?: string;
}

export interface UserFilters {
  name?: string;
  role?: string;
}

// ==================== AUDIT LOG TYPES ====================

export interface AuditLog {
  id: number;
  organization_id: number;
  user_id: number;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id?: number;
  project_name?: string;
  details?: string;
  ip_address?: string;
  created_at: string;
}

export interface AuditLogFilters {
  user_id?: number;
  entity_type?: string;
  entity_id?: number;
  action?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
}

export interface AuditLogStats {
  total_actions: number;
  unique_users: number;
  active_days: number;
  entity_type: string;
  action: string;
  count: number;
}

// ==================== AUTHENTICATION TYPES ====================

export interface Organization {
  id: number;
  name: string;
  userId?: number;
  userName?: string;
  userEmail?: string;
  message?: string;
}

export interface AuthUser {
  id: number;
  accountId: number;
  organizationId: number;
  organizationName: string;
  name: string;
  email: string;
  role: string;
  scopes?: string[];
  isSuperAdmin: boolean;
}

export interface AdminAccount {
  id: number;
  email: string;
  name: string;
  created_at: string;
  is_super_admin: boolean;
  organizations: {
    organizationId: number;
    organizationName: string;
    role: string;
    scopes: string[];
  }[];
}

export interface LoginRequest {
  organizationId: number;
  userId: number;
  password?: string;
}

export interface ChangePasswordRequest {
  currentPassword?: string;
  newPassword: string;
}

// ==================== API CLIENT ====================

import axios, { type AxiosInstance } from 'axios';

class ApiClient {
  private api: AxiosInstance;

  constructor(baseURL: string = window.location.origin + '/api') {
    this.api = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true, // Importante para enviar cookies
    });

    // Interceptor para manejar errores
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // No redirigir en rutas de autenticación o checks opcionales
          const url = error.config?.url || '';
          const isLoginEndpoint = url.includes('/auth/login');
          const isAuthCheck = url.includes('/auth/me');
          if (!isLoginEndpoint && !isAuthCheck) {
            // Token expirado o inválido en rutas protegidas
            window.location.href = '/login';
          }
        }
        const message = error.response?.data?.error || error.message || 'Error desconocido';
        throw new Error(message);
      }
    );
  }

  // ==================== AUTHENTICATION ====================

  async getOrganizations(): Promise<Organization[]> {
    const { data } = await this.api.get('/auth/organizations');
    return data;
  }

  async createOrganization(name: string): Promise<Organization> {
    const { data } = await this.api.post('/auth/organizations', { name });
    return data;
  }

  async updateOrganization(organizationId: number, name: string): Promise<Organization> {
    const { data } = await this.api.put(`/auth/organizations/${organizationId}`, { name });
    return data;
  }

  async getUsersByOrganization(organizationId: number): Promise<User[]> {
    const { data } = await this.api.get(`/auth/organizations/${organizationId}/users`);
    return data;
  }

  async login(credentials: LoginRequest): Promise<AuthUser> {
    const { data } = await this.api.post('/auth/login', credentials);
    return data.user;
  }

  async getMe(): Promise<AuthUser> {
    const { data } = await this.api.get('/auth/me');
    return data;
  }

  async logout(): Promise<void> {
    await this.api.post('/auth/logout');
  }

  async changePassword(request: ChangePasswordRequest): Promise<void> {
    await this.api.put('/auth/change-password', request);
  }

  // ==================== ADMIN ====================

  async getAdminAccounts(): Promise<AdminAccount[]> {
    const { data } = await this.api.get<AdminAccount[]>('/admin/accounts');
    return data;
  }

  private buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
    const query = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value!)}`)
      .join('&');
    
    return query ? `?${query}` : '';
  }

  // ==================== PROJECTS ====================

  async getProjects(filters?: ProjectFilters): Promise<Project[]> {
    const query = filters ? this.buildQueryString(filters as Record<string, string | number | boolean | undefined>) : '';
    const { data } = await this.api.get<Project[]>(`/projects${query}`);
    return data;
  }

  async getProject(id: number): Promise<Project & { stages: Stage[] }> {
    const { data } = await this.api.get<Project & { stages: Stage[] }>(`/projects/${id}`);
    return data;
  }

  async createProject(requestData: CreateProjectRequest): Promise<{ id: number; message: string } & CreateProjectRequest> {
    const { data } = await this.api.post(`/projects`, requestData);
    return data;
  }

  async updateProject(id: number, requestData: UpdateProjectRequest): Promise<{ message: string }> {
    const { data } = await this.api.put(`/projects/${id}`, requestData);
    return data;
  }

  async deleteProject(id: number): Promise<{ message: string }> {
    const { data } = await this.api.delete(`/projects/${id}`);
    return data;
  }

  async getProjectSummary(year: number, projectType?: ProjectType | null): Promise<ProjectSummary> {
    const { data } = await this.api.get<ProjectSummary>('/summary', {
      params: projectType ? { year, project_type: projectType } : { year },
    });
    return data;
  }

  // ==================== STAGES ====================

  async getStages(filters?: StageFilters): Promise<Stage[]> {
    const query = filters ? this.buildQueryString(filters as Record<string, string | number | boolean | undefined>) : '';
    const { data } = await this.api.get<Stage[]>(`/stages${query}`);
    return data;
  }

  async getStage(id: number): Promise<StageDetail> {
    const { data } = await this.api.get<StageDetail>(`/stages/${id}`);
    return data;
  }

  async createStage(requestData: CreateStageRequest): Promise<{ id: number; message: string } & CreateStageRequest & { order_number: number }> {
    const { data } = await this.api.post(`/stages`, requestData);
    return data;
  }

  async updateStage(id: number, requestData: UpdateStageRequest): Promise<{ message: string }> {
    const { data } = await this.api.put(`/stages/${id}`, requestData);
    return data;
  }

  async completeStage(id: number): Promise<{ message: string }> {
    const { data } = await this.api.put(`/stages/${id}/complete`);
    return data;
  }

  async uncompleteStage(id: number): Promise<{ message: string }> {
    const { data } = await this.api.put(`/stages/${id}/uncomplete`);
    return data;
  }

  /** Marca la etapa como "No aplica" (motivo obligatorio; se registra el usuario). */
  async markStageNotApplicable(id: number, reason: string): Promise<{ message: string }> {
    const { data } = await this.api.put(`/stages/${id}/not-applicable`, { reason });
    return data;
  }

  async undoStageNotApplicable(id: number): Promise<{ message: string }> {
    const { data } = await this.api.delete(`/stages/${id}/not-applicable`);
    return data;
  }

  /** Pone la etapa "En espera" con su causa; los días se cuentan solos. */
  async holdStage(id: number, cause: DelayCause, note?: string | null): Promise<{ message: string }> {
    const { data } = await this.api.put(`/stages/${id}/hold`, { cause, note });
    return data;
  }

  async resumeStage(id: number): Promise<{ message: string }> {
    const { data } = await this.api.delete(`/stages/${id}/hold`);
    return data;
  }

  /** Registra la causa del retraso de una etapa vencida. */
  async setStageDelayCause(id: number, cause: DelayCause, note?: string | null): Promise<{ message: string }> {
    const { data } = await this.api.put(`/stages/${id}/delay-cause`, { cause, note });
    return data;
  }

  async startStage(id: number): Promise<{ message: string }> {
    const { data } = await this.api.put(`/stages/${id}/start`);
    return data;
  }

  async unstartStage(id: number): Promise<{ message: string }> {
    const { data } = await this.api.put(`/stages/${id}/unstart`);
    return data;
  }

  async getStageCycles(stageId: number): Promise<StageCycle[]> {
    const { data } = await this.api.get<StageCycle[]>(`/stages/${stageId}/cycles`);
    return data;
  }

  async startStageCycle(stageId: number): Promise<StageCycle> {
    const { data } = await this.api.post<StageCycle>(`/stages/${stageId}/cycles`);
    return data;
  }

  async finishStageCycle(stageId: number, cycleId: number): Promise<StageCycle> {
    const { data } = await this.api.put<StageCycle>(`/stages/${stageId}/cycles/${cycleId}/finish`);
    return data;
  }

  async deleteStage(id: number): Promise<{ message: string }> {
    const { data } = await this.api.delete(`/stages/${id}`);
    return data;
  }

  async reorderStages(stageOrders: Array<{ id: number; order_number: number }>): Promise<{ message: string }> {
    const { data } = await this.api.put('/stages/reorder', { stages: stageOrders });
    return data;
  }

  async addTagToStage(stageId: number, requestData: AddTagToStageRequest): Promise<{ message: string }> {
    const { data } = await this.api.post(`/stages/${stageId}/tags`, requestData);
    return data;
  }

  async removeTagFromStage(stageId: number, tagId: number): Promise<{ message: string }> {
    const { data } = await this.api.delete(`/stages/${stageId}/tags/${tagId}`);
    return data;
  }

  async addTagToProject(projectId: number, requestData: AddTagToProjectRequest): Promise<{ message: string }> {
    const { data } = await this.api.post(`/projects/${projectId}/tags`, requestData);
    return data;
  }

  async removeTagFromProject(projectId: number, tagId: number): Promise<{ message: string }> {
    const { data } = await this.api.delete(`/projects/${projectId}/tags/${tagId}`);
    return data;
  }

  // ==================== TAGS ====================

  async getTags(): Promise<Tag[]> {
    const { data } = await this.api.get<Tag[]>('/tags');
    return data;
  }

  async getTag(id: number): Promise<Tag> {
    const { data } = await this.api.get<Tag>(`/tags/${id}`);
    return data;
  }

  async createTag(requestData: CreateTagRequest): Promise<{ id: number; message: string } & CreateTagRequest> {
    const { data } = await this.api.post(`/tags`, requestData);
    return data;
  }

  async updateTag(id: number, requestData: UpdateTagRequest): Promise<{ message: string }> {
    const { data } = await this.api.put(`/tags/${id}`, requestData);
    return data;
  }

  async deleteTag(id: number): Promise<{ message: string }> {
    const { data } = await this.api.delete(`/tags/${id}`);
    return data;
  }

  // ==================== PROJECT TAGS (catálogo propio, separado de stage tags) ====================

  async getProjectTagOptions(): Promise<Tag[]> {
    const { data } = await this.api.get<Tag[]>('/project-tags');
    return data;
  }

  async createProjectTagOption(requestData: CreateTagRequest): Promise<{ id: number; message: string } & CreateTagRequest> {
    const { data } = await this.api.post(`/project-tags`, requestData);
    return data;
  }

  async updateProjectTagOption(id: number, requestData: UpdateTagRequest): Promise<{ message: string }> {
    const { data } = await this.api.put(`/project-tags/${id}`, requestData);
    return data;
  }

  async deleteProjectTagOption(id: number): Promise<{ message: string }> {
    const { data } = await this.api.delete(`/project-tags/${id}`);
    return data;
  }

  // ==================== USERS ====================

  async getUsers(filters?: UserFilters): Promise<User[]> {
    const query = filters ? this.buildQueryString(filters as Record<string, string | number | boolean | undefined>) : '';
    const { data } = await this.api.get<User[]>(`/users${query}`);
    return data;
  }

  async getUser(id: number): Promise<User> {
    const { data } = await this.api.get<User>(`/users/${id}`);
    return data;
  }

  async createUser(requestData: CreateUserRequest): Promise<{ id: number; message: string } & CreateUserRequest> {
    const { data } = await this.api.post(`/users`, requestData);
    return data;
  }

  async updateUser(id: number, requestData: UpdateUserRequest): Promise<{ message: string }> {
    const { data } = await this.api.put(`/users/${id}`, requestData);
    return data;
  }

  async deleteUser(id: number): Promise<{ message: string }> {
    const { data } = await this.api.delete(`/users/${id}`);
    return data;
  }

  // ==================== COMMENTS ====================

  async getComments(): Promise<Comment[]> {
    const { data } = await this.api.get<Comment[]>('/comments');
    return data;
  }

  async getStageComments(stageId: number): Promise<Comment[]> {
    const { data } = await this.api.get<Comment[]>(`/stages/${stageId}/comments`);
    return data;
  }

  async createComment(requestData: CreateCommentRequest): Promise<{ id: number; message: string } & CreateCommentRequest> {
    const { data } = await this.api.post(`/comments`, requestData);
    return data;
  }

  async updateComment(id: number, requestData: { content: string }): Promise<{ id: number; content: string; message: string }> {
    const { data } = await this.api.put(`/comments/${id}`, requestData);
    return data;
  }

  async deleteComment(id: number): Promise<{ message: string }> {
    const { data } = await this.api.delete(`/comments/${id}`);
    return data;
  }

  // ==================== CLIENTS ====================

  async getClients(): Promise<Client[]> {
    const { data } = await this.api.get<Client[]>('/clients');
    return data;
  }

  async getClient(id: number): Promise<Client> {
    const { data } = await this.api.get<Client>(`/clients/${id}`);
    return data;
  }

  async createClient(requestData: { name: string; preferences?: string }): Promise<Client & { message: string }> {
    const { data } = await this.api.post(`/clients`, requestData);
    return data;
  }

  async updateClient(id: number, requestData: { name?: string; preferences?: string }): Promise<Client> {
    const { data } = await this.api.put(`/clients/${id}`, requestData);
    return data;
  }

  async deleteClient(id: number): Promise<{ message: string }> {
    const { data } = await this.api.delete(`/clients/${id}`);
    return data;
  }

  // ==================== STAGE TEMPLATES ====================

  async getStageTemplates(projectType?: ProjectType): Promise<StageTemplate[]> {
    const { data } = await this.api.get<StageTemplate[]>('/stage-templates', {
      params: projectType ? { project_type: projectType } : undefined,
    });
    return data;
  }

  async getStageTemplate(id: number): Promise<StageTemplate> {
    const { data } = await this.api.get<StageTemplate>(`/stage-templates/${id}`);
    return data;
  }

  async createStageTemplate(requestData: StageAttributes & {
    name: string;
    order_number: number;
    default_responsible_id?: number | null;
    estimated_duration_days?: number | null;
    project_type: ProjectType;
  }): Promise<StageTemplate & { message: string }> {
    const { data } = await this.api.post(`/stage-templates`, requestData);
    return data;
  }

  async updateStageTemplate(
    id: number,
    requestData: StageAttributes & {
      name?: string;
      order_number?: number;
      default_responsible_id?: number | null;
      estimated_duration_days?: number | null;
    }
  ): Promise<StageTemplate> {
    const { data } = await this.api.put(`/stage-templates/${id}`, requestData);
    return data;
  }

  async deleteStageTemplate(id: number): Promise<{ message: string }> {
    const { data } = await this.api.delete(`/stage-templates/${id}`);
    return data;
  }

  async reorderStageTemplates(templateOrders: Array<{ id: number; order_number: number }>): Promise<{ message: string }> {
    const { data } = await this.api.put('/stage-templates/reorder', { templates: templateOrders });
    return data;
  }

  // ==================== AUDIT LOGS ====================

  async getAuditLogs(filters?: AuditLogFilters): Promise<AuditLog[]> {
    const { data } = await this.api.get<AuditLog[]>('/audit-logs', { params: filters });
    return data;
  }

  async getAuditLogStats(): Promise<AuditLogStats[]> {
    const { data } = await this.api.get<AuditLogStats[]>('/audit-logs/stats');
    return data;
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export class for custom instances
export default ApiClient;
