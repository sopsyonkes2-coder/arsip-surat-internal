import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID || "";

const GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET || "";

const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  "http://localhost:3000/api/auth/google/callback";

export async function GET(
  request: NextRequest
) {
  try {
    // ==========================================
    // CEK KONFIGURASI
    // ==========================================

    if (
      !GOOGLE_CLIENT_ID ||
      !GOOGLE_CLIENT_SECRET
    ) {
      return new NextResponse(
        "Konfigurasi Google OAuth belum lengkap.",
        {
          status: 500,
        }
      );
    }

    // ==========================================
    // AMBIL AUTHORIZATION CODE
    // ==========================================

    const { searchParams } =
      new URL(request.url);

    const code =
      searchParams.get("code");

    const error =
      searchParams.get("error");

    if (error) {
      return new NextResponse(
        `Google OAuth dibatalkan: ${error}`,
        {
          status: 400,
        }
      );
    }

    if (!code) {
      return new NextResponse(
        "Authorization code tidak ditemukan.",
        {
          status: 400,
        }
      );
    }

    // ==========================================
    // BUAT OAUTH CLIENT
    // ==========================================

    const oauth2Client =
      new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI
      );

    // ==========================================
    // TUKAR CODE MENJADI TOKEN
    // ==========================================

    const { tokens } =
      await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      throw new Error(
        "Access token Google tidak diperoleh."
      );
    }

    if (!tokens.refresh_token) {
      throw new Error(
        "Refresh token Google tidak diperoleh. Silakan cabut akses aplikasi dari akun Google lalu hubungkan kembali."
      );
    }

    // ==========================================
    // SIMPAN TOKEN
    //
    // UNTUK SEMENTARA KITA SIMPAN DI COOKIE
    // ==========================================

    const response =
      NextResponse.redirect(
        new URL(
          "/dashboard",
          request.url
        )
      );

    response.cookies.set(
      "google_access_token",
      tokens.access_token,
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV ===
          "production",
        sameSite: "lax",
        path: "/",
        maxAge:
          tokens.expiry_date
            ? Math.max(
                60,
                Math.floor(
                  (tokens.expiry_date -
                    Date.now()) /
                    1000
                )
              )
            : 3600,
      }
    );

    response.cookies.set(
      "google_refresh_token",
      tokens.refresh_token,
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV ===
          "production",
        sameSite: "lax",
        path: "/",
        maxAge:
          60 * 60 * 24 * 30 * 12,
      }
    );

    // Simpan expiry jika tersedia
    if (tokens.expiry_date) {
      response.cookies.set(
        "google_token_expiry",
        String(tokens.expiry_date),
        {
          httpOnly: true,
          secure:
            process.env.NODE_ENV ===
            "production",
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 30,
        }
      );
    }

    console.log(
      "GOOGLE OAUTH BERHASIL."
    );

    return response;
  } catch (error) {
    console.error(
      "GOOGLE OAUTH CALLBACK ERROR:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "Gagal menghubungkan akun Google.";

    return new NextResponse(
      `
      <!DOCTYPE html>
      <html lang="id">
        <head>
          <meta charset="UTF-8" />
          <title>Google OAuth Error</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              background: #f8fafc;
              padding: 40px;
            }

            .box {
              max-width: 600px;
              margin: 50px auto;
              background: white;
              border: 1px solid #e2e8f0;
              border-radius: 16px;
              padding: 30px;
              box-shadow: 0 10px 30px rgba(0,0,0,.08);
            }

            h1 {
              color: #dc2626;
            }

            p {
              color: #475569;
              line-height: 1.6;
            }

            a {
              display: inline-block;
              margin-top: 20px;
              background: #2563eb;
              color: white;
              text-decoration: none;
              padding: 12px 18px;
              border-radius: 10px;
            }
          </style>
        </head>

        <body>
          <div class="box">
            <h1>Gagal Menghubungkan Google</h1>

            <p>
              ${escapeHtml(message)}
            </p>

            <a href="/arsip">
              Kembali ke Arsip
            </a>
          </div>
        </body>
      </html>
      `,
      {
        status: 500,
        headers: {
          "Content-Type":
            "text/html; charset=utf-8",
        },
      }
    );
  }
}

// ==========================================
// ESCAPE HTML
// ==========================================

function escapeHtml(
  value: string
) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(
      /'/g,
      "&#039;"
    );
}