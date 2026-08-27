import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID || "";

const CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET || "";

const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || "";

export async function GET(
  request: NextRequest
) {
  try {
    const code =
      request.nextUrl.searchParams.get(
        "code"
      );

    const state =
      request.nextUrl.searchParams.get(
        "state"
      );

    const savedState =
      request.cookies.get(
        "google_oauth_state"
      )?.value;

    if (!code) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Authorization code tidak ditemukan.",
        },
        { status: 400 }
      );
    }

    if (
      !state ||
      !savedState ||
      state !== savedState
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "OAuth state tidak valid.",
        },
        { status: 400 }
      );
    }

    const oauth2Client =
      new google.auth.OAuth2(
        CLIENT_ID,
        CLIENT_SECRET,
        REDIRECT_URI
      );

    const { tokens } =
      await oauth2Client.getToken(
        code
      );

    if (!tokens.refresh_token) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Refresh token tidak diterima Google. Silakan lakukan otorisasi ulang.",
        },
        { status: 400 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | UNTUK DEVELOPMENT
    |--------------------------------------------------------------------------
    |
    | Salin refresh_token dari terminal
    | kemudian masukkan ke .env.local
    |
    */

    console.log(
      "======================================"
    );

    console.log(
      "GOOGLE REFRESH TOKEN:"
    );

    console.log(
      tokens.refresh_token
    );

    console.log(
      "======================================"
    );

    const response =
      NextResponse.redirect(
        new URL(
          "/arsip?google=connected",
          request.url
        )
      );

    response.cookies.delete(
      "google_oauth_state"
    );

    return response;
  } catch (error) {
    console.error(
      "GOOGLE CALLBACK ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal menyelesaikan OAuth Google.",
      },
      { status: 500 }
    );
  }
}