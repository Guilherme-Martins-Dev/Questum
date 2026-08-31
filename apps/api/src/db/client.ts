import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Defina DATABASE_URL no .env antes de subir a API.");
}

/**
 * Cliente pg exportado (além do `db`) pra permitir um shutdown limpo:
 * `server.ts` chama `client.end()` no SIGTERM/SIGINT, drenando as conexões
 * em vez de deixá-las penduradas no restart/deploy.
 */
export const client = postgres(connectionString, {
  max: Number(process.env.DB_POOL_MAX ?? 10),
  idle_timeout: 20, // segundos ociosos antes de fechar a conexão
  connect_timeout: Number(process.env.DB_CONNECT_TIMEOUT ?? 10), // falha rápido se o banco estiver fora
});

export const db = drizzle(client, { schema });
