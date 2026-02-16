import { buildServer } from "./server";

async function main() {
  const server = await buildServer();
  const port = Number(process.env.PORT ?? 3001);
  await server.listen({ port, host: "0.0.0.0" });
  server.log.info({ port }, "backend started");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
