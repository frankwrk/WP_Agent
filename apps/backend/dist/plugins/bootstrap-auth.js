"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapAuthHook = void 0;
exports.validateBootstrapAuth = validateBootstrapAuth;
const node_crypto_1 = require("node:crypto");
function constantTimeEqual(a, b) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) {
        return false;
    }
    return (0, node_crypto_1.timingSafeEqual)(left, right);
}
function isValidUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function isValidWpUserId(value) {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}
function invalidAuthEnvelope(code) {
    return {
        ok: false,
        data: null,
        error: {
            code,
            message: "Invalid bootstrap authentication header",
        },
        meta: null,
    };
}
function authErrorCodeForPath(pathname) {
    if (pathname.endsWith("/sessions") || pathname.includes("/sessions/")) {
        return "SESSION_AUTH_FAILED";
    }
    if (pathname.endsWith("/skills") || pathname.includes("/skills/")) {
        return "SKILLS_AUTH_FAILED";
    }
    if (pathname.includes("/plans")) {
        return "PLANS_AUTH_FAILED";
    }
    if (pathname.includes("/runs")) {
        return "RUNS_AUTH_FAILED";
    }
    return "BOOTSTRAP_AUTH_FAILED";
}
function shouldSkipBootstrapAuth(pathname) {
    return pathname === "/api/v1/health"
        || pathname === "/health"
        || pathname === "/api/v1/installations/pair"
        || pathname === "/installations/pair";
}
function getRequestPathname(request) {
    return (request.raw.url ?? request.url).split("?")[0] ?? "";
}
function attachCallerScope(request) {
    request.installationId = undefined;
    request.wpUserId = undefined;
    const body = request.body && typeof request.body === "object"
        ? request.body
        : null;
    const query = request.query && typeof request.query === "object"
        ? request.query
        : null;
    const installationCandidates = [
        body ? String(body.installation_id ?? "").trim() : "",
        query ? String(query.installation_id ?? "").trim() : "",
    ];
    const wpUserCandidates = [
        body ? Number.parseInt(String(body.wp_user_id ?? ""), 10) : Number.NaN,
        query ? Number.parseInt(String(query.wp_user_id ?? ""), 10) : Number.NaN,
    ];
    const installationId = installationCandidates.find((value) => value && isValidUuid(value));
    const wpUserId = wpUserCandidates.find((value) => isValidWpUserId(value));
    request.installationId = installationId;
    request.wpUserId = wpUserId;
}
async function validateBootstrapAuth(request, reply, config) {
    const pathname = getRequestPathname(request);
    if (shouldSkipBootstrapAuth(pathname)) {
        return true;
    }
    const authErrorCode = authErrorCodeForPath(pathname);
    const handleFailure = async () => {
        await reply.code(401).send(invalidAuthEnvelope(authErrorCode));
    };
    if (!config.pairingBootstrapSecret) {
        await handleFailure();
        return false;
    }
    const rawHeader = request.headers["x-wp-agent-bootstrap"];
    const header = Array.isArray(rawHeader)
        ? rawHeader[0] ?? ""
        : String(rawHeader ?? "");
    if (!header || !constantTimeEqual(header, config.pairingBootstrapSecret)) {
        await handleFailure();
        return false;
    }
    attachCallerScope(request);
    return true;
}
const bootstrapAuthHook = async (app, options) => {
    const { config } = options;
    app.addHook("preHandler", async (request, reply) => {
        const ok = await validateBootstrapAuth(request, reply, config);
        if (!ok) {
            return;
        }
    });
};
exports.bootstrapAuthHook = bootstrapAuthHook;
