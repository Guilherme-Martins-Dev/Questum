import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { extractionsRoutes } from "./routes/extractions.routes";
import { questionsRoutes } from "./routes/questions.routes";
import { exportRoutes } from "./routes/export.routes";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(multipart, {
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB por arquivo — ajustável se as provas forem maiores
});
await app.register(extractionsRoutes);
await app.register(questionsRoutes);
await app.register(exportRoutes);

app.get("/health", async () => ({ status: "ok" }));

const port = Number(process.env.PORT ?? 3333);
app.listen({ port, host: "0.0.0.0" }).catch((erro) => {
  app.log.error(erro);
  process.exit(1);
});
