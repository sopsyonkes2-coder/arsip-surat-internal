import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getOAuthServices } from "@/lib/google-oauth";
import { hashPassword, readSession, sessionCookieName } from "@/lib/auth";

const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || "";
const sheetName = process.env.GOOGLE_USERS_SHEET_NAME || "PENGGUNA";
const headers = ["ID", "NAMA", "NRP", "USERNAME", "PASSWORD_HASH", "ROLE", "STATUS", "CREATED_AT", "UPDATED_AT"];
type UserRow = { id: string; nama: string; nrp: string; username: string; passwordHash: string; role: "Admin" | "Tamu"; status: "Aktif" | "Nonaktif"; createdAt: string; updatedAt: string };

function adminOnly(request: NextRequest) {
  const session = readSession(request.cookies.get(sessionCookieName)?.value);
  return session?.role === "Admin" ? session : null;
}

async function getRows() {
  if (!spreadsheetId) throw new Error("GOOGLE_SPREADSHEET_ID belum dikonfigurasi.");
  const { oauthSheets } = getOAuthServices();
  try {
    const response = await oauthSheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A:I` });
    return { oauthSheets, rows: response.data.values || [] };
  } catch {
    const spreadsheet = await oauthSheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(title))" });
    const exists = spreadsheet.data.sheets?.some((sheet) => sheet.properties?.title === sheetName);
    if (!exists) {
      await oauthSheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] } });
    }
    await oauthSheets.spreadsheets.values.update({ spreadsheetId, range: `${sheetName}!A1:I1`, valueInputOption: "RAW", requestBody: { values: [headers] } });
    return { oauthSheets, rows: [headers] };
  }
}

function mapUser(row: string[]): UserRow {
  return { id: row[0] || "", nama: row[1] || "", nrp: row[2] || "", username: row[3] || "", passwordHash: row[4] || "", role: row[5] === "Tamu" ? "Tamu" : "Admin", status: row[6] === "Nonaktif" ? "Nonaktif" : "Aktif", createdAt: row[7] || "", updatedAt: row[8] || "" };
}

function publicUser(user: UserRow) {
  return { id: user.id, nama: user.nama, nrp: user.nrp, username: user.username, role: user.role, status: user.status };
}

export async function GET(request: NextRequest) {
  try {
    if (!adminOnly(request)) return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
    const { rows } = await getRows();
    return NextResponse.json({ success: true, data: rows.slice(1).filter((row) => row[0]).map(mapUser).map(publicUser) });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Gagal mengambil pengguna." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!adminOnly(request)) return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
    const body = (await request.json()) as { nama?: string; nrp?: string; username?: string; password?: string; role?: string; status?: string };
    const nama = body.nama?.trim() || ""; const nrp = body.nrp?.trim() || ""; const username = body.username?.trim().toLowerCase() || ""; const password = body.password || "";
    if (!nama || !username || password.length < 4 || (body.role !== "Admin" && body.role !== "Tamu")) return NextResponse.json({ success: false, message: "Nama, username, role, dan password minimal 4 karakter wajib diisi." }, { status: 400 });
    const { oauthSheets, rows } = await getRows();
    const existing = rows.slice(1).map(mapUser);
    if (existing.some((user) => user.username === username || (nrp && user.nrp === nrp))) return NextResponse.json({ success: false, message: "Username atau NRP sudah digunakan." }, { status: 409 });
    const now = new Date().toISOString();
    await oauthSheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetName}!A:I`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: [[randomUUID(), nama, nrp, username, hashPassword(password), body.role, body.status === "Nonaktif" ? "Nonaktif" : "Aktif", now, now]] } });
    return NextResponse.json({ success: true, message: "Pengguna berhasil ditambahkan." });
  } catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Gagal menambah pengguna." }, { status: 500 }); }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!adminOnly(request)) return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
    const body = (await request.json()) as { id?: string; nama?: string; nrp?: string; username?: string; role?: string; status?: string; password?: string };
    const { oauthSheets, rows } = await getRows(); const index = rows.slice(1).findIndex((row) => row[0] === body.id);
    if (index < 0) return NextResponse.json({ success: false, message: "Pengguna tidak ditemukan." }, { status: 404 });
    const current = mapUser(rows[index + 1]); const now = new Date().toISOString(); const updated = [current.id, body.nama?.trim() || current.nama, body.nrp?.trim() || "", body.username?.trim().toLowerCase() || current.username, body.password ? hashPassword(body.password) : current.passwordHash, body.role === "Tamu" ? "Tamu" : "Admin", body.status === "Nonaktif" ? "Nonaktif" : "Aktif", current.createdAt, now];
    const duplicate = rows.slice(1).map(mapUser).some((user, rowIndex) => rowIndex !== index && (user.username === updated[3] || (updated[2] && user.nrp === updated[2])));
    if (duplicate) return NextResponse.json({ success: false, message: "Username atau NRP sudah digunakan." }, { status: 409 });
    await oauthSheets.spreadsheets.values.update({ spreadsheetId, range: `${sheetName}!A${index + 2}:I${index + 2}`, valueInputOption: "RAW", requestBody: { values: [updated] } });
    return NextResponse.json({ success: true, message: "Pengguna berhasil diubah." });
  } catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Gagal mengubah pengguna." }, { status: 500 }); }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!adminOnly(request)) return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, message: "ID pengguna wajib diisi." }, { status: 400 });
    const { oauthSheets, rows } = await getRows();
    const index = rows.slice(1).findIndex((row) => row[0] === id);
    if (index < 0) return NextResponse.json({ success: false, message: "Pengguna tidak ditemukan." }, { status: 404 });
    const spreadsheet = await oauthSheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(sheetId,title))" });
    const sheet = spreadsheet.data.sheets?.find((item) => item.properties?.title === sheetName);
    const sheetId = sheet?.properties?.sheetId;
    if (sheetId === undefined) throw new Error(`Sheet ${sheetName} tidak ditemukan.`);
    await oauthSheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: index + 1, endIndex: index + 2 } } }] } });
    return NextResponse.json({ success: true, message: "Pengguna berhasil dihapus." });
  } catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Gagal menghapus pengguna." }, { status: 500 }); }
}