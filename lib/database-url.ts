/**
 * Membantu pengguna XAMPP yang hanya menulis nama database (mis. `erafone`)
 * di .env lokal. Production tetap wajib memakai URL MySQL yang lengkap.
 */
export function normalizeLocalDatabaseUrl() {
  const configured = process.env.DATABASE_URL?.trim();
  if (!configured || /^mysql:\/\//i.test(configured)) return;

  if (
    process.env.NODE_ENV !== "production" &&
    /^[a-zA-Z0-9_-]+$/.test(configured)
  ) {
    process.env.DATABASE_URL = `mysql://root:@127.0.0.1:3306/${configured}`;
  }
}
