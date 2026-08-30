// useReducer state machine driving the chat transcript (design.md section 9
// "State model"). Calls assistantApi.postChat, appends messages, renders
// meta.degraded text inline (the deterministic failure message is already
// inside `reply`, so no extra copy is needed here), executes `navigate`
// directives via useNavigate(), emits resource hints on the data bus so
// mounted pages refresh in place, and renders PendingActionCard when a
// destructive action is awaiting human confirmation.
//
// Navigation and confirmation are Slice 4 additions (design.md "Navigation",
// ADR D4). The model never confirms or cancels on its own — only
// handleConfirm/handleCancel below, triggered exclusively by a human click
// on PendingActionCard, ever call postConfirm/postCancel.

import { useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Typography } from '@mui/material';
import AssistantComposer from './AssistantComposer';
import AssistantMessageList from './AssistantMessageList';
import AssistantProgressSteps from './AssistantProgressSteps';
import PendingActionCard from './PendingActionCard';
import { getProgress, postCancel, postChat, postConfirm } from './assistantApi';
import { useAssistantDataBus } from './AssistantDataBus';
import type { ChatMessage, ChatState, PendingAction, ProgressStep } from './types';

/** Progress polling cadence while a turn is in flight (design: client-generated turn id + progress polling, not SSE). */
const PROGRESS_POLL_INTERVAL_MS = 750;

