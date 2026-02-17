"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildServer = buildServer;
exports.getListenPort = getListenPort;
const fastify_1 = __importDefault(require("fastify"));
const config_1 = require("./config");
const installations_1 = require("./routes/installations");
const health_1 = require("./routes/health");
const sessions_1 = require("./routes/sessions");
const skills_1 = require("./routes/skills");
const runs_1 = require("./routes/runs");
const bootstrap_auth_1 = require("./plugins/bootstrap-auth");
const http_envelope_1 = require("./utils/http-envelope");
async function buildServer(options = {}) {
    const app = (0, fastify_1.default)({ logger: true });
    const config = options.config
        ?? options.installations?.config
        ?? options.sessions?.config
        ?? options.skills?.config
        ?? options.runs?.config
        ?? (0, config_1.getConfig)();
    app.addHook("onSend", (request, reply, payload, done) => {
        reply.header("x-request-id", request.id);
        done(null, payload);
    });
    app.addHook("preSerialization", (request, _reply, payload, done) => {
        done(null, (0, http_envelope_1.withRequestMeta)(payload, request.id));
    });
    app.addHook("preHandler", async (request, reply) => {
        const ok = await (0, bootstrap_auth_1.validateBootstrapAuth)(request, reply, config);
        if (!ok) {
            return;
        }
    });
    app.register(health_1.healthRoutes, { prefix: "/api/v1" });
    app.register(installations_1.installationsRoutes, {
        prefix: "/api/v1",
        ...(options.installations ?? {}),
    });
    app.register(sessions_1.sessionsRoutes, {
        prefix: "/api/v1",
        ...(options.sessions ?? {}),
    });
    app.register(skills_1.skillsRoutes, {
        prefix: "/api/v1",
        ...(options.skills ?? {}),
    });
    app.register(runs_1.runsRoutes, {
        prefix: "/api/v1",
        ...(options.runs ?? {}),
    });
    return app;
}
function getListenPort() {
    return (0, config_1.getConfig)().port;
}
