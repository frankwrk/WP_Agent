"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./server");
const config_1 = require("./config");
async function main() {
    const config = (0, config_1.getConfig)();
    (0, config_1.validateProductionBootConfig)(config);
    const server = await (0, server_1.buildServer)();
    const port = (0, server_1.getListenPort)();
    await server.listen({ port, host: "0.0.0.0" });
    server.log.info({ port }, "backend started");
}
main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
});
