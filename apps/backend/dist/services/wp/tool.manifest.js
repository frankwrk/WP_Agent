"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateToolManifest = validateToolManifest;
exports.assertRequiredReadTools = assertRequiredReadTools;
exports.fetchToolManifest = fetchToolManifest;
const config_1 = require("../../config");
const wp_client_1 = require("./wp.client");
const REQUIRED_READ_TOOLS = [
    "site.get_environment",
    "content.inventory",
    "seo.get_config",
];
function parseToolDefinition(input) {
    if (!input || typeof input !== "object") {
        return null;
    }
    const candidate = input;
    const name = String(candidate.name ?? "").trim();
    const description = String(candidate.description ?? "").trim();
    const endpoint = String(candidate.endpoint ?? "").trim();
    const method = String(candidate.method ?? "").toUpperCase();
    const readOnly = Boolean(candidate.readOnly);
    if (!name || !description || !endpoint) {
        return null;
    }
    if (method !== "GET" && method !== "POST") {
        return null;
    }
    return {
        name,
        description,
        endpoint,
        method,
        readOnly,
        inputSchema: candidate.inputSchema && typeof candidate.inputSchema === "object"
            ? candidate.inputSchema
            : undefined,
        outputSchema: candidate.outputSchema && typeof candidate.outputSchema === "object"
            ? candidate.outputSchema
            : undefined,
    };
}
function validateToolManifest(input) {
    if (!input || typeof input !== "object") {
        throw new Error("Tool manifest response must be an object");
    }
    const response = input;
    const ok = Boolean(response.ok);
    const data = response.data;
    if (!ok || !data || typeof data !== "object") {
        throw new Error("Tool manifest response is not successful");
    }
    const dataRecord = data;
    const rawTools = Array.isArray(dataRecord.tools) ? dataRecord.tools : [];
    const tools = rawTools
        .map((tool) => parseToolDefinition(tool))
        .filter((tool) => tool !== null);
    return {
        ok: true,
        data: {
            tools,
            auth: dataRecord.auth && typeof dataRecord.auth === "object"
                ? dataRecord.auth
                : undefined,
        },
        error: response.error ?? null,
        meta: response.meta && typeof response.meta === "object"
            ? response.meta
            : {},
    };
}
function assertRequiredReadTools(manifest) {
    const names = new Set(manifest.data.tools.map((tool) => tool.name));
    for (const required of REQUIRED_READ_TOOLS) {
        if (!names.has(required)) {
            throw new Error(`Required read tool is missing from manifest: ${required}`);
        }
    }
}
async function fetchToolManifest(installationId, wpToolApiBase = (0, config_1.getConfig)().wpToolApiBase) {
    if (!wpToolApiBase) {
        throw new Error("WP_TOOL_API_BASE is required to fetch WP tool manifest");
    }
    const manifestUrl = `${wpToolApiBase.replace(/\/$/, "")}/manifest`;
    const response = await (0, wp_client_1.signedWpJsonRequest)({
        installationId,
        url: manifestUrl,
        method: "GET",
    });
    return validateToolManifest(response);
}
