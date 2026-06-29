import { NextRequest, NextResponse } from "next/server";

export interface VoiceSettings {
  stability: number; // 0-1, lower = more expressive/emotional
  similarity_boost: number; // 0-1, how close to original voice
  style: number; // 0-1, amplifies voice style/emotion
  use_speaker_boost: boolean;
}

export interface SynthesizeRequest {
  segments: { id: string; text: string; startTime: number; endTime: number }[];
  voiceId?: string; // ElevenLabs voice ID
  voiceSettings?: VoiceSettings;
}

export interface AudioSegment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  audioBase64: string; // base64 mp3
}

export interface SynthesizeResponse {
  audioSegments: AudioSegment[];
}

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"; // George

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ELEVENLABS_API_KEY no está configurado en las variables de entorno" },
        { status: 500 }
      );
    }

    const body: SynthesizeRequest = await request.json();
    const { segments, voiceId, voiceSettings } = body;

    if (!segments || segments.length === 0) {
      return NextResponse.json(
        { error: "Se requiere al menos un segmento de texto" },
        { status: 400 }
      );
    }

    const voice = voiceId || DEFAULT_VOICE_ID;

    // Default voice settings optimized for demo narration (expressive but clear)
    const settings = voiceSettings || {
      stability: 0.4,
      similarity_boost: 0.75,
      style: 0.6,
      use_speaker_boost: true,
    };

    const audioSegments: AudioSegment[] = [];

    // Process segments in batches to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < segments.length; i += batchSize) {
      const batch = segments.slice(i, i + batchSize);

      const promises = batch.map(async (segment) => {
        const response = await fetch(`${ELEVENLABS_API_URL}/${voice}`, {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: segment.text,
            model_id: "eleven_multilingual_v2",
            output_format: "mp3_44100_128",
            voice_settings: {
              stability: settings.stability,
              similarity_boost: settings.similarity_boost,
              style: settings.style,
              use_speaker_boost: settings.use_speaker_boost,
            },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `ElevenLabs error (${response.status}): ${errorText}`
          );
        }

        const arrayBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");

        return {
          id: segment.id,
          startTime: segment.startTime,
          endTime: segment.endTime,
          text: segment.text,
          audioBase64: base64,
        };
      });

      const results = await Promise.all(promises);
      audioSegments.push(...results);
    }

    return NextResponse.json({ audioSegments } as SynthesizeResponse);
  } catch (error) {
    console.error("Error in synthesize:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error interno al sintetizar audio",
      },
      { status: 500 }
    );
  }
}
