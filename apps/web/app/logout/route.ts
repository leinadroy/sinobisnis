import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { TOKEN_COOKIE } from "@/lib/api";
import { publicUrl } from "@/lib/public-url";

export async function GET(request: Request) {
  return NextResponse.redirect(publicUrl("/", request));
}

export async function POST(request: Request) {
  (await cookies()).delete(TOKEN_COOKIE);
  return NextResponse.redirect(publicUrl("/login", request), 303);
}
