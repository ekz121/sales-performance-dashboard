import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AUTH_COOKIE, createAdminToken } from "@/lib/auth";
import { apiError, NO_STORE_HEADERS } from "@/lib/api";

const schema = z.object({ username: z.string().min(1), password: z.string().min(1) });

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const configuredUsername = process.env.ADMIN_USERNAME;
    const configuredPassword = process.env.ADMIN_PASSWORD;
    if (!configuredUsername || !configuredPassword) {
      return NextResponse.json({ message: "Kredensial admin belum dikonfigurasi di server." }, { status: 503, headers: NO_STORE_HEADERS });
    }
    const valid = safeEqual(input.username, configuredUsername)
      && safeEqual(input.password, configuredPassword);
    if (!valid) return NextResponse.json({ message: "Username atau password salah." }, { status: 401, headers: NO_STORE_HEADERS });

    const response = NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
    const isHttps = forwardedProtocol
      ? forwardedProtocol === "https"
      : new URL(request.url).protocol === "https:";
    response.cookies.set(AUTH_COOKIE, await createAdminToken(input.username), {
      httpOnly: true,
      sameSite: "lax",
      secure: isHttps,
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
