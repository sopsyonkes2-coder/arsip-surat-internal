import { NextResponse } from "next/server";
import { createSession, sessionCookie, type Role } from "@/lib/auth";
import { getOAuthServices } from "@/lib/google-oauth";
import { verifyPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { username?: string; password?: string } | null;
  const username = body?.username?.trim().toLowerCase();
  const password = body?.password;
  const adminUsername = (process.env.ADMIN_USERNAME || "admin").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "admin";
  const guestUsername = (process.env.GUEST_USERNAME || "tamu").toLowerCase();
  let role: Role | null = username === adminUsername && password === adminPassword ? "Admin" : username === guestUsername ? "Tamu" : null;

  if (username && password) {
    try {
      const { oauthSheets } = getOAuthServices();
      const response = await oauthSheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || "", range: `${process.env.GOOGLE_USERS_SHEET_NAME || "PENGGUNA"}!A:I` });
      const user = (response.data.values || []).slice(1).find((row) => String(row[3] || "").toLowerCase() === username);
      if (user) role = user[6] === "Aktif" && verifyPassword(password, user[4] || "") ? (user[5] === "Tamu" ? "Tamu" : "Admin") : null;
    } catch {
      // Keep the environment-admin fallback available when PENGGUNA is not initialized.
    }
  }

  if (!username || !role) return NextResponse.json({ success: false, message: "Username atau password salah." }, { status: 401 });

  const response = NextResponse.json({ success: true, data: { username, role } });
  response.cookies.set(sessionCookie(createSession(username, role)));
  return response;
}