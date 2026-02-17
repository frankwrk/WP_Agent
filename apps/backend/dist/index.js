"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./server");
async function main() {
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
