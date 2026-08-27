import { NextResponse } from "next/server";

const authCookies = [
  "google_access_token",
  "google_refresh_token",
  "google_token_expiry",
  "arsip_session",
];

export async function POST(request: Request) {
  const response = NextResponse.json({ success: true, message: "Berhasil keluar." });

  for (const cookieName of authCookies) {
    response.cookies.set(cookieName, "", {
      expires: new Date(0),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
  }

  response.headers.set("Location", new URL("/login", request.url).toString());
  return response;
}