// Web Speech API voice-to-text for the assistant composer (design.md task
// 5.4). The API is experimental and not part of the DOM spec, so its types
// are declared here and support is feature-detected at runtime — on
// unsupported browsers (e.g. Firefox) the hook returns `supported: false`
// and the composer hides the mic button. Transcription happens entirely in
// the browser; no server call is involved.
//
// The session runs in `continuous` mode: it keeps listening between phrases
// and only ends when the user presses the stop button (or the engine gives
// up after very long silence). Finalized segments accumulate in a ref and
// are flushed to the caller once the session ends.

import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognition;

function getSpeechRecognition(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function describeError(code: string): string {
  switch (code) {
    case 'not-allowed':
      return 'Permiso de micrófono denegado.';
    case 'no-speech':
      return 'No se detectó audio.';
    case 'audio-capture':
      return 'No hay micrófono disponible.';
    case 'network':
      return 'Error de red al transcribir el audio.';
    default:
      return 'No se pudo transcribir el audio.';
  }
}

export function useVoiceInput(onFinalResult: (transcript: string) => void) {
  const onFinalRef = useRef(onFinalResult);
  onFinalRef.current = onFinalResult;
  const [supported] = useState(() => getSpeechRecognition() !== undefined);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const transcriptRef = useRef('');
  const listeningRef = useRef(false);

  const finish = (transcript: string) => {
    const text = transcript.trim();
    if (text) onFinalRef.current(text);
    transcriptRef.current = '';
  };

  // Abort any in-flight session on unmount so the mic indicator never leaks.
  useEffect(() => {
    return () => {
      const instance = recognitionRef.current;
      if (instance) {
        try {
          instance.abort();
        } catch {
          // no-op
        }
      }
    };
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    setError(null);
    // A fresh instance per session: some engines refuse to restart the same
    // instance after `onend`.
    const instance = new Ctor();
    instance.lang = 'es-AR';
    // Continuous session: only the stop button (or very long silence) ends
    // the recording. `interimResults` stays off so we only accumulate
    // finalized segments, one per spoken phrase.
    instance.continuous = true;
    instance.interimResults = false;
    instance.maxAlternatives = 1;
    transcriptRef.current = '';
    instance.onresult = (event) => {
      // `event.results` grows for the whole session; `resultIndex` marks the
      // first segment not yet processed, so each phrase is appended exactly
      // once.
      const segments: string[] = [];
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) segments.push(result[0].transcript);
      }
      if (segments.length > 0) {
        transcriptRef.current = transcriptRef.current
          ? `${transcriptRef.current} ${segments.join(' ')}`
          : segments.join(' ');
      }
    };
    instance.onerror = (event) => {
      if (event.error === 'aborted') return;
      setError(describeError(event.error));
    };
    instance.onend = () => {
      listeningRef.current = false;
      setListening(false);
      finish(transcriptRef.current);
    };
    recognitionRef.current = instance;
    try {
      instance.start();
      listeningRef.current = true;
      setListening(true);
    } catch {
      listeningRef.current = false;
      setListening(false);
    }
  }, []);

  const stop = useCallback(() => {
    const instance = recognitionRef.current;
    if (!instance) return;
    recognitionRef.current = null;
    try {
      instance.stop();
    } catch {
      // fall through to the abort fallback below
    }
    // Chrome sometimes fails to fire `onend` after stop() on continuous
    // sessions; abort() is the guaranteed teardown path.
    window.setTimeout(() => {
      if (listeningRef.current) {
        try {
          instance.abort();
        } catch {
          // no-op
        }
        listeningRef.current = false;
        setListening(false);
      }
    }, 2000);
  }, []);

  return { supported, listening, error, start, stop };
}