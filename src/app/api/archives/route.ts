import { NextRequest, NextResponse } from "next/server";

import {
  readSession,
  sessionCookieName,
} from "@/lib/auth";

import { getGoogleServices } from "@/lib/google";

const GOOGLE_SPREADSHEET_ID =
  process.env.GOOGLE_SPREADSHEET_ID || "";

const GOOGLE_SHEET_NAME =
  process.env.GOOGLE_SHEET_NAME || "ARSIP_SURAT";

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "";
const APPS_SCRIPT_SECRET = process.env.APPS_SCRIPT_SECRET || "";

type AppsScriptUploadResult = {
  success: boolean;
  message?: string;
  data?: {
    fileId: string;
    fileName: string;
    webViewLink: string;
    folderName: string;
  };
};

/* =========================================================
   Helper: Upload PDF ke Apps Script
========================================================= */
async function uploadToAppsScript(params: {
  fileName: string;
  mimeType: string;
  base64: string;
  year: string;
}): Promise<AppsScriptUploadResult> {
  if (!APPS_SCRIPT_URL || !APPS_SCRIPT_SECRET) {
    throw new Error(
      "APPS_SCRIPT_URL atau APPS_SCRIPT_SECRET belum dikonfigurasi."
    );
  }

  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      secret: APPS_SCRIPT_SECRET,
      action: "uploadFile",
      fileName: params.fileName,
      mimeType: params.mimeType,
      base64: params.base64,
      year: params.year,
    }),
  });

  const result = (await response.json()) as AppsScriptUploadResult;

  if (!response.ok || !result.success || !result.data?.webViewLink) {
    throw new Error(
      result.message ||
        "Gagal mengunggah file ke Google Drive via Apps Script."
    );
  }

  return result;
}

/* =========================================================
   Helper: Hapus file di Drive via Apps Script
========================================================= */
async function deleteFromAppsScript(fileId: string): Promise<void> {
  if (!APPS_SCRIPT_URL || !APPS_SCRIPT_SECRET || !fileId) return;

  try {
    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secret: APPS_SCRIPT_SECRET,
        action: "deleteFile",
        fileId,
      }),
    });
  } catch (err) {
    console.error("deleteFromAppsScript gagal:", err);
  }
}

/* =========================================================
   Helper: Ekstrak fileId dari webViewLink Google Drive
========================================================= */
function extractFileIdFromLink(link: string): string | null {
  if (!link) return null;

  // https://drive.google.com/file/d/FILE_ID/view...
  const match = link.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match?.[1]) return match[1];

  // https://drive.google.com/open?id=FILE_ID
  const match2 = link.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match2?.[1]) return match2[1];

  return null;
}

/* =========================================================
   GET - BACA DATA ARSIP DARI GOOGLE SHEET
========================================================= */
export async function GET(request: NextRequest) {
  try {
    const session = readSession(
      request.cookies.get(sessionCookieName)?.value
    );

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: "Sesi tidak valid.",
        },
        { status: 401 }
      );
    }

    if (!GOOGLE_SPREADSHEET_ID) {
      return NextResponse.json(
        {
          success: false,
          message: "GOOGLE_SPREADSHEET_ID belum dikonfigurasi.",
        },
        { status: 500 }
      );
    }

    const { sheets } = getGoogleServices();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SPREADSHEET_ID,
      range: `${GOOGLE_SHEET_NAME}!A:L`,
    });

    const rows = response.data.values || [];

    const archives = rows.slice(1).map((row) => ({
      nomor: row[0] || "",
      tanggalInput: row[1] || "",
      nomorAgenda: row[2] || "",
      nomorSurat: row[3] || "",
      tanggalSurat: row[4] || "",
      tanggalDiterima: row[5] || "",
      pengirim: row[6] || "",
      perihal: row[7] || "",
      klasifikasi: row[8] || "",
      linkFile: row[9] || "",
      jenisSurat: row[10] || "Masuk",
      keterangan: row[11] || "",
    }));

    return NextResponse.json({
      success: true,
      data: archives,
    });
  } catch (error) {
    console.error("GET /api/archives ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal mengambil data arsip.",
      },
      { status: 500 }
    );
  }
}

