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
import { validateBootstrapAuth } from "./plugins/bootstrap-auth";
import { withRequestMeta } from "./utils/http-envelope";

export interface BuildServerOptions {
  config?: ReturnType<typeof getConfig>;
  installations?: InstallationsRouteOptions;
  sessions?: SessionsRouteOptions;
  skills?: SkillsRouteOptions;
  runs?: RunsRouteOptions;
}

export async function buildServer(options: BuildServerOptions = {}) {
  const app = Fastify({ logger: true });
  const config = options.config
    ?? options.installations?.config
    ?? options.sessions?.config
    ?? options.skills?.config
    ?? options.runs?.config
    ?? getConfig();

  app.addHook("onSend", (request, reply, payload, done) => {
    reply.header("x-request-id", request.id);
    done(null, payload);
  });

  app.addHook("preSerialization", (request, _reply, payload, done) => {
    done(null, withRequestMeta(payload, request.id));
  });

  app.addHook("preHandler", async (request, reply) => {
    const ok = await validateBootstrapAuth(request, reply, config);
    if (!ok) {
      return;
    }
  });

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