function generateTurnId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (older browsers).
  // This id carries no authority — see aiProgress.ts — so a lower-entropy
  // fallback is acceptable; it is only ever used as an in-memory bucket key.
  return `turn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type ChatAction =
  | { type: 'SEND_START'; message: ChatMessage }
  | { type: 'SEND_SUCCESS'; message: ChatMessage; pending: PendingAction | null }
  | { type: 'SEND_ERROR'; error: string }
  | { type: 'ACTION_START' }
  | { type: 'ACTION_SUCCESS'; message: ChatMessage }
  | { type: 'ACTION_ERROR'; error: string };

const initialState: ChatState = {
  messages: [],
  status: 'idle',
  pending: null,
  error: null,
};

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SEND_START':
      return {
        ...state,
        messages: [...state.messages, action.message],
        status: 'sending',
        error: null,
      };
    case 'SEND_SUCCESS':
      return {
        ...state,
        messages: [...state.messages, action.message],
        status: 'idle',
        pending: action.pending,
      };
    case 'SEND_ERROR':
      return { ...state, status: 'error', error: action.error };
    case 'ACTION_START':
      return { ...state, status: 'sending', error: null };
    case 'ACTION_SUCCESS':
      return {
        ...state,
        messages: [...state.messages, action.message],
        status: 'idle',
        pending: null,
      };
    case 'ACTION_ERROR':
      return { ...state, status: 'error', error: action.error, pending: null };
    default:
      return state;
  }
}

let messageCounter = 0;
function nextMessageId(): string {
  messageCounter += 1;
  return `assistant-msg-${Date.now()}-${messageCounter}`;
}

export default function AssistantChat() {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  // Prior-turn messages, captured before the new user message is appended —
  // this is exactly the `history` the server expects alongside `message`.
  const historyRef = useRef(state.messages);
  historyRef.current = state.messages;
  // `null` when rendered outside AssistantDataBusProvider (should not happen
  // in the app, but emit() must degrade to a no-op rather than throw).
  const dataBus = useAssistantDataBus();
  // AssistantChat renders inside AssistantWidget's Drawer, itself mounted
  // inside ProtectedRoute inside App.tsx's <BrowserRouter> (main.tsx), so
  // router context is always available here.
  const navigate = useNavigate();

  // Live progress (design: client-generated turn id + progress polling).
  // `connecting` is true from the moment the request is dispatched until the
  // first poll returns anything — a purely client-side "conectando" state,
  // since nothing server-side exists yet to poll for. `liveSteps` mirrors the
  // in-flight turn's steps; the final response's own `steps` field is always
  // the source of truth and overwrites whatever polling produced.
  const [connecting, setConnecting] = useState(false);
  const [liveSteps, setLiveSteps] = useState<ProgressStep[]>([]);
  const turnIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  // Never leave a poll timer running past unmount (e.g. the drawer closes
  // mid-turn).
  useEffect(() => stopPolling, []);

  const handleSend = async (content: string) => {
    const priorHistory = historyRef.current.map(({ role, content: text }) => ({ role, content: text }));
    const userMessage: ChatMessage = { id: nextMessageId(), role: 'user', content };
    dispatch({ type: 'SEND_START', message: userMessage });

    const turnId = generateTurnId();
    turnIdRef.current = turnId;
    setLiveSteps([]);
    setConnecting(true);
    stopPolling();
    pollTimerRef.current = window.setInterval(async () => {
      const polled = await getProgress(turnId);
      // Ignore a stale poll answering a turn that already finished (or a
      // new one already started) — polling is purely an enhancement and
      // must never fight the authoritative response.
      if (turnIdRef.current !== turnId) return;
      if (polled.steps.length > 0) setConnecting(false);
      setLiveSteps(polled.steps);
    }, PROGRESS_POLL_INTERVAL_MS);

    try {
      const response = await postChat(content, priorHistory, turnId);
      const assistantMessage: ChatMessage = {
        id: nextMessageId(),
        role: 'assistant',
        content: response.reply,
        degraded: response.meta.degraded,
        steps: response.steps,
      };
      dispatch({ type: 'SEND_SUCCESS', message: assistantMessage, pending: response.pending ?? null });
      // Only an explicit `navigate` directive ever triggers a route change —
      // no other assistant output is interpreted as one (specs/
      // assistant-navigation "Navigation Response Contract").
      if (response.navigate) {
        navigate(response.navigate);
      }
      if (response.resources.length > 0) {
        dataBus?.emit(response.resources);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Ocurrió un error inesperado al contactar al asistente.';
      dispatch({ type: 'SEND_ERROR', error: message });
    } finally {
      stopPolling();
      turnIdRef.current = null;
      setConnecting(false);
      setLiveSteps([]);
    }
  };

  const handleConfirm = async () => {
    if (!state.pending) return;
    const { token } = state.pending;
    dispatch({ type: 'ACTION_START' });
    try {
      const response = await postConfirm(token);
      const assistantMessage: ChatMessage = { id: nextMessageId(), role: 'assistant', content: response.reply };
      dispatch({ type: 'ACTION_SUCCESS', message: assistantMessage });
      if (response.resources.length > 0) {
        dataBus?.emit(response.resources);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo confirmar la acción.';
      dispatch({ type: 'ACTION_ERROR', error: message });
    }
  };

  const handleCancel = async () => {
    if (!state.pending) return;
    const { token } = state.pending;
    dispatch({ type: 'ACTION_START' });
    try {
      const response = await postCancel(token);
      const assistantMessage: ChatMessage = { id: nextMessageId(), role: 'assistant', content: response.reply };
      dispatch({ type: 'ACTION_SUCCESS', message: assistantMessage });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo cancelar la acción.';
      dispatch({ type: 'ACTION_ERROR', error: message });
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <AssistantMessageList messages={state.messages} />
      {state.status === 'sending' && (
        <Box sx={{ px: 1.5, pb: 0.5 }}>
          {liveSteps.length === 0 ? (
            <Typography
              variant="caption"
              sx={{ color: 'text.disabled', fontStyle: 'italic' }}
            >
              {connecting ? 'Conectando...' : 'Pensando...'}
            </Typography>
          ) : (
            <AssistantProgressSteps steps={liveSteps} />
          )}
        </Box>
      )}
      {state.status === 'error' && state.error && (
        <Alert severity="error" sx={{ mx: 1.5, mb: 1 }}>
          {state.error}
        </Alert>
      )}
      {state.pending && (
        <PendingActionCard
          pending={state.pending}
          busy={state.status === 'sending'}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
      <AssistantComposer disabled={state.status === 'sending' || state.pending !== null} onSend={handleSend} />
    </Box>
  );
}
