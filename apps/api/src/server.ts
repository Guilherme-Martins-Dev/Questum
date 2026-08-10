import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { extractionsRoutes } from "./routes/extractions.routes";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(extractionsRoutes);

app.get("/health", async () => ({ status: "ok" }));

const port = Number(process.env.PORT ?? 3333);
app.listen({ port, host: "0.0.0.0" }).catch((erro) => {
  app.log.error(erro);
  process.exit(1);
});
