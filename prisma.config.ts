import "dotenv/config";
import { defineConfig } from "prisma/config";
import { normalizeLocalDatabaseUrl } from "./lib/database-url";

normalizeLocalDatabaseUrl();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