/* =========================================================
   POST - TAMBAH ARSIP + UPLOAD PDF VIA APPS SCRIPT
========================================================= */
export async function POST(request: NextRequest) {
  let uploadedFileId: string | null = null;

  try {
    const session = readSession(
      request.cookies.get(sessionCookieName)?.value
    );

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: "Sesi tidak valid.",
        },
        { status: 401 }
      );
    }

    if (session.role === "Tamu") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Akses ditolak. Hanya Admin/Operator yang dapat menambah arsip.",
        },
        { status: 403 }
      );
    }

    if (!GOOGLE_SPREADSHEET_ID) {
      return NextResponse.json(
        {
          success: false,
          message: "GOOGLE_SPREADSHEET_ID belum dikonfigurasi.",
        },
        { status: 500 }
      );
    }

    const formData = await request.formData();

    const nomorAgenda = String(formData.get("nomorAgenda") || "").trim();
    const nomorSurat = String(formData.get("nomorSurat") || "").trim();
    const tanggalSurat = String(formData.get("tanggalSurat") || "").trim();
    const tanggalDiterima = String(
      formData.get("tanggalDiterima") || ""
    ).trim();
    const pengirim = String(formData.get("pengirim") || "").trim();
    const perihal = String(formData.get("perihal") || "").trim();
    const klasifikasi = String(formData.get("klasifikasi") || "").trim();
    const jenisSurat = String(formData.get("jenisSurat") || "Masuk").trim();
    const keterangan = String(formData.get("keterangan") || "").trim();
    const file = formData.get("file");

    if (
      !nomorAgenda ||
      !nomorSurat ||
      !tanggalSurat ||
      !tanggalDiterima ||
      !pengirim ||
      !perihal ||
      !klasifikasi
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Data surat belum lengkap.",
        },
        { status: 400 }
      );
    }

    let linkFile = "";
    let namaFile = "";
    let pdfDipilih = false;

    if (file instanceof File && file.size > 0) {
      if (file.type !== "application/pdf") {
        return NextResponse.json(
          {
            success: false,
            message: "File harus berupa PDF.",
          },
          { status: 400 }
        );
      }

      pdfDipilih = true;
      namaFile = file.name;

      const yearMatch = tanggalSurat.match(/(\d{4})/);
      const year = yearMatch
        ? yearMatch[1]
        : String(new Date().getFullYear());

      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");

      const uploadResult = await uploadToAppsScript({
        fileName: namaFile,
        mimeType: "application/pdf",
        base64,
        year,
      });

      uploadedFileId = uploadResult.data!.fileId;
      linkFile = uploadResult.data!.webViewLink;
    }

    const { sheets } = getGoogleServices();

    const existingResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SPREADSHEET_ID,
      range: `${GOOGLE_SHEET_NAME}!A:A`,
    });

    const existingRows = existingResponse.data.values || [];

    let nextNumber = 1;

    if (existingRows.length > 1) {
      const numbers = existingRows
        .slice(1)
        .map((row) => Number(row[0]))
        .filter((number) => Number.isFinite(number));

      if (numbers.length > 0) {
        nextNumber = Math.max(...numbers) + 1;
      }
    }

    const nomor = String(nextNumber);
    const tanggalInput = new Date().toISOString();

    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SPREADSHEET_ID,
      range: `${GOOGLE_SHEET_NAME}!A:L`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            nomor,
            tanggalInput,
            nomorAgenda,
            nomorSurat,
            tanggalSurat,
            tanggalDiterima,
            pengirim,
            perihal,
            klasifikasi,
            linkFile,
            jenisSurat,
            keterangan,
          ],
        ],
      },
    });

    return NextResponse.json({
      success: true,
      message: "Data arsip berhasil disimpan.",
      data: {
        nomor,
        tanggalInput,
        nomorAgenda,
        nomorSurat,
        tanggalSurat,
        tanggalDiterima,
        pengirim,
        perihal,
        klasifikasi,
        linkFile,
        jenisSurat,
        keterangan,
        pdfDipilih,
        namaFile,
      },
    });
  } catch (error) {
    if (uploadedFileId) {
      await deleteFromAppsScript(uploadedFileId);
    }

    console.error("POST /api/archives ERROR:", error);

    const message =
      error instanceof Error ? error.message : "Gagal menyimpan arsip.";

    return NextResponse.json(
      {
        success: false,
        message,
      },
      { status: 500 }
    );
  }
}

