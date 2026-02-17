"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUtcDayStartIso = getUtcDayStartIso;
function getUtcDayStartIso(reference = new Date()) {
    const dayStart = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate(), 0, 0, 0, 0));
    return dayStart.toISOString();
}
