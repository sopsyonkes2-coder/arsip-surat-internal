import { NextResponse } from "next/server";
import { getGoogleServices } from "@/lib/google";

export async function GET() {
  try {
    const { drive, sheets } = getGoogleServices();

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    if (!spreadsheetId) {
      throw new Error("GOOGLE_SPREADSHEET_ID belum diatur.");
    }

    const sheetResponse = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (!folderId) {
      throw new Error("GOOGLE_DRIVE_FOLDER_ID belum diatur.");
    }

    const driveResponse = await drive.files.get({
      fileId: folderId,
      fields: "id,name,mimeType",
    });

    return NextResponse.json({
      success: true,
      message: "Koneksi Google API berhasil.",
      googleSheets: {
        id: sheetResponse.data.spreadsheetId,
        name: sheetResponse.data.properties?.title,
      },
      googleDrive: {
        id: driveResponse.data.id,
        name: driveResponse.data.name,
        mimeType: driveResponse.data.mimeType,
      },
    });
  } catch (error) {
    console.error("Google API Test Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Koneksi Google API gagal.",
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      { status: 500 }
    );
  }
}