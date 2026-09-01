// Web Speech API voice-to-text for the assistant composer (design.md task
// 5.4). The API is experimental and not part of the DOM spec, so its types
// are declared here and support is feature-detected at runtime — on
// unsupported browsers (e.g. Firefox) the hook returns `supported: false`
// and the composer hides the mic button. Transcription happens entirely in
// the browser; no server call is involved.

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
    instance.continuous = false;
    instance.interimResults = false;
    instance.maxAlternatives = 1;
    instance.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(' ')
        .trim();
      if (transcript) onFinalRef.current(transcript);
    };
    instance.onerror = (event) => {
      if (event.error === 'aborted') return;
      setError(describeError(event.error));
    };
    instance.onend = () => setListening(false);
    recognitionRef.current = instance;
    try {
      instance.start();
      setListening(true);
    } catch {
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
      setListening(false);
    }
  }, []);

  return { supported, listening, error, start, stop };
}