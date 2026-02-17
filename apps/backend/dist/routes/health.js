"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRoutes = healthRoutes;
async function healthRoutes(app) {
    app.get("/health", async () => ({
        ok: true,
        service: "wp-agent-backend",
    }));
}
