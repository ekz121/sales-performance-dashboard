import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const NO_STORE_HEADERS = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

export function noStoreJson(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: { ...NO_STORE_HEADERS, ...init?.headers },
  });
}

function errorCode(error: unknown) {
  if (typeof error !== "object" || !error || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function errorName(error: unknown) {
  if (typeof error !== "object" || !error || !("name" in error)) return "";
  return typeof error.name === "string" ? error.name : "";
}

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return noStoreJson(
      { message: error.issues[0]?.message || "Data tidak valid" },
      { status: 400 },
    );
  }
  const code = errorCode(error);
  if (code === "P2002") {
    return noStoreJson(
      { message: "Data dengan kombinasi tersebut sudah ada." },
      { status: 409 },
    );
  }

  if (code === "ANALYTICS_SETUP_REQUIRED") {
    const message =
      error instanceof Error
        ? error.message
        : "Belum ada transaksi. Import file Excel/CSV terlebih dahulu.";
    return noStoreJson({ code, message }, { status: 409 });
  }

  const name = errorName(error);
  if (code === "P1000") {
    console.error("[DATABASE_AUTH_ERROR]", error);
    return noStoreJson(
      {
        code: "DATABASE_AUTH_ERROR",
        message:
          "Database menolak username atau password. Periksa DATABASE_URL pada file environment.",
      },
      { status: 503 },
    );
  }
  if (
    code === "P1001" ||
    code === "P1002" ||
    name === "PrismaClientInitializationError"
  ) {
    console.error("[DATABASE_UNAVAILABLE]", error);
    return noStoreJson(
      {
        code: "DATABASE_UNAVAILABLE",
        message:
          "Database tidak dapat dijangkau. Pastikan service MySQL aktif dan DATABASE_URL memakai host serta port yang masih berlaku.",
      },
      { status: 503 },
    );
  }
  if (code === "P1003" || code === "P2021" || code === "P2022") {
    console.error("[DATABASE_SCHEMA_ERROR]", error);
    return noStoreJson(
      {
        code: "DATABASE_SCHEMA_ERROR",
        message:
          "Struktur database belum lengkap. Jalankan npx prisma migrate deploy lalu coba kembali.",
      },
      { status: 503 },
    );
  }
  console.error(error);
  return noStoreJson(
    {
      code: "INTERNAL_SERVER_ERROR",
      message:
        "Terjadi kesalahan pada server. Coba segarkan; jika tetap gagal, periksa log server.",
    },
    { status: 500 },
  );
}

export function revalidateDashboard() {
  revalidatePath("/dashboard");
}
