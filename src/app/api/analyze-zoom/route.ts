import { NextRequest, NextResponse } from "next/server";
import {
  BedrockRuntimeClient,
  ConverseCommand,
  ImageBlock,
  ContentBlock,
} from "@aws-sdk/client-bedrock-runtime";
import type { AnalyzeZoomRequest, ZoomKeyframe } from "@/app/types/zoom";

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
});

const MODEL_ID = process.env.BEDROCK_MODEL_ID || "us.anthropic.claude-haiku-4-5-20251001-v1:0";

const SYSTEM_PROMPT = `Eres un experto en edición de video para demos y tutoriales de software.
Tu tarea es analizar frames de un screencast y determinar dónde aplicar zooms automáticos para resaltar la acción importante.

Criterios para sugerir un zoom:
- Clicks en botones, menús o elementos interactivos
- Áreas donde se está escribiendo texto
- Tooltips, modales o popups que aparecen
- Cambios visuales significativos en una región específica
- Áreas pequeñas con detalle importante que el espectador podría perder

Reglas:
- No hagas zoom en todo el video, solo en momentos clave (máximo 1 zoom cada 5-8 segundos)
- Cada zoom debe durar entre 2 y 5 segundos
- El scale debe ser entre 1.5 y 2.5 (nunca más de 3)
- Las coordenadas x,y son relativas (0-1) donde 0,0 es top-left y 1,1 es bottom-right
- Asegúrate de que el zoom no salga de los bordes del video
- Prioriza calidad sobre cantidad: menos zooms pero bien ubicados

Responde SOLO con un JSON array válido. No incluyas markdown ni texto adicional.
Formato de cada elemento:
{
  "startTime": number (segundo de inicio),
  "endTime": number (segundo de fin),
  "x": number (0-1, centro horizontal del zoom),
  "y": number (0-1, centro vertical del zoom),
  "scale": number (1.5-2.5),
  "reason": string (breve explicación en español)
}`;

export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeZoomRequest = await request.json();
    const { frames, videoDuration, videoWidth, videoHeight } = body;

    if (!frames || frames.length === 0) {
      return NextResponse.json(
        { error: "No se proporcionaron frames para analizar" },
        { status: 400 }
      );
    }

    // Construir el contenido con imágenes para el modelo
    const contentBlocks: ContentBlock[] = [];

    // Texto introductorio
    contentBlocks.push({
      text: `Analiza estos ${frames.length} frames de un video de screencast/demo.
Datos del video:
- Duración total: ${videoDuration.toFixed(1)} segundos
- Resolución: ${videoWidth}x${videoHeight}
- Frames capturados cada ${(videoDuration / frames.length).toFixed(1)} segundos aproximadamente

Los frames están en orden cronológico. Cada frame tiene su timestamp indicado.
Determina los puntos óptimos para aplicar zoom automático.`,
    });

    // Agregar cada frame como imagen
    for (const frame of frames) {
      contentBlocks.push({
        text: `Frame en t=${frame.timestamp.toFixed(1)}s:`,
      });

      const imageBlock: ImageBlock = {
        format: "jpeg",
        source: {
          bytes: Buffer.from(frame.data, "base64"),
        },
      };

      contentBlocks.push({ image: imageBlock });
    }

    contentBlocks.push({
      text: "Basándote en el análisis de estos frames, devuelve el JSON array con los zooms sugeridos.",
    });

    const command = new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: SYSTEM_PROMPT }],
      messages: [
        {
          role: "user",
          content: contentBlocks,
        },
      ],
      inferenceConfig: {
        maxTokens: 4096,
        temperature: 0.3,
      },
    });

    const response = await client.send(command);

    const assistantMessage = response.output?.message?.content?.[0];
    if (!assistantMessage || !("text" in assistantMessage) || !assistantMessage.text) {
      return NextResponse.json(
        { error: "No se recibió respuesta del modelo" },
        { status: 500 }
      );
    }

    // Parsear la respuesta JSON
    let rawText = assistantMessage.text.trim();

    // Intentar extraer JSON si viene envuelto en markdown
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      rawText = jsonMatch[0];
    }

    const parsed = JSON.parse(rawText);

    // Validar y mapear la respuesta
    const keyframes: ZoomKeyframe[] = parsed.map(
      (item: {
        startTime: number;
        endTime: number;
        x: number;
        y: number;
        scale: number;
        reason?: string;
      }) => ({
        id: crypto.randomUUID(),
        startTime: Math.max(0, item.startTime),
        endTime: Math.min(videoDuration, item.endTime),
        x: Math.max(0, Math.min(1, item.x)),
        y: Math.max(0, Math.min(1, item.y)),
        scale: Math.max(1.2, Math.min(3, item.scale)),
        reason: item.reason || "",
      })
    );

    return NextResponse.json({ keyframes });
  } catch (error) {
    console.error("Error analyzing zoom:", error);

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Error al parsear la respuesta del modelo" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Error interno al analizar el video" },
      { status: 500 }
    );
  }
}
