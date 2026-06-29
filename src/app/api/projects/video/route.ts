import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
const PROJECTS_BUCKET = process.env.PROJECTS_S3_BUCKET!;

// Helper: check if an S3 object exists
async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const ulidVideo = searchParams.get("ulidVideo");
    const extension = searchParams.get("ext") || "mp4";

    if (!userId || !ulidVideo) {
      return NextResponse.json(
        { error: "Se requiere userId y ulidVideo" },
        { status: 400 }
      );
    }

    // Presigned URL para el video
    const videoKey = `${userId}/${ulidVideo}/video.${extension}`;
    const videoUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: PROJECTS_BUCKET, Key: videoKey }),
      { expiresIn: 3600 }
    );

    // Intentar generar presigned URLs para audios TTS
    // Se pasan los IDs de audio como parámetro separado por comas
    const audioIds = searchParams.get("audioIds");
    const audioUrls: Record<string, string> = {};

    if (audioIds) {
      const ids = audioIds.split(",").filter(Boolean);
      for (const id of ids) {
        try {
          const audioKey = `${userId}/${ulidVideo}/audio/${id}.mp3`;
          // Only generate URL if the object actually exists
          if (await objectExists(PROJECTS_BUCKET, audioKey)) {
            const url = await getSignedUrl(
              s3Client,
              new GetObjectCommand({ Bucket: PROJECTS_BUCKET, Key: audioKey }),
              { expiresIn: 3600 }
            );
            audioUrls[id] = url;
          }
        } catch {
          // Si no existe el archivo, omitir silenciosamente
        }
      }
    }

    // Presigned URL para la música de fondo
    let musicUrl: string | null = null;
    const hasMusic = searchParams.get("hasMusic") === "true";
    if (hasMusic) {
      try {
        const musicKey = `${userId}/${ulidVideo}/music/track.mp3`;
        // Only generate URL if the object actually exists
        if (await objectExists(PROJECTS_BUCKET, musicKey)) {
          musicUrl = await getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: PROJECTS_BUCKET, Key: musicKey }),
            { expiresIn: 3600 }
          );
        }
      } catch {
        // Si no existe, omitir
      }
    }

    return NextResponse.json({ url: videoUrl, audioUrls, musicUrl });
  } catch (err) {
    console.error("Error generating presigned URLs:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al obtener los archivos" },
      { status: 500 }
    );
  }
}
