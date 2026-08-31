import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import { client } from "./db/client";
import { extractionsRoutes } from "./routes/extractions.routes";
import { questionsRoutes } from "./routes/questions.routes";
import { exportRoutes } from "./routes/export.routes";
import { falharExtracoesInterrompidas } from "./services/extraction-job.service";
import { verificarAmbientePipeline } from "./services/extraction.service";

const app = Fastify({ logger: true });

// Headers de segurança. A API só devolve JSON e um XML de download — nenhuma
// resposta carrega HTML/script próprio, então a CSP mais estrita (`default-src
// 'none'`) é a correta. helmet também põe nosniff, frameguard, Referrer-Policy
// e afins. HSTS fica desligado em dev (http); ligue via env em produção https.
await app.register(helmet, {
  contentSecurityPolicy: {
    useDefaults: false,
    directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
  },
  frameguard: { action: "deny" },
  hsts: process.env.NODE_ENV === "production",
  // A API é lida por fetch de outra origem (Vite dev / front hospedado à parte).
  crossOriginResourcePolicy: { policy: "cross-origin" },
});

// Sem CORS_ORIGIN, libera só os hosts de dev do Vite. Em produção o front
// é servido pela mesma origem (proxy), então nem precisa de CORS — mas
// deixar aberto (`origin: true`) reflete qualquer site.
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : ["http://localhost:5173", "http://127.0.0.1:5173"];

await app.register(cors, {
  origin: corsOrigin,
  // Headers que o front lê no download do XML (via fetch).
  exposedHeaders: ["Content-Disposition", "X-Export-Avisos"],
});
await app.register(multipart, {
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB por arquivo — ajustável se as provas forem maiores
    files: Number(process.env.MAX_ARQUIVOS ?? 20),
    fields: 10,
  },
});
await app.register(extractionsRoutes);
await app.register(questionsRoutes);
await app.register(exportRoutes);

app.get("/health", async () => ({ status: "ok" }));

verificarAmbientePipeline(app.log);

// Jobs de extração que ficaram presos por um restart anterior não têm
// quem os toque — marca como erro pra não travar o polling do frontend.
await falharExtracoesInterrompidas(app.log).catch((erro) =>
  app.log.error(erro, "Falha ao limpar extrações interrompidas"),
);

// Shutdown limpo: drena o servidor HTTP e fecha o pool do Postgres em vez
// de deixar conexões penduradas no restart/deploy.
app.addHook("onClose", async () => {
  await client.end({ timeout: 5 });
});

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    app.log.info(`${sinal} recebido — encerrando.`);
    app.close().then(
      () => process.exit(0),
      (erro) => {
        app.log.error(erro, "Falha ao encerrar");
        process.exit(1);
      },
    );
  });
}

const port = Number(process.env.PORT ?? 3333);
const host = process.env.HOST ?? "127.0.0.1";
app.listen({ port, host }).catch((erro) => {
  app.log.error(erro);
  process.exit(1);
});
