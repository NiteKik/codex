import { config } from "./config.js";
import { createGatewayRuntime } from "./server.js";

const runtime = createGatewayRuntime();

const boot = async () => {
  await runtime.mockUpstream.listen();
  await runtime.poller.runOnce("manual");
  runtime.poller.start();
  await runtime.app.listen({
    port: config.gatewayPort,
    host: "127.0.0.1",
  });

  console.log(`Mock upstream listening on http://127.0.0.1:${config.mockUpstreamPort}`);
  console.log(`Gateway listening on http://127.0.0.1:${config.gatewayPort}`);
  console.log("Admin endpoints:");
  console.log("  GET  /healthz");
  console.log("  GET  /admin/settings");
  console.log("  PUT  /admin/settings");
  console.log("  GET  /admin/access-token");
  console.log("  GET  /admin/tokens");
  console.log("  POST /admin/tokens");
  console.log("  PATCH /admin/tokens/:tokenId");
  console.log("  DELETE /admin/tokens/:tokenId");
  console.log("  GET  /admin/accounts");
  console.log("  GET  /admin/cdks/options");
  console.log("  POST /admin/accounts/:accountId/upgrade");
  console.log("  GET  /admin/virtual-quota");
  console.log("  GET  /admin/logs");
  console.log("  GET  /admin/scheduler/preview?session_id=demo&path=/v1/chat/completions&method=POST");
  console.log("  POST /admin/chatgpt-capture/start");
  console.log("  GET  /admin/chatgpt-capture/:taskId");
  console.log("  POST /admin/chatgpt-capture/:taskId/save");
  console.log("  POST /admin/poll");
  console.log(
    `Gateway access token: ${config.requireGatewayAccessToken ? "required" : "optional"} (${config.gatewayAccessTokenSource})`,
  );
  if (config.gatewayAccessTokenFilePath) {
    console.log(`  token file: ${config.gatewayAccessTokenFilePath}`);
  }
  console.log("  use GET /admin/access-token to retrieve current token");
  console.log("Proxy endpoints:");
  console.log("  ALL  /proxy/*");
  console.log("  ALL  /v1/*");
  console.log("  ALL  /backend-api/*");
};

void boot();
