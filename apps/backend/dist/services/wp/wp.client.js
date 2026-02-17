"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signedWpJsonRequestWithMeta = signedWpJsonRequestWithMeta;
exports.signedWpJsonRequest = signedWpJsonRequest;
exports.buildWpUrlWithQuery = buildWpUrlWithQuery;
exports.signedWpGetJsonWithMeta = signedWpGetJsonWithMeta;
exports.signedWpGetJson = signedWpGetJson;
const signature_1 = require("./signature");
async function signedWpJsonRequestWithMeta(options) {
    const signed = (0, signature_1.createSignedRequestHeaders)({
        installationId: options.installationId,
        url: options.url,
        method: options.method,
        body: options.body,
    });
    const requestHeaders = {
        ...signed.headers,
        Accept: "application/json",
    };
    let payload;
    if (options.method !== "GET") {
        payload = JSON.stringify(options.body ?? {});
        requestHeaders["Content-Type"] = "application/json";
    }
    const response = await fetch(options.url, {
        method: options.method,
        headers: requestHeaders,
        body: payload,
    });
    const text = await response.text();
    let parsed = null;
    if (text) {
        try {
            parsed = JSON.parse(text);
        }
        catch {
            parsed = text;
        }
    }
    if (!response.ok) {
        throw new Error(`Signed WP request failed (${response.status}): ${JSON.stringify(parsed)}`);
    }
    return {
        data: parsed,
        toolCallId: signed.toolCallId,
    };
}
async function signedWpJsonRequest(options) {
    const response = await signedWpJsonRequestWithMeta(options);
    return response.data;
}
function buildWpUrlWithQuery(baseUrl, query) {
    if (!query) {
        return baseUrl;
    }
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(query)) {
        if (value === null || value === undefined) {
            continue;
        }
        url.searchParams.set(key, String(value));
    }
    return url.toString();
}
async function signedWpGetJsonWithMeta(options) {
    const urlWithQuery = buildWpUrlWithQuery(options.url, options.query);
    return signedWpJsonRequestWithMeta({
        installationId: options.installationId,
        method: "GET",
        url: urlWithQuery,
    });
}
async function signedWpGetJson(options) {
    const response = await signedWpGetJsonWithMeta(options);
    return response.data;
}
