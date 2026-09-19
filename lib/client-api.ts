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
    const gatewayFailure = response.status === 502 || response.status === 504;
    throw new ApiResponseError(
      isHtml
        ? gatewayFailure
          ? "Respons server terputus karena proses terlalu lama. Status impor akan diperiksa otomatis pada riwayat."
          : `Server hosting mengirim halaman HTML (HTTP ${response.status || "tanpa status"}), bukan respons API. Periksa status deploy dan log fungsi Netlify.`
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
