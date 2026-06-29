import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";

const s3Client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const PROJECTS_BUCKET = process.env.PROJECTS_S3_BUCKET!;
const PROJECTS_TABLE = process.env.DYNAMODB_PROJECTS_TABLE || "db-user-projects";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const videoFile = formData.get("video") as File | null;
    const userId = formData.get("userId") as string | null;
    const videoName = formData.get("videoName") as string | null;
    const edits = formData.get("edits") as string | null;

    if (!videoFile || !userId) {
      return NextResponse.json(
        { error: "Se requiere el video y el userId" },
        { status: 400 }
      );
    }

    // Generar ULID para el video
    const ulidVideo = ulid();

    // Leer video como buffer
    const arrayBuffer = await videoFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determinar content type
    const contentType = videoFile.type || "video/mp4";
    const extension = contentType.includes("webm") ? "webm" : "mp4";

    // Estructura de S3 key: userId/ulidVideo/video.ext
    const s3Key = `${userId}/${ulidVideo}/video.${extension}`;

    // Subir video a S3
    await s3Client.send(
      new PutObjectCommand({
        Bucket: PROJECTS_BUCKET,
        Key: s3Key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    const uriS3 = `s3://${PROJECTS_BUCKET}/${s3Key}`;

    // Subir archivos de audio TTS a S3
    const audioS3Keys: { id: string; s3Key: string }[] = [];
    let i = 0;
    while (formData.has(`audio_${i}`)) {
      const audioFile = formData.get(`audio_${i}`) as File;
      const audioId = formData.get(`audio_${i}_id`) as string;
      if (audioFile && audioId) {
        const audioKey = `${userId}/${ulidVideo}/audio/${audioId}.mp3`;
        const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
        await s3Client.send(
          new PutObjectCommand({
            Bucket: PROJECTS_BUCKET,
            Key: audioKey,
            Body: audioBuffer,
            ContentType: "audio/mpeg",
          })
        );
        audioS3Keys.push({ id: audioId, s3Key: audioKey });
      }
      i++;
    }

    // Subir música de fondo a S3
    let musicS3Key: string | null = null;
    const musicFile = formData.get("music") as File | null;
    if (musicFile) {
      musicS3Key = `${userId}/${ulidVideo}/music/track.mp3`;
      const musicBuffer = Buffer.from(await musicFile.arrayBuffer());
      await s3Client.send(
        new PutObjectCommand({
          Bucket: PROJECTS_BUCKET,
          Key: musicS3Key,
          Body: musicBuffer,
          ContentType: "audio/mpeg",
        })
      );
    }

    // Parsear metadata de ediciones
    let editsData: Record<string, unknown> = {};
    if (edits) {
      try {
        editsData = JSON.parse(edits);
      } catch {
        // Si el JSON es inválido, guardar vacío
      }
    }

    // Agregar las keys de S3 de audio a los edits
    if (audioS3Keys.length > 0) {
      editsData.audioS3Keys = audioS3Keys;
    }
    if (musicS3Key) {
      editsData.musicS3Key = musicS3Key;
    }

    // Guardar registro en DynamoDB
    const now = new Date().toISOString();
    await docClient.send(
      new PutCommand({
        TableName: PROJECTS_TABLE,
        Item: {
          userId,
          ulidVideo,
          uri_s3: uriS3,
          videoName: videoName || `video.${extension}`,
          edits: editsData,
          createdAt: now,
          updatedAt: now,
        },
      })
    );

    return NextResponse.json({
      ulidVideo,
      uri_s3: uriS3,
      message: "Proyecto guardado correctamente",
    });
  } catch (err) {
    console.error("Error saving project:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al guardar el proyecto" },
      { status: 500 }
    );
  }
}


export async function PUT(request: NextRequest) {
  try {
    const formData = await request.formData();

    const userId = formData.get("userId") as string | null;
    const ulidVideo = formData.get("ulidVideo") as string | null;
    const videoName = formData.get("videoName") as string | null;
    const edits = formData.get("edits") as string | null;

    if (!userId || !ulidVideo) {
      return NextResponse.json(
        { error: "Se requiere userId y ulidVideo para actualizar" },
        { status: 400 }
      );
    }

    // Subir archivos de audio TTS nuevos a S3
    const audioS3Keys: { id: string; s3Key: string }[] = [];
    let i = 0;
    while (formData.has(`audio_${i}`)) {
      const audioFile = formData.get(`audio_${i}`) as File;
      const audioId = formData.get(`audio_${i}_id`) as string;
      if (audioFile && audioId) {
        const audioKey = `${userId}/${ulidVideo}/audio/${audioId}.mp3`;
        const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
        await s3Client.send(
          new PutObjectCommand({
            Bucket: PROJECTS_BUCKET,
            Key: audioKey,
            Body: audioBuffer,
            ContentType: "audio/mpeg",
          })
        );
        audioS3Keys.push({ id: audioId, s3Key: audioKey });
      }
      i++;
    }

    // Subir música de fondo a S3 (si se envía una nueva)
    let musicS3Key: string | null = null;
    const musicFile = formData.get("music") as File | null;
    if (musicFile) {
      musicS3Key = `${userId}/${ulidVideo}/music/track.mp3`;
      const musicBuffer = Buffer.from(await musicFile.arrayBuffer());
      await s3Client.send(
        new PutObjectCommand({
          Bucket: PROJECTS_BUCKET,
          Key: musicS3Key,
          Body: musicBuffer,
          ContentType: "audio/mpeg",
        })
      );
    }

    // Parsear metadata de ediciones
    let editsData: Record<string, unknown> = {};
    if (edits) {
      try {
        editsData = JSON.parse(edits);
      } catch {
        // Si el JSON es inválido, guardar vacío
      }
    }

    // Agregar las keys de S3 de audio a los edits
    if (audioS3Keys.length > 0) {
      editsData.audioS3Keys = audioS3Keys;
    }
    if (musicS3Key) {
      editsData.musicS3Key = musicS3Key;
    }

    // Actualizar registro en DynamoDB
    const now = new Date().toISOString();
    await docClient.send(
      new UpdateCommand({
        TableName: PROJECTS_TABLE,
        Key: {
          userId,
          ulidVideo,
        },
        UpdateExpression: "SET edits = :edits, videoName = :videoName, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":edits": editsData,
          ":videoName": videoName || "video.mp4",
          ":updatedAt": now,
        },
      })
    );

    return NextResponse.json({
      ulidVideo,
      message: "Proyecto actualizado correctamente",
    });
  } catch (err) {
    console.error("Error updating project:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al actualizar el proyecto" },
      { status: 500 }
    );
  }
}
