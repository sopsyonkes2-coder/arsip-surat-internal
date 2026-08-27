import { NextResponse } from "next/server";
import { getOAuthServices } from "@/lib/google-oauth";

export async function GET() {
  try {
    const { oauthDrive } = getOAuthServices();
    const response =
      await oauthDrive.files.list({
        q: "trashed = false",
        pageSize: 10,
        fields:
          "files(id,name,mimeType,parents)",
      });

    return NextResponse.json({
      success: true,
      message:
        "Google OAuth Drive berhasil.",
      files:
        response.data.files || [],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(
      "GOOGLE OAUTH DRIVE ERROR:",
      message
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Google OAuth Drive gagal.",
        error: message,
      },
      { status: 500 }
    );
  }
}