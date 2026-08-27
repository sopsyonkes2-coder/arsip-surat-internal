import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import type { Credentials, OAuth2Client } from "google-auth-library";
import { Readable } from "stream";
import { readSession, sessionCookieName } from "@/lib/auth";
import { getGoogleServices } from "@/lib/google";
import { getOAuthServices } from "@/lib/google-oauth";

/*
|--------------------------------------------------------------------------
| GOOGLE CONFIG
|--------------------------------------------------------------------------
*/

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID || "";

const GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET || "";

const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  "http://localhost:3000/api/auth/google/callback";

const GOOGLE_SPREADSHEET_ID =
  process.env.GOOGLE_SPREADSHEET_ID || "";

const GOOGLE_DRIVE_FOLDER_ID =
  process.env.GOOGLE_DRIVE_FOLDER_ID || "";

const SHEET_NAME =
  process.env.GOOGLE_SHEET_NAME ||
  "ARSIP_SURAT";

/*
|--------------------------------------------------------------------------
| CREATE OAUTH CLIENT
|--------------------------------------------------------------------------
*/

function createOAuthClient() {
  if (
    !GOOGLE_CLIENT_ID ||
    !GOOGLE_CLIENT_SECRET
  ) {
    throw new Error(
      "Konfigurasi Google OAuth belum lengkap. Periksa GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET."
    );
  }

  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

/*
|--------------------------------------------------------------------------
| GET GOOGLE AUTH FROM COOKIE
|--------------------------------------------------------------------------
|
| Membaca access token / refresh token dari cookie.
|
*/

async function getAuthenticatedClient(
  request: NextRequest
) {
  const accessToken =
    request.cookies.get(
      "google_access_token"
    )?.value;

  const refreshToken =
    request.cookies.get(
      "google_refresh_token"
    )?.value;

  const tokenExpiry =
    request.cookies.get(
      "google_token_expiry"
    )?.value;

  if (
    !accessToken &&
    !refreshToken
  ) {
    try {
      const oauthServices = getOAuthServices();
      return {
        auth: oauthServices.auth,
        credentials: oauthServices.auth.credentials,
        refreshed: false,
      };
    } catch {
      const serviceAccount = getGoogleServices();
      return { auth: serviceAccount.auth, credentials: {}, refreshed: false };
    }
  }

  const oauth2Client =
    createOAuthClient();

  /*
   * Set access token jika tersedia.
   */

  if (accessToken) {
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token:
        refreshToken || undefined,
      expiry_date: tokenExpiry
        ? Number(tokenExpiry)
        : undefined,
    });
  } else if (refreshToken) {
    /*
     * Jika access token sudah tidak ada,
     * gunakan refresh token.
     */

    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });
  }

  /*
   * Jika access token hampir habis / sudah expired,
   * refresh menggunakan refresh token.
   */

  const expiry =
    tokenExpiry
      ? Number(tokenExpiry)
      : undefined;

  const shouldRefresh =
    Boolean(refreshToken) &&
    (!expiry ||
      expiry <= Date.now() + 60_000);

  if (shouldRefresh) {
    const { credentials } =
      await oauth2Client.refreshAccessToken();

    oauth2Client.setCredentials(
      credentials
    );

    return {
      auth: oauth2Client,
      credentials,
      refreshed: true,
    };
  }

  return {
    auth: oauth2Client,
    credentials: {
      access_token:
        accessToken || undefined,
      refresh_token:
        refreshToken || undefined,
      expiry_date: expiry,
    },
    refreshed: false,
  };
}

/*
|--------------------------------------------------------------------------
| APPLY REFRESHED TOKEN TO RESPONSE
|--------------------------------------------------------------------------
*/

function applyAuthCookies(
  response: NextResponse,
  credentials: Credentials
) {
  if (
    credentials?.access_token
  ) {
    response.cookies.set(
      "google_access_token",
      credentials.access_token,
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV ===
          "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60,
      }
    );
  }

  if (
    credentials?.refresh_token
  ) {
    response.cookies.set(
      "google_refresh_token",
      credentials.refresh_token,
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV ===
          "production",
        sameSite: "lax",
        path: "/",
        maxAge:
          60 * 60 * 24 * 30 * 6,
      }
    );
  }

  if (
    credentials?.expiry_date
  ) {
    response.cookies.set(
      "google_token_expiry",
      String(
        credentials.expiry_date
      ),
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV ===
          "production",
        sameSite: "lax",
        path: "/",
        maxAge:
          60 * 60 * 24 * 30 * 6,
      }
    );
  }
}

/*
|--------------------------------------------------------------------------
| GOOGLE SERVICES
|--------------------------------------------------------------------------
*/

function createGoogleServices(
  auth: OAuth2Client | ReturnType<typeof getGoogleServices>["auth"]
) {
  const drive = google.drive({
    version: "v3",
    auth,
  });

  const sheets = google.sheets({
    version: "v4",
    auth,
  });

  return {
    drive,
    sheets,
  };
}

/*
|--------------------------------------------------------------------------
| GET
|--------------------------------------------------------------------------
|
| Mengambil seluruh arsip dari Google Sheets.
|
*/

export async function GET(
  request: NextRequest
) {
  try {
    /*
     * Cek spreadsheet.
     */

    if (!GOOGLE_SPREADSHEET_ID) {
      throw new Error(
        "GOOGLE_SPREADSHEET_ID belum dikonfigurasi."
      );
    }

    /*
     * OAuth authentication.
     */

    const {
      auth,
      credentials,
      refreshed,
    } =
      await getAuthenticatedClient(
        request
      );

    const { sheets } =
      createGoogleServices(auth);

    /*
     * Ambil data Google Sheets.
     */

    const response =
      await sheets.spreadsheets.values.get(
        {
          spreadsheetId:
            GOOGLE_SPREADSHEET_ID,

          range:
            `${SHEET_NAME}!A:L`,
        }
      );

    const rows =
      response.data.values || [];

    /*
     * Jika hanya header / kosong.
     */

    if (rows.length <= 1) {
      const result =
        NextResponse.json({
          success: true,
          data: [],
        });

      if (refreshed) {
        applyAuthCookies(
          result,
          credentials
        );
      }

      return result;
    }

    /*
     * Mapping data.
     */

    const data = rows
      .slice(1)
      .map((row) => ({
        nomor: row[0] || "",
        tanggalInput: row[1] || "",
        nomorAgenda: row[2] || "",
        nomorSurat: row[3] || "",
        tanggalSurat: row[4] || "",
        tanggalDiterima:
          row[5] || "",
        pengirim: row[6] || "",
        perihal: row[7] || "",
        klasifikasi: row[8] || "",
        linkFile: row[9] || "",
        jenisSurat: row[10] || "Masuk",
        keterangan: row[11] || "",
      }))
      .filter(
        (item) =>
          item.nomor ||
          item.nomorSurat ||
          item.nomorAgenda
      );

    const result =
      NextResponse.json({
        success: true,
        data,
      });

    /*
     * Jika token diperbarui,
     * simpan token baru.
     */

    if (refreshed) {
      applyAuthCookies(
        result,
        credentials
      );
    }

    return result;
  } catch (error) {
    console.error(
      "GET /api/archives ERROR:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "Gagal mengambil data arsip.";

    /*
     * Jika OAuth belum login.
     */

    if (
      message.includes(
        "belum terhubung"
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message,
          needGoogleAuth: true,
        },
        {
          status: 401,
        }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message,
      },
      {
        status: 500,
      }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST
|--------------------------------------------------------------------------
|
| Menerima FormData:
|
| nomorAgenda
| nomorSurat
| tanggalSurat
| tanggalDiterima
| pengirim
| perihal
| klasifikasi
| file
|
|--------------------------------------------------------------------------
*/

export async function POST(
  request: NextRequest
) {
  try {
    const session = readSession(request.cookies.get(sessionCookieName)?.value);
    const hasGoogleSession = Boolean(request.cookies.get("google_access_token")?.value || request.cookies.get("google_refresh_token")?.value);
    if (!session && !hasGoogleSession) return NextResponse.json({ success: false, message: "Sesi tidak valid." }, { status: 401 });
    if (session?.role === "Tamu") return NextResponse.json({ success: false, message: "Akses ditolak. Hanya Admin yang dapat menambah arsip." }, { status: 403 });
    /*
     * --------------------------------------------------
     * CEK CONFIG
     * --------------------------------------------------
     */

    if (!GOOGLE_SPREADSHEET_ID) {
      throw new Error(
        "GOOGLE_SPREADSHEET_ID belum dikonfigurasi."
      );
    }

    if (!GOOGLE_DRIVE_FOLDER_ID) {
      throw new Error(
        "GOOGLE_DRIVE_FOLDER_ID belum dikonfigurasi."
      );
    }

    /*
     * --------------------------------------------------
     * AMBIL FORM DATA
     * --------------------------------------------------
     */

    const formData =
      await request.formData();

    const nomorAgenda =
      String(
        formData.get(
          "nomorAgenda"
        ) || ""
      ).trim();

    const nomorSurat =
      String(
        formData.get(
          "nomorSurat"
        ) || ""
      ).trim();

    const tanggalSurat =
      String(
        formData.get(
          "tanggalSurat"
        ) || ""
      ).trim();

    const tanggalDiterima =
      String(
        formData.get(
          "tanggalDiterima"
        ) || ""
      ).trim();

    const pengirim =
      String(
        formData.get(
          "pengirim"
        ) || ""
      ).trim();

    const perihal =
      String(
        formData.get(
          "perihal"
        ) || ""
      ).trim();

    const klasifikasi =
      String(
        formData.get(
          "klasifikasi"
        ) || ""
      ).trim();

    const jenisSurat = String(formData.get("jenisSurat") || "Masuk").trim();
    const keterangan = String(formData.get("keterangan") || "").trim();

    const file =
      formData.get("file");

    /*
     * --------------------------------------------------
     * VALIDASI DATA
     * --------------------------------------------------
     */

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
          message:
            "Data surat belum lengkap.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * --------------------------------------------------
     * VALIDASI FILE
     * --------------------------------------------------
     */

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          message:
            "File PDF belum dipilih.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      file.type !==
      "application/pdf"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "File harus berupa PDF.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Maksimal 20 MB.
     */

    const maxFileSize =
      20 * 1024 * 1024;

    if (
      file.size >
      maxFileSize
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Ukuran file maksimal 20 MB.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * --------------------------------------------------
     * GOOGLE OAUTH
     * --------------------------------------------------
     */

    const {
      auth,
      credentials,
      refreshed,
    } =
      await getAuthenticatedClient(
        request
      );

    const {
      drive,
      sheets,
    } =
      createGoogleServices(auth);

    /*
     * --------------------------------------------------
     * NOMOR ARSIP OTOMATIS
     * --------------------------------------------------
     */

    const existingResponse =
      await sheets.spreadsheets.values.get(
        {
          spreadsheetId:
            GOOGLE_SPREADSHEET_ID,

          range:
            `${SHEET_NAME}!A:A`,
        }
      );

    const existingRows =
      existingResponse.data
        .values || [];

    let nextNumber = 1;

    if (
      existingRows.length > 1
    ) {
      const numbers =
        existingRows
          .slice(1)
          .map((row) =>
            Number(row[0])
          )
          .filter((number) =>
            Number.isFinite(number)
          );

      if (
        numbers.length > 0
      ) {
        nextNumber =
          Math.max(
            ...numbers
          ) + 1;
      }
    }

    const nomor =
      String(nextNumber);

    /*
     * --------------------------------------------------
     * NAMA FILE
     * --------------------------------------------------
     */

    const safeFileName =
      file.name.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );

    const fileName =
      `${nomor}_${safeFileName}`;

    /*
     * --------------------------------------------------
     * FILE → BUFFER
     * --------------------------------------------------
     */

    const arrayBuffer =
      await file.arrayBuffer();

    const buffer =
      Buffer.from(
        arrayBuffer
      );

    const stream =
      Readable.from(buffer);

    /*
     * --------------------------------------------------
     * UPLOAD KE GOOGLE DRIVE
     * --------------------------------------------------
     *
     * Upload menggunakan akun Google
     * yang memberikan izin OAuth.
     *
     * BUKAN Service Account.
     * --------------------------------------------------
     */

    const uploadedFile =
      await drive.files.create({
        requestBody: {
          name: fileName,

          parents: [
            GOOGLE_DRIVE_FOLDER_ID,
          ],

          mimeType:
            "application/pdf",
        },

        media: {
          mimeType:
            "application/pdf",

          body: stream,
        },

        fields:
          "id,name,webViewLink,webContentLink",
      });

    const fileId =
      uploadedFile.data.id;

    if (!fileId) {
      throw new Error(
        "File berhasil di-upload tetapi ID file tidak ditemukan."
      );
    }

    /*
     * --------------------------------------------------
     * BUAT LINK FILE
     * --------------------------------------------------
     */

    const linkFile =
      uploadedFile.data
        .webViewLink ||
      `https://drive.google.com/file/d/${fileId}/view`;

    /*
     * --------------------------------------------------
     * TANGGAL INPUT
     * --------------------------------------------------
     */

    const tanggalInput =
      new Date().toISOString();

    /*
     * --------------------------------------------------
     * SIMPAN KE GOOGLE SHEETS
     * --------------------------------------------------
     *
     * A = NOMOR
     * B = TANGGAL_INPUT
     * C = NOMOR_AGENDA
     * D = NOMOR_SURAT
     * E = TANGGAL_SURAT
     * F = TANGGAL_DITERIMA
     * G = PENGIRIM
     * H = PERIHAL
     * I = KLASIFIKASI
     * J = LINK_FILE
     *
     * --------------------------------------------------
     */

    await sheets.spreadsheets.values.append(
      {
        spreadsheetId:
          GOOGLE_SPREADSHEET_ID,

        range:
          `${SHEET_NAME}!A:L`,

        valueInputOption:
          "USER_ENTERED",

        insertDataOption:
          "INSERT_ROWS",

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
      }
    );

    /*
     * --------------------------------------------------
     * RESPONSE
     * --------------------------------------------------
     */

    const result =
      NextResponse.json({
        success: true,

        message:
          "Arsip berhasil disimpan.",

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
        },
      });

    /*
     * Jika token diperbarui,
     * simpan token baru ke cookie.
     */

    if (refreshed) {
      applyAuthCookies(
        result,
        credentials
      );
    }

    return result;
  } catch (error) {
    console.error(
      "POST /api/archives ERROR:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "Gagal menyimpan arsip.";

    /*
     * OAuth belum login.
     */

    if (
      message.includes(
        "belum terhubung"
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message,
          needGoogleAuth: true,
        },
        {
          status: 401,
        }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message,
      },
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = readSession(request.cookies.get(sessionCookieName)?.value);
    const hasGoogleSession = Boolean(request.cookies.get("google_access_token")?.value || request.cookies.get("google_refresh_token")?.value);
    if (!session && !hasGoogleSession) return NextResponse.json({ success: false, message: "Sesi tidak valid." }, { status: 401 });
    if (session?.role === "Tamu") return NextResponse.json({ success: false, message: "Akses ditolak. Hanya Admin yang dapat menghapus arsip." }, { status: 403 });
    if (!GOOGLE_SPREADSHEET_ID) throw new Error("GOOGLE_SPREADSHEET_ID belum dikonfigurasi.");
    const archiveId = request.nextUrl.searchParams.get("id")?.trim();
    if (!archiveId) return NextResponse.json({ success: false, message: "ID arsip wajib diisi." }, { status: 400 });

    const { auth, credentials, refreshed } = await getAuthenticatedClient(request);
    const { drive, sheets } = createGoogleServices(auth);
    const values = (await sheets.spreadsheets.values.get({ spreadsheetId: GOOGLE_SPREADSHEET_ID, range: `${SHEET_NAME}!A:L` })).data.values || [];
    const rowIndex = values.findIndex((row, index) => index > 0 && String(row[0] || "") === archiveId);
    if (rowIndex < 1) return NextResponse.json({ success: false, message: "Arsip tidak ditemukan." }, { status: 404 });

    const fileUrl = String(values[rowIndex][9] || "");
    const fileId = fileUrl.match(/\/d\/([^/]+)/)?.[1] || fileUrl.match(/[?&]id=([^&]+)/)?.[1];
    if (fileId) {
      try {
        await drive.files.delete({ fileId });
      } catch (error) {
        console.error("DELETE DRIVE FILE ERROR:", error);
      }
    }

    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SPREADSHEET_ID, fields: "sheets(properties(sheetId,title))" });
    const sheet = spreadsheet.data.sheets?.find((item) => item.properties?.title === SHEET_NAME);
    const sheetId = sheet?.properties?.sheetId;
    if (sheetId === undefined) throw new Error(`Sheet ${SHEET_NAME} tidak ditemukan.`);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: GOOGLE_SPREADSHEET_ID,
      requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowIndex, endIndex: rowIndex + 1 } } }] },
    });

    const response = NextResponse.json({ success: true, message: "Arsip berhasil dihapus." });
    if (refreshed) applyAuthCookies(response, credentials);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal menghapus arsip.";
    console.error("DELETE /api/archives ERROR:", error);
    return NextResponse.json({ success: false, message }, { status: message.includes("belum terhubung") ? 401 : 500 });
  }
}