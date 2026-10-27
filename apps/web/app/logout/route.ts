import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { TOKEN_COOKIE } from "@/lib/api";

export async function GET(request: Request) {
  (await cookies()).delete(TOKEN_COOKIE);
  return NextResponse.redirect(new URL("/login", request.url));
}
