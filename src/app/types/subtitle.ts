export interface SubtitleSegment {
  id: string;
  startTime: number; // seconds
  endTime: number; // seconds
  text: string;
  confidence: number; // 0-1
}

export interface TranscribeRequest {
  audioBase64: string; // base64 encoded audio (webm/mp4)
  languageCode: string; // e.g. "es-ES", "en-US"
  mediaFormat: string; // "mp4" | "webm"
  translateTo?: string; // optional target language for translation (e.g. "en", "es")
}

export interface TranscribeResponse {
  segments: SubtitleSegment[];
}

export interface TranslateRequest {
  segments: SubtitleSegment[];
  sourceLanguage: string; // e.g. "es", "en", "auto"
  targetLanguage: string; // e.g. "en", "es", "fr"
}

export interface TranslateResponse {
  segments: SubtitleSegment[];
}

export type SupportedLanguage = {
  code: string;
  label: string;
};

export type TranslateLanguage = {
  code: string;
  label: string;
};

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: "es-ES", label: "Español (España)" },
  { code: "es-US", label: "Español (EE.UU.)" },
  { code: "en-US", label: "Inglés (EE.UU.)" },
  { code: "en-GB", label: "Inglés (UK)" },
  { code: "pt-BR", label: "Portugués (Brasil)" },
  { code: "fr-FR", label: "Francés" },
  { code: "de-DE", label: "Alemán" },
  { code: "it-IT", label: "Italiano" },
  { code: "ja-JP", label: "Japonés" },
  { code: "ko-KR", label: "Coreano" },
  { code: "zh-CN", label: "Chino (Simplificado)" },
];

// Idiomas soportados por Amazon Translate (código ISO 639-1)
export const TRANSLATE_LANGUAGES: TranslateLanguage[] = [
  { code: "auto", label: "Detectar automáticamente" },
  { code: "es", label: "Español" },
  { code: "en", label: "Inglés" },
  { code: "pt", label: "Portugués" },
  { code: "fr", label: "Francés" },
  { code: "de", label: "Alemán" },
  { code: "it", label: "Italiano" },
  { code: "ja", label: "Japonés" },
  { code: "ko", label: "Coreano" },
  { code: "zh", label: "Chino" },
  { code: "ar", label: "Árabe" },
  { code: "hi", label: "Hindi" },
  { code: "ru", label: "Ruso" },
  { code: "nl", label: "Neerlandés" },
  { code: "pl", label: "Polaco" },
  { code: "sv", label: "Sueco" },
  { code: "tr", label: "Turco" },
  { code: "vi", label: "Vietnamita" },
  { code: "th", label: "Tailandés" },
  { code: "ca", label: "Catalán" },
];
