import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import type { Request, Response } from "express";
import { createServer } from "./server.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);

// createMcpExpressApp sets up body parsing and standard MCP middleware
const app = createMcpExpressApp({ host: "0.0.0.0" });
app.use(cors());

// In stateless mode: a fresh server + transport is created per HTTP request.
// This ensures clean state across concurrent calls from different LLM clients.
app.all("/mcp", async (req: Request, res: Response) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

const httpServer = app.listen(PORT, () => {
  console.log(`\n🧬 cBioPortal OncoPrint MCP App Server`);
  console.log(`   Listening at http://localhost:${PORT}/mcp`);
  console.log(`\n   Connect Claude Desktop or the ext-apps basic-host to this URL.\n`);
});

const shutdown = () => {
  httpServer.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
