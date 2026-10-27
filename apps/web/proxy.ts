import { NextResponse, type NextRequest } from "next/server";

// Cek awal saja: tanpa cookie sesi → ke halaman login. Otorisasi sebenarnya dilakukan API di setiap request.
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("sml_token");
  const { pathname, search } = request.nextUrl;
  if (!hasSession && pathname !== "/login") {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // /bff (upload/download file) memeriksa cookie sendiri dan dikecualikan agar body upload besar tidak dibatasi proxy.
  matcher: ["/((?!_next/static|_next/image|bff/|icon.svg|logo.svg|favicon.ico).*)"],
};
