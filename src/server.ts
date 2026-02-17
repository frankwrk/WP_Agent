import Fastify from "fastify";
import { getConfig } from "./config";
import {
  installationsRoutes,
  type InstallationsRouteOptions,
} from "./routes/installations";
import { healthRoutes } from "./routes/health";
import { sessionsRoutes, type SessionsRouteOptions } from "./routes/sessions";
import { skillsRoutes, type SkillsRouteOptions } from "./routes/skills";
import { runsRoutes, type RunsRouteOptions } from "./routes/runs";

export interface BuildServerOptions {
  installations?: InstallationsRouteOptions;
  sessions?: SessionsRouteOptions;
  skills?: SkillsRouteOptions;
  runs?: RunsRouteOptions;
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
  app.register(skillsRoutes, {
    prefix: "/api/v1",
    ...(options.skills ?? {}),
  });
  app.register(runsRoutes, {
    prefix: "/api/v1",
    ...(options.runs ?? {}),
  });

  return app;
}

export function getListenPort(): number {
  return getConfig().port;
}
