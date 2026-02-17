"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isApiEnvelope = isApiEnvelope;
exports.withRequestMeta = withRequestMeta;
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isApiEnvelope(value) {
    if (!isRecord(value)) {
        return false;
    }
    return (typeof value.ok === "boolean"
        && "data" in value
        && "error" in value
        && "meta" in value);
}
function withRequestMeta(payload, requestId) {
    if (!isApiEnvelope(payload)) {
        return payload;
    }
    const existingMeta = payload.meta && isRecord(payload.meta) ? payload.meta : {};
    return {
        ...payload,
        meta: {
            ...existingMeta,
            request_id: requestId,
        },
    };
}
