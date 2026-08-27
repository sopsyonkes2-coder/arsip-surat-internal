import { NextRequest, NextResponse } from "next/server";
import { readSession, sessionCookieName } from "@/lib/auth";

const protectedPaths = ["/dashboard", "/arsip", "/pengguna", "/pengaturan"];

export function proxy(request: NextRequest) {
  const isProtected = protectedPaths.some((path) =>
    request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`)
  );

  if (!isProtected) return NextResponse.next();

  const session = readSession(request.cookies.get(sessionCookieName)?.value);
  const hasSession = Boolean(session);

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  const adminOnly = ["/pengguna", "/pengaturan", "/arsip/tambah", "/arsip/tambah-massal", "/scanner"];
  if (session?.role === "Tamu" && adminOnly.some((path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/arsip/:path*", "/pengguna/:path*", "/pengaturan/:path*"],
};