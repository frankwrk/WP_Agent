"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POLICY_PRESETS = void 0;
exports.isPolicyPreset = isPolicyPreset;
exports.POLICY_PRESETS = ["fast", "balanced", "quality", "reasoning"];
function isPolicyPreset(value) {
    return exports.POLICY_PRESETS.includes(value);
}
