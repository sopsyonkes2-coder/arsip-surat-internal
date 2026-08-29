import { NextRequest, NextResponse } from "next/server";
import { readSession, sessionCookieName } from "@/lib/auth";

const protectedPaths = [
  "/dashboard",
  "/arsip",
  "/pengguna",
  "/pengaturan",
];

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const isProtected = protectedPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const session = readSession(
    request.cookies.get(sessionCookieName)?.value
  );

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = session.role;

  const adminOnlyPaths = ["/pengguna", "/pengaturan"];
  const operatorPaths = [
    "/arsip/tambah",
    "/arsip/tambah-massal",
    "/scanner",
  ];

  if (
    (role === "Operator" || role === "Tamu") &&
    adminOnlyPaths.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`)
    )
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (
    role === "Tamu" &&
    operatorPaths.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`)
    )
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/arsip/:path*",
    "/pengguna/:path*",
    "/pengaturan/:path*",
  ],
};