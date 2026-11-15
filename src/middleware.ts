import { NextResponse, type NextRequest } from "next/server";

/** Route guard: page routes require a session cookie; APIs enforce their own 401/403 (README §7). */
const SESSION_COOKIE = "hacksc_demo_session";

export function middleware(req: NextRequest) {
  if (!req.cookies.get(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/trips/:path*", "/create", "/my-trips"],
};
