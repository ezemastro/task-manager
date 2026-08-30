// Dedicated axios client for the assistant feature (design.md D6).
// apiClient.ts is a large shared class carrying dead methods against
// non-existent auth routes; this module only mirrors its axios construction
// (same baseURL, same withCredentials) and stays isolated and conflict-free.

import axios, { type AxiosInstance } from 'axios';
import type { ConfirmResponse, HistoryMessage, ProgressResponse, StatusResponse, TurnResponse } from './types';

const assistantHttp: AxiosInstance = axios.create({
  baseURL: window.location.origin + '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string } | undefined;
    if (typeof data?.error === 'string' && data.error.trim() !== '') {
      return data.error;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Error desconocido';
}

export async function getStatus(): Promise<StatusResponse> {
  try {
    const { data } = await assistantHttp.get<StatusResponse>('/assistant/status');
    return data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
}

export async function postChat(
  message: string,
  history: HistoryMessage[],
  turnId?: string
): Promise<TurnResponse> {
  try {
    const { data } = await assistantHttp.post<TurnResponse>('/assistant/chat', {
      message,
      history,
      turnId,
    });
    return data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
}

/**
 * Best-effort live progress poll for a turn in flight. Never throws — a
 * network hiccup or a missed poll must never surface as a chat error; the
 * final chat response's own `steps` field is the source of truth regardless
 * (design: client-generated turn id + progress polling).
 */
export async function getProgress(turnId: string): Promise<ProgressResponse> {
  try {
    const { data } = await assistantHttp.get<ProgressResponse>(`/assistant/progress/${encodeURIComponent(turnId)}`);
    return data;
  } catch {
    return { steps: [] };
  }
}

/** Human-only: confirms a destructive pending action. The model never calls this. */
export async function postConfirm(token: string): Promise<ConfirmResponse> {
  try {
    const { data } = await assistantHttp.post<ConfirmResponse>('/assistant/confirm', { token });
    return data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
}

/** Human-only: discards a pending destructive action without executing it. */
export async function postCancel(token: string): Promise<ConfirmResponse> {
  try {
    const { data } = await assistantHttp.post<ConfirmResponse>('/assistant/cancel', { token });
    return data;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
}
