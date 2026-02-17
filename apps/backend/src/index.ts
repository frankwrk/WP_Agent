import { buildServer, getListenPort } from "./server";

async function main() {
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
