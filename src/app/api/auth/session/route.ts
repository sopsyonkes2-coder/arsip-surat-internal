import { NextRequest, NextResponse } from "next/server";
import { readSession, sessionCookieName } from "@/lib/auth";

export function GET(request: NextRequest) {
  const session = readSession(request.cookies.get(sessionCookieName)?.value);
  return NextResponse.json({ success: Boolean(session), data: session }, { status: session ? 200 : 401 });
}