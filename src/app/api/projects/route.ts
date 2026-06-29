import { NextRequest, NextResponse } from "next/server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const PROJECTS_TABLE = process.env.DYNAMODB_PROJECTS_TABLE || "db-user-projects";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "Se requiere el userId" },
        { status: 400 }
      );
    }

    // Query up to 10 projects for this user, sorted by ULID (newest first)
    const result = await docClient.send(
      new QueryCommand({
        TableName: PROJECTS_TABLE,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": userId,
        },
        ScanIndexForward: false, // newest first (ULID is time-sortable)
        Limit: 10,
      })
    );

    return NextResponse.json({
      projects: result.Items || [],
    });
  } catch (err) {
    console.error("Error fetching projects:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al obtener proyectos" },
      { status: 500 }
    );
  }
}