/* =========================================================
   PUT - UPDATE ARSIP (+ ganti PDF opsional)
========================================================= */
export async function PUT(request: NextRequest) {
  let uploadedFileId: string | null = null;

  try {
    const session = readSession(
      request.cookies.get(sessionCookieName)?.value
    );

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Sesi tidak valid." },
        { status: 401 }
      );
    }

    if (session.role === "Tamu") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Akses ditolak. Hanya Admin/Operator yang dapat mengubah arsip.",
        },
        { status: 403 }
      );
    }

    if (!GOOGLE_SPREADSHEET_ID) {
      return NextResponse.json(
        {
          success: false,
          message: "GOOGLE_SPREADSHEET_ID belum dikonfigurasi.",
        },
        { status: 500 }
      );
    }

    const formData = await request.formData();

    const nomor = String(formData.get("nomor") || "").trim();
    const nomorAgenda = String(formData.get("nomorAgenda") || "").trim();
    const nomorSurat = String(formData.get("nomorSurat") || "").trim();
    const tanggalSurat = String(formData.get("tanggalSurat") || "").trim();
    const tanggalDiterima = String(
      formData.get("tanggalDiterima") || ""
    ).trim();
    const pengirim = String(formData.get("pengirim") || "").trim();
    const perihal = String(formData.get("perihal") || "").trim();
    const klasifikasi = String(formData.get("klasifikasi") || "").trim();
    const jenisSurat = String(formData.get("jenisSurat") || "Masuk").trim();
    const keterangan = String(formData.get("keterangan") || "").trim();
    const file = formData.get("file");

    if (
      !nomor ||
      !nomorAgenda ||
      !nomorSurat ||
      !tanggalSurat ||
      !tanggalDiterima ||
      !pengirim ||
      !perihal ||
      !klasifikasi
    ) {
      return NextResponse.json(
        { success: false, message: "Data surat belum lengkap." },
        { status: 400 }
      );
    }

    const { sheets } = getGoogleServices();

    const existingResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SPREADSHEET_ID,
      range: `${GOOGLE_SHEET_NAME}!A:L`,
    });

    const rows = existingResponse.data.values || [];

    const dataIndex = rows.findIndex(
      (row, idx) => idx > 0 && String(row[0] || "") === nomor
    );

    if (dataIndex < 0) {
      return NextResponse.json(
        { success: false, message: "Arsip tidak ditemukan." },
        { status: 404 }
      );
    }

    const oldLinkFile = String(rows[dataIndex][9] || "");
    const oldFileId = extractFileIdFromLink(oldLinkFile);
    const sheetRowNumber = dataIndex + 1;

    let linkFile = oldLinkFile;
    let namaFile = "";
    let pdfDipilih = false;

    if (file instanceof File && file.size > 0) {
      if (file.type !== "application/pdf") {
        return NextResponse.json(
          { success: false, message: "File harus berupa PDF." },
          { status: 400 }
        );
      }

      pdfDipilih = true;
      namaFile = file.name;

      const yearMatch = tanggalSurat.match(/(\d{4})/);
      const year = yearMatch
        ? yearMatch[1]
        : String(new Date().getFullYear());

      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");

      const uploadResult = await uploadToAppsScript({
        fileName: namaFile,
        mimeType: "application/pdf",
        base64,
        year,
      });

      uploadedFileId = uploadResult.data!.fileId;
      linkFile = uploadResult.data!.webViewLink;
    }

    const tanggalInput = String(
      rows[dataIndex][1] || new Date().toISOString()
    );

    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SPREADSHEET_ID,
      range: `${GOOGLE_SHEET_NAME}!A${sheetRowNumber}:L${sheetRowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            nomor,
            tanggalInput,
            nomorAgenda,
            nomorSurat,
            tanggalSurat,
            tanggalDiterima,
            pengirim,
            perihal,
            klasifikasi,
            linkFile,
            jenisSurat,
            keterangan,
          ],
        ],
      },
    });

    // Hapus file lama setelah Sheet berhasil di-update
    if (uploadedFileId && oldFileId && oldFileId !== uploadedFileId) {
      await deleteFromAppsScript(oldFileId);
    }

    return NextResponse.json({
      success: true,
      message: "Arsip berhasil diperbarui.",
      data: {
        nomor,
        tanggalInput,
        nomorAgenda,
        nomorSurat,
        tanggalSurat,
        tanggalDiterima,
        pengirim,
        perihal,
        klasifikasi,
        linkFile,
        jenisSurat,
        keterangan,
        pdfDipilih,
        namaFile,
      },
    });
  } catch (error) {
    if (uploadedFileId) {
      await deleteFromAppsScript(uploadedFileId);
    }

    console.error("PUT /api/archives ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal memperbarui arsip.",
      },
      { status: 500 }
    );
  }
}

/* =========================================================
   DELETE - HAPUS ARSIP + FILE DI DRIVE
========================================================= */
export async function DELETE(request: NextRequest) {
  try {
    const session = readSession(
      request.cookies.get(sessionCookieName)?.value
    );

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Sesi tidak valid." },
        { status: 401 }
      );
    }

    if (session.role !== "Admin") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Akses ditolak. Hanya Admin yang dapat menghapus arsip.",
        },
        { status: 403 }
      );
    }

    if (!GOOGLE_SPREADSHEET_ID) {
      return NextResponse.json(
        {
          success: false,
          message: "GOOGLE_SPREADSHEET_ID belum dikonfigurasi.",
        },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = (searchParams.get("id") || "").trim();

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          message: "Parameter id (nomor) wajib diisi.",
        },
        { status: 400 }
      );
    }

    const { sheets } = getGoogleServices();

    const existingResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SPREADSHEET_ID,
      range: `${GOOGLE_SHEET_NAME}!A:L`,
    });

    const rows = existingResponse.data.values || [];

    const dataIndex = rows.findIndex(
      (row, idx) => idx > 0 && String(row[0] || "") === id
    );

    if (dataIndex < 0) {
      return NextResponse.json(
        { success: false, message: "Arsip tidak ditemukan." },
        { status: 404 }
      );
    }

    const linkFile = String(rows[dataIndex][9] || "");
    const fileId = extractFileIdFromLink(linkFile);

    if (fileId) {
      await deleteFromAppsScript(fileId);
    }

    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: GOOGLE_SPREADSHEET_ID,
      fields: "sheets(properties(sheetId,title))",
    });

    const targetSheet = spreadsheet.data.sheets?.find(
      (s) => s.properties?.title === GOOGLE_SHEET_NAME
    );

    const sheetId = targetSheet?.properties?.sheetId;

    if (sheetId === undefined || sheetId === null) {
      throw new Error(`Sheet "${GOOGLE_SHEET_NAME}" tidak ditemukan.`);
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: GOOGLE_SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: dataIndex,
                endIndex: dataIndex + 1,
              },
            },
          },
        ],
      },
    });

    return NextResponse.json({
      success: true,
      message: "Arsip berhasil dihapus.",
      data: { nomor: id },
    });
  } catch (error) {
    console.error("DELETE /api/archives ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal menghapus arsip.",
      },
      { status: 500 }
    );
  }
}