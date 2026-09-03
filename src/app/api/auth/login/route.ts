import { NextResponse } from "next/server";

import {
  createSession,
  sessionCookie,
  type Role,
  verifyPassword,
} from "@/lib/auth";

import { getGoogleServices } from "@/lib/google"; // sesuaikan path kalau beda

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      username?: string;
      password?: string;
    } | null;

    const username = body?.username?.trim().toLowerCase();
    const password = body?.password;

    // Username wajib diisi.
    // Password hanya wajib untuk Admin dan Operator.
    if (!username) {
      return NextResponse.json(
        {
          success: false,
          message: "Username wajib diisi.",
        },
        { status: 400 }
      );
    }

    const { sheets } = getGoogleServices();

    const spreadsheetId =
      process.env.GOOGLE_SPREADSHEET_ID || "";

    const sheetName =
      process.env.GOOGLE_USERS_SHEET_NAME || "PENGGUNA";

    if (!spreadsheetId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "GOOGLE_SPREADSHEET_ID belum dikonfigurasi.",
        },
        { status: 500 }
      );
    }

    const sheetResponse =
      await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:I`,
      });

    const rows = sheetResponse.data.values || [];

    if (rows.length <= 1) {
      return NextResponse.json(
        {
          success: false,
          message: "Data pengguna belum tersedia.",
        },
        { status: 401 }
      );
    }

    // ============================================================
    // CARI USER
    // D = USERNAME
    // ============================================================

    const user = rows.slice(1).find(
      (row) =>
        String(row[3] || "")
          .trim()
          .toLowerCase() === username
    );

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "Username atau password salah.",
        },
        { status: 401 }
      );
    }

    // ============================================================
    // STRUKTUR GOOGLE SHEET
    //
    // A = ID
    // B = NAMA
    // C = NRP
    // D = USERNAME
    // E = PASSWORD_HASH
    // F = ROLE
    // G = STATUS
    // H = CREATED_AT
    // I = UPDATED_AT
    // ============================================================

    const id = String(user[0] || "").trim();
    const name = String(user[1] || "").trim();
    const nrp = String(user[2] || "").trim();
    const sheetUsername = String(user[3] || "").trim();
    const passwordHash = String(user[4] || "").trim();
    const rawRole = String(user[5] || "").trim();
    const status = String(user[6] || "").trim();

    // ============================================================
    // NORMALISASI ROLE
    // ============================================================

    const roleMap: Record<string, Role> = {
      admin: "Admin",
      operator: "Operator",
      tamu: "Tamu",
    };

    const role = roleMap[rawRole.toLowerCase()];

    if (!role) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Role pengguna tidak valid. Gunakan Admin, Operator, atau Tamu.",
        },
        { status: 403 }
      );
    }

    // ============================================================
    // CEK DATA DASAR
    // ============================================================

    if (!name || !sheetUsername) {
      return NextResponse.json(
        {
          success: false,
          message: "Data pengguna tidak lengkap.",
        },
        { status: 400 }
      );
    }

    // ============================================================
    // CEK STATUS
    // ============================================================

    if (status.toLowerCase() !== "aktif") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Akun Anda tidak aktif. Silakan hubungi administrator.",
        },
        { status: 403 }
      );
    }

    // ============================================================
    // LOGIN TAMU
    // TANPA PASSWORD
    // ============================================================

    if (role === "Tamu") {
      const session = createSession(
        sheetUsername,
        name,
        nrp,
        role
      );

      const response = NextResponse.json({
        success: true,
        data: {
          id,
          name,
          nrp,
          username: sheetUsername,
          role,
          status,
        },
      });

      response.cookies.set(sessionCookie(session));

      return response;
    }

    // ============================================================
    // ADMIN & OPERATOR WAJIB PASSWORD
    // ============================================================

    if (!password) {
      return NextResponse.json(
        {
          success: false,
          message: "Username dan password wajib diisi.",
        },
        { status: 400 }
      );
    }

    // ============================================================
    // VERIFIKASI PASSWORD
    // ============================================================

    if (!verifyPassword(password, passwordHash)) {
      return NextResponse.json(
        {
          success: false,
          message: "Username atau password salah.",
        },
        { status: 401 }
      );
    }

    // ============================================================
    // BUAT SESSION
    // ============================================================

    const session = createSession(
      sheetUsername,
      name,
      nrp,
      role
    );

    // ============================================================
    // RESPONSE
    // ============================================================

    const response = NextResponse.json({
      success: true,
      data: {
        id,
        name,
        nrp,
        username: sheetUsername,
        role,
        status,
      },
    });

    response.cookies.set(sessionCookie(session));

    return response;
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat menghubungkan ke Google Sheet.",
      },
      { status: 500 }
    );
  }
}