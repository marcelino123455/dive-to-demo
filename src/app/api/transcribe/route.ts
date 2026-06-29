import { NextRequest, NextResponse } from "next/server";
import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  TranscriptionJobStatus,
  LanguageCode,
  MediaFormat,
} from "@aws-sdk/client-transcribe";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import {
  TranslateClient,
  TranslateTextCommand,
} from "@aws-sdk/client-translate";
import type { TranscribeRequest, SubtitleSegment } from "@/app/types/subtitle";

const region = process.env.AWS_REGION || "us-east-1";
const bucketName = process.env.TRANSCRIBE_S3_BUCKET || "";

const transcribeClient = new TranscribeClient({ region });
const s3Client = new S3Client({ region });
const translateClient = new TranslateClient({ region });

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  try {
    if (!bucketName) {
      return NextResponse.json(
        { error: "TRANSCRIBE_S3_BUCKET no está configurado en las variables de entorno" },
        { status: 500 }
      );
    }

    const body: TranscribeRequest = await request.json();
    const { audioBase64, languageCode, mediaFormat, translateTo } = body;

    if (!audioBase64 || !languageCode) {
      return NextResponse.json(
        { error: "Se requiere audioBase64 y languageCode" },
        { status: 400 }
      );
    }

    const jobName = `diveo-to-demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const s3Key = `transcribe-input/${jobName}.${mediaFormat || "mp4"}`;
    const audioBuffer = Buffer.from(audioBase64, "base64");

    // Upload audio to S3
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: audioBuffer,
        ContentType: mediaFormat === "webm" ? "audio/webm" : "audio/mp4",
      })
    );

    const mediaUri = `s3://${bucketName}/${s3Key}`;

    // Start transcription job
    await transcribeClient.send(
      new StartTranscriptionJobCommand({
        TranscriptionJobName: jobName,
        LanguageCode: languageCode as LanguageCode,
        MediaFormat: (mediaFormat || "mp4") as MediaFormat,
        Media: { MediaFileUri: mediaUri },
        OutputBucketName: bucketName,
        OutputKey: `transcribe-output/${jobName}.json`,
      })
    );

    // Poll for completion (max ~120 seconds)
    let status: TranscriptionJobStatus | undefined = "IN_PROGRESS";
    let attempts = 0;
    const maxAttempts = 60;

    while (status === "IN_PROGRESS" && attempts < maxAttempts) {
      await sleep(2000);
      attempts++;

      const jobResult = await transcribeClient.send(
        new GetTranscriptionJobCommand({
          TranscriptionJobName: jobName,
        })
      );

      status = jobResult.TranscriptionJob?.TranscriptionJobStatus;

      if (status === "FAILED") {
        // Cleanup S3 input
        await cleanupS3(s3Key, `transcribe-output/${jobName}.json`);
        return NextResponse.json(
          {
            error:
              jobResult.TranscriptionJob?.FailureReason ||
              "Transcripción fallida",
          },
          { status: 500 }
        );
      }
    }

    if (status !== "COMPLETED") {
      await cleanupS3(s3Key, `transcribe-output/${jobName}.json`);
      return NextResponse.json(
        { error: "Timeout esperando la transcripción" },
        { status: 504 }
      );
    }

    // Fetch the transcript result from S3
    const transcriptResult = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: `transcribe-output/${jobName}.json`,
      })
    );

    const transcriptBody = await transcriptResult.Body?.transformToString();
    if (!transcriptBody) {
      await cleanupS3(s3Key, `transcribe-output/${jobName}.json`);
      return NextResponse.json(
        { error: "No se pudo leer el resultado de la transcripción" },
        { status: 500 }
      );
    }

    const transcript = JSON.parse(transcriptBody);

    // Parse items into subtitle segments
    const segments = parseTranscriptToSegments(transcript);

    // Optionally translate segments if translateTo is specified
    let finalSegments = segments;
    if (translateTo && translateTo !== "") {
      // Derive source language from the transcription languageCode (e.g. "es-ES" -> "es")
      const sourceLanguage = languageCode.split("-")[0];

      const batchSize = 10;
      const translatedSegments: SubtitleSegment[] = [];

      for (let i = 0; i < segments.length; i += batchSize) {
        const batch = segments.slice(i, i + batchSize);

        const translationPromises = batch.map(async (segment) => {
          const command = new TranslateTextCommand({
            Text: segment.text,
            SourceLanguageCode: sourceLanguage,
            TargetLanguageCode: translateTo,
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

      finalSegments = translatedSegments;
    }

    // Cleanup S3 files
    await cleanupS3(s3Key, `transcribe-output/${jobName}.json`);

    return NextResponse.json({ segments: finalSegments });
  } catch (error) {
    console.error("Error in transcribe:", error);
    return NextResponse.json(
      { error: "Error interno al transcribir el audio" },
      { status: 500 }
    );
  }
}

function parseTranscriptToSegments(transcript: TranscriptResult): SubtitleSegment[] {
  const items: TranscriptItem[] = transcript.results?.items || [];
  const segments: SubtitleSegment[] = [];

  let currentSegment: {
    words: string[];
    startTime: number;
    endTime: number;
    confidences: number[];
  } | null = null;

  const MAX_SEGMENT_WORDS = 8;
  const MAX_SEGMENT_DURATION = 4; // seconds

  for (const item of items) {
    if (item.type === "punctuation") {
      if (currentSegment) {
        currentSegment.words.push(item.alternatives?.[0]?.content || "");

        // End segment on sentence-ending punctuation
        const punct = item.alternatives?.[0]?.content || "";
        if ([". ", ".", "?", "!", "。"].includes(punct)) {
          segments.push(createSegment(currentSegment));
          currentSegment = null;
        }
      }
      continue;
    }

    // It's a pronunciation item
    const startTime = parseFloat(item.start_time || "0");
    const endTime = parseFloat(item.end_time || "0");
    const word = item.alternatives?.[0]?.content || "";
    const confidence = parseFloat(item.alternatives?.[0]?.confidence || "0");

    if (!currentSegment) {
      currentSegment = {
        words: [word],
        startTime,
        endTime,
        confidences: [confidence],
      };
    } else {
      // Check if we should start a new segment
      const segmentDuration = endTime - currentSegment.startTime;
      if (
        currentSegment.words.length >= MAX_SEGMENT_WORDS ||
        segmentDuration > MAX_SEGMENT_DURATION
      ) {
        segments.push(createSegment(currentSegment));
        currentSegment = {
          words: [word],
          startTime,
          endTime,
          confidences: [confidence],
        };
      } else {
        currentSegment.words.push(word);
        currentSegment.endTime = endTime;
        currentSegment.confidences.push(confidence);
      }
    }
  }

  // Flush remaining segment
  if (currentSegment && currentSegment.words.length > 0) {
    segments.push(createSegment(currentSegment));
  }

  return segments;
}

function createSegment(data: {
  words: string[];
  startTime: number;
  endTime: number;
  confidences: number[];
}): SubtitleSegment {
  const avgConfidence =
    data.confidences.reduce((a, b) => a + b, 0) / data.confidences.length;

  return {
    id: crypto.randomUUID(),
    startTime: data.startTime,
    endTime: data.endTime,
    text: data.words.join(" ").replace(/ ([.,!?;:])/g, "$1"),
    confidence: avgConfidence,
  };
}

async function cleanupS3(inputKey: string, outputKey: string) {
  try {
    await Promise.all([
      s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: inputKey })),
      s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: outputKey })),
    ]);
  } catch {
    // Cleanup failures are non-critical
  }
}

// Types for Amazon Transcribe JSON output
interface TranscriptItem {
  type: "pronunciation" | "punctuation";
  start_time?: string;
  end_time?: string;
  alternatives?: { confidence?: string; content?: string }[];
}

interface TranscriptResult {
  results?: {
    items?: TranscriptItem[];
  };
}
