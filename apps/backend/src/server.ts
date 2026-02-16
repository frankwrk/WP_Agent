import Fastify from "fastify";
import { healthRoutes } from "./routes/health";

export async function buildServer() {
  const app = Fastify({ logger: true });

  app.register(healthRoutes, { prefix: "/api/v1" });

  return app;
}
