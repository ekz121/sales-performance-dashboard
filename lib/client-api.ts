export class ApiResponseError extends Error {
  constructor(
    message: string,
    public readonly status = 0,
  ) {
    super(message);
    this.name = "ApiResponseError";
  }
}

function fallbackMessage(response: Response) {
  if (response.status === 404) {
    return "Layanan data tidak ditemukan. Pastikan aplikasi dijalankan lewat server Next.js, bukan dibuka sebagai file HTML atau ditempatkan langsung di htdocs.";
  }
  if (response.status >= 500) {
    return "Server data sedang bermasalah. Periksa koneksi MySQL dan konfigurasi DATABASE_URL.";
  }
  return `Permintaan gagal (${response.status || "tanpa status"}).`;
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.text();
  const contentType = response.headers.get("content-type") || "";

  if (!body.trim()) {
    throw new ApiResponseError(
      response.ok
        ? "Server mengirim respons kosong. Silakan segarkan halaman atau periksa proses server."
        : fallbackMessage(response),
      response.status,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    const isHtml = contentType.includes("text/html") || /^\s*</.test(body);
    throw new ApiResponseError(
      isHtml
        ? "Server mengirim halaman HTML, bukan data JSON. Jalankan aplikasi melalui Next.js dan pastikan endpoint API tersedia."
        : "Format respons server tidak valid. Silakan periksa log server.",
      response.status,
    );
  }

  if (!response.ok) {
    const message =
      typeof parsed === "object" && parsed && "message" in parsed
        ? String(parsed.message)
        : fallbackMessage(response);
    throw new ApiResponseError(message, response.status);
  }

  return parsed as T;
}

export async function apiFetch<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new ApiResponseError(
      "Tidak dapat terhubung ke server. Pastikan npm run dev masih berjalan dan buka alamat http://localhost:3000.",
    );
  }
  return readJsonResponse<T>(response);
}


export function notifyDashboardUpdate() {
  if (typeof window === "undefined") return;
  try {
    const channel = new BroadcastChannel("erafone-dashboard");
    channel.postMessage({ type: "refresh", at: Date.now() });
    channel.close();
    window.localStorage.setItem("erafone-dashboard-refresh", String(Date.now()));
  } catch {
    // Polling dashboard tetap menjadi fallback bila BroadcastChannel tidak tersedia.
  }
}
