import { buildServer, getListenPort } from "./server";
import { getConfig, validateProductionBootConfig } from "./config";

async function main() {
  const config = getConfig();
  validateProductionBootConfig(config);

  const server = await buildServer();
  const port = getListenPort();
  await server.listen({ port, host: "0.0.0.0" });
  server.log.info({ port }, "backend started");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
