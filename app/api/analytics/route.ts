import { noStoreJson } from "@/lib/api";
import { getAnalytics } from "@/lib/analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    return noStoreJson(await getAnalytics(new URL(request.url).searchParams));
  } catch (error) {
    console.error(error);
    return noStoreJson(
      { message: error instanceof Error ? error.message : "Data analitik gagal dimuat." },
      { status: 500 },
    );
  }
}
