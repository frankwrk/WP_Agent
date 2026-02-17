import Fastify from "fastify";
import { getConfig } from "./config";
import {
  installationsRoutes,
  type InstallationsRouteOptions,
} from "./routes/installations";
import { healthRoutes } from "./routes/health";
import { sessionsRoutes, type SessionsRouteOptions } from "./routes/sessions";

export interface BuildServerOptions {
  installations?: InstallationsRouteOptions;
  sessions?: SessionsRouteOptions;
}

export async function buildServer(options: BuildServerOptions = {}) {
  const app = Fastify({ logger: true });

  app.register(healthRoutes, { prefix: "/api/v1" });
  app.register(installationsRoutes, {
    prefix: "/api/v1",
    ...(options.installations ?? {}),
  });
  app.register(sessionsRoutes, {
    prefix: "/api/v1",
    ...(options.sessions ?? {}),
  });

  return app;
}

export function getListenPort(): number {
  return getConfig().port;
}
