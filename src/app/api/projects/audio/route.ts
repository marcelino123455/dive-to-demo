import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
const PROJECTS_BUCKET = process.env.PROJECTS_S3_BUCKET!;

/**
 * Proxy endpoint to serve audio files from S3.
 * This avoids browser issues with presigned URLs for <audio> elements.
 * 
 * Query params:
 * - userId (required)
 * - ulidVideo (required)
 * - audioId (required) - the audio segment ID, or "music" for background music
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const ulidVideo = searchParams.get("ulidVideo");
    const audioId = searchParams.get("audioId");

    if (!userId || !ulidVideo || !audioId) {
      return NextResponse.json(
        { error: "Se requiere userId, ulidVideo y audioId" },
        { status: 400 }
      );
    }

    // Determine the S3 key based on whether it's music or a TTS segment
    const s3Key = audioId === "music"
      ? `${userId}/${ulidVideo}/music/track.mp3`
      : `${userId}/${ulidVideo}/audio/${audioId}.mp3`;

    const command = new GetObjectCommand({
      Bucket: PROJECTS_BUCKET,
      Key: s3Key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      return NextResponse.json(
        { error: "Audio file not found" },
        { status: 404 }
      );
    }

    // Convert the S3 stream to a buffer
    const bytes = await response.Body.transformToByteArray();

    // Return the audio as a proper response with correct headers
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": bytes.length.toString(),
        "Cache-Control": "private, max-age=3600",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (err: unknown) {
    // Check if it's a NoSuchKey error
    if (err && typeof err === "object" && "name" in err && err.name === "NoSuchKey") {
      return NextResponse.json(
        { error: "Audio file not found" },
        { status: 404 }
      );
    }

    console.error("Error serving audio:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al obtener el audio" },
      { status: 500 }
    );
  }
}
