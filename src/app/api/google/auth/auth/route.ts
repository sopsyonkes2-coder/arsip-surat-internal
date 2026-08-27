import { NextResponse } from "next/server";
import { google } from "googleapis";
import crypto from "crypto";

const CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID || "";

const CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET || "";

const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || "";

export async function GET() {
  try {
    if (
      !CLIENT_ID ||
      !CLIENT_SECRET ||
      !REDIRECT_URI
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Konfigurasi OAuth Google belum lengkap.",
        },
        { status: 500 }
      );
    }

    const oauth2Client =
      new google.auth.OAuth2(
        CLIENT_ID,
        CLIENT_SECRET,
        REDIRECT_URI
      );

    const state =
      crypto.randomBytes(32).toString("hex");

    const authUrl =
      oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: [
          "https://www.googleapis.com/auth/drive",
          "https://www.googleapis.com/auth/spreadsheets",
        ],
        state,
      });

    const response =
      NextResponse.redirect(authUrl);

    response.cookies.set(
      "google_oauth_state",
      state,
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV ===
          "production",
        sameSite: "lax",
        maxAge: 600,
        path: "/",
      }
    );

    return response;
  } catch (error) {
    console.error(
      "GOOGLE AUTH ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal memulai OAuth Google.",
      },
      { status: 500 }
    );
  }
}