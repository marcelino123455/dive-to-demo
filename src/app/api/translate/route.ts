import { NextRequest, NextResponse } from "next/server";
import {
  TranslateClient,
  TranslateTextCommand,
} from "@aws-sdk/client-translate";
import type { TranslateRequest, SubtitleSegment } from "@/app/types/subtitle";

const region = process.env.AWS_REGION || "us-east-1";
const translateClient = new TranslateClient({ region });

export async function POST(request: NextRequest) {
  try {
    const body: TranslateRequest = await request.json();
    const { segments, sourceLanguage, targetLanguage } = body;

    if (!segments || !targetLanguage) {
      return NextResponse.json(
        { error: "Se requiere segments y targetLanguage" },
        { status: 400 }
      );
    }

    if (segments.length === 0) {
      return NextResponse.json(
        { error: "No hay segmentos para traducir" },
        { status: 400 }
      );
    }

    // Translate each segment in batches to avoid rate limiting
    const batchSize = 10;
    const translatedSegments: SubtitleSegment[] = [];

    for (let i = 0; i < segments.length; i += batchSize) {
      const batch = segments.slice(i, i + batchSize);

      const translationPromises = batch.map(async (segment) => {
        const command = new TranslateTextCommand({
          Text: segment.text,
          SourceLanguageCode: sourceLanguage || "auto",
          TargetLanguageCode: targetLanguage,
        });

        const result = await translateClient.send(command);

        return {
          ...segment,
          text: result.TranslatedText || segment.text,
        };
      });

      const batchResults = await Promise.all(translationPromises);
      translatedSegments.push(...batchResults);
    }

    return NextResponse.json({ segments: translatedSegments });
  } catch (error) {
    console.error("Error in translate:", error);
    return NextResponse.json(
      { error: "Error interno al traducir los subtítulos" },
      { status: 500 }
    );
  }
}
