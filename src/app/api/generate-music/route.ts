import { NextRequest, NextResponse } from "next/server";

export interface GenerateMusicRequest {
  prompt: string; // Text description of desired music
  durationMs: number; // Duration in milliseconds (3000-600000)
  instrumental?: boolean; // Force instrumental (no vocals)
}

export interface GenerateMusicResponse {
  audioBase64: string; // base64 mp3
  durationMs: number;
}

const ELEVENLABS_MUSIC_URL = "https://api.elevenlabs.io/v1/music";

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ELEVENLABS_API_KEY no está configurado en las variables de entorno" },
        { status: 500 }
      );
    }

    const body: GenerateMusicRequest = await request.json();
    const { prompt, durationMs, instrumental } = body;

    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Se requiere un prompt describiendo la música" },
        { status: 400 }
      );
    }

    if (!durationMs || durationMs < 3000 || durationMs > 600000) {
      return NextResponse.json(
        { error: "La duración debe ser entre 3 y 600 segundos" },
        { status: 400 }
      );
    }

    const response = await fetch(ELEVENLABS_MUSIC_URL, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        prompt: prompt.slice(0, 4100),
        music_length_ms: durationMs,
        model_id: "music_v1",
        force_instrumental: instrumental !== false, // Default to instrumental for background music
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs Music error (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    return NextResponse.json({
      audioBase64: base64,
      durationMs,
    } as GenerateMusicResponse);
  } catch (error) {
    console.error("Error in generate-music:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error interno al generar música",
      },
      { status: 500 }
    );
  }
}
