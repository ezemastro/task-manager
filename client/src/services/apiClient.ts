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
  email?: string;
  phone?: string;
  created_at: string;
}

export interface StageTemplate {
  id: number;
  name: string;
  order_number: number;
  default_responsible_id?: number;
  default_responsible_name?: string;
  estimated_duration_days?: number;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  description?: string;
  status: string;
  client_id?: number;
  client_name?: string;
  deadline?: string;
  created_at: string;
  updated_at: string;
  total_stages?: number;
  completed_stages?: number;
  current_stage?: string;
}

export interface Stage {
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

export interface StageDetail {
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
  description?: string;
  client_id?: number;
  deadline?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  status?: string;
  client_id?: number;
  deadline?: string;
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
  author: string;
}

export interface AddTagToStageRequest {
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

// ==================== API CLIENT ====================

class ApiClient {
  private baseURL: string;

  constructor(baseURL: string = window.location.origin + '/api') {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(error.error || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
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
    return this.request<Project[]>(`/projects${query}`);
  }

  async getProject(id: number): Promise<Project & { stages: Stage[] }> {
    return this.request<Project & { stages: Stage[] }>(`/projects/${id}`);
  }

  async createProject(data: CreateProjectRequest): Promise<{ id: number; message: string } & CreateProjectRequest> {
    return this.request(`/projects`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProject(id: number, data: UpdateProjectRequest): Promise<{ message: string }> {
    return this.request(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteProject(id: number): Promise<{ message: string }> {
    return this.request(`/projects/${id}`, {
      method: 'DELETE',
    });
  }

  // ==================== STAGES ====================

  async getStages(filters?: StageFilters): Promise<Stage[]> {
    const query = filters ? this.buildQueryString(filters as Record<string, string | number | boolean | undefined>) : '';
    return this.request<Stage[]>(`/stages${query}`);
  }

  async getStage(id: number): Promise<StageDetail> {
    return this.request<StageDetail>(`/stages/${id}`);
  }

  async createStage(data: CreateStageRequest): Promise<{ id: number; message: string } & CreateStageRequest & { order_number: number }> {
    return this.request(`/stages`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateStage(id: number, data: UpdateStageRequest): Promise<{ message: string }> {
    return this.request(`/stages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async completeStage(id: number): Promise<{ message: string }> {
    return this.request(`/stages/${id}/complete`, {
      method: 'PUT',
    });
  }

  async uncompleteStage(id: number): Promise<{ message: string }> {
    return this.request(`/stages/${id}/uncomplete`, {
      method: 'PUT',
    });
  }

  async startStage(id: number): Promise<{ message: string }> {
    return this.request(`/stages/${id}/start`, {
      method: 'PUT',
    });
  }

  async deleteStage(id: number): Promise<{ message: string }> {
    return this.request(`/stages/${id}`, {
      method: 'DELETE',
    });
  }

  async addTagToStage(stageId: number, data: AddTagToStageRequest): Promise<{ message: string }> {
    return this.request(`/stages/${stageId}/tags`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async removeTagFromStage(stageId: number, tagId: number): Promise<{ message: string }> {
    return this.request(`/stages/${stageId}/tags/${tagId}`, {
      method: 'DELETE',
    });
  }

  // ==================== TAGS ====================

  async getTags(): Promise<Tag[]> {
    return this.request<Tag[]>('/tags');
  }

  async getTag(id: number): Promise<Tag> {
    return this.request<Tag>(`/tags/${id}`);
  }

  async createTag(data: CreateTagRequest): Promise<{ id: number; message: string } & CreateTagRequest> {
    return this.request(`/tags`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTag(id: number, data: UpdateTagRequest): Promise<{ message: string }> {
    return this.request(`/tags/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteTag(id: number): Promise<{ message: string }> {
    return this.request(`/tags/${id}`, {
      method: 'DELETE',
    });
  }

  // ==================== USERS ====================

  async getUsers(filters?: UserFilters): Promise<User[]> {
    const query = filters ? this.buildQueryString(filters as Record<string, string | number | boolean | undefined>) : '';
    return this.request<User[]>(`/users${query}`);
  }

  async getUser(id: number): Promise<User> {
    return this.request<User>(`/users/${id}`);
  }

  async createUser(data: CreateUserRequest): Promise<{ id: number; message: string } & CreateUserRequest> {
    return this.request(`/users`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateUser(id: number, data: UpdateUserRequest): Promise<{ message: string }> {
    return this.request(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteUser(id: number): Promise<{ message: string }> {
    return this.request(`/users/${id}`, {
      method: 'DELETE',
    });
  }

  // ==================== COMMENTS ====================

  async getComments(): Promise<Comment[]> {
    return this.request<Comment[]>('/comments');
  }

  async getStageComments(stageId: number): Promise<Comment[]> {
    return this.request<Comment[]>(`/stages/${stageId}/comments`);
  }

  async createComment(data: CreateCommentRequest): Promise<{ id: number; message: string } & CreateCommentRequest> {
    return this.request(`/comments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteComment(id: number): Promise<{ message: string }> {
    return this.request(`/comments/${id}`, {
      method: 'DELETE',
    });
  }

  // ==================== CLIENTS ====================

  async getClients(): Promise<Client[]> {
    return this.request<Client[]>('/clients');
  }

  async getClient(id: number): Promise<Client> {
    return this.request<Client>(`/clients/${id}`);
  }

  async createClient(data: { name: string; email?: string; phone?: string }): Promise<Client & { message: string }> {
    return this.request(`/clients`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateClient(id: number, data: { name?: string; email?: string; phone?: string }): Promise<Client> {
    return this.request(`/clients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteClient(id: number): Promise<{ message: string }> {
    return this.request(`/clients/${id}`, {
      method: 'DELETE',
    });
  }

  // ==================== STAGE TEMPLATES ====================

  async getStageTemplates(): Promise<StageTemplate[]> {
    return this.request<StageTemplate[]>('/stage-templates');
  }

  async getStageTemplate(id: number): Promise<StageTemplate> {
    return this.request<StageTemplate>(`/stage-templates/${id}`);
  }

  async createStageTemplate(data: {
    name: string;
    order_number: number;
    default_responsible_id?: number;
    estimated_duration_days?: number;
  }): Promise<StageTemplate & { message: string }> {
    return this.request(`/stage-templates`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateStageTemplate(
    id: number,
    data: {
      name?: string;
      order_number?: number;
      default_responsible_id?: number;
      estimated_duration_days?: number;
    }
  ): Promise<StageTemplate> {
    return this.request(`/stage-templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteStageTemplate(id: number): Promise<{ message: string }> {
    return this.request(`/stage-templates/${id}`, {
      method: 'DELETE',
    });
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export class for custom instances
export default ApiClient;
