import { describe, expect, it } from "vitest";
import { readJsonResponse } from "./client-api";

describe("readJsonResponse", () => {
  it("membaca response JSON yang valid", async () => {
    const response = Response.json({ ok: true });
    await expect(readJsonResponse<{ ok: boolean }>(response)).resolves.toEqual({ ok: true });
  });

  it("mengubah body kosong menjadi pesan yang mudah dipahami", async () => {
    const response = new Response(null, { status: 500 });
    await expect(readJsonResponse(response)).rejects.toMatchObject({
      name: "ApiResponseError",
      status: 500,
    });
  });

  it("menjelaskan ketika server mengirim HTML, bukan JSON", async () => {
    const response = new Response("<html>Not found</html>", {
      status: 404,
      headers: { "content-type": "text/html" },
    });
    await expect(readJsonResponse(response)).rejects.toThrow("halaman HTML");
  });

  it("menggunakan pesan JSON dari API gagal", async () => {
    const response = Response.json({ message: "Data tidak valid" }, { status: 400 });
    await expect(readJsonResponse(response)).rejects.toThrow("Data tidak valid");
  });
});
