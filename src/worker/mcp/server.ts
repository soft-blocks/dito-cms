import type { Context } from "hono";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker-provider.js";
import { StreamableHTTPTransport } from "@hono/mcp";

import type { AppEnv } from "../lib/app";
import { TOOLS, type ToolContext } from "./tools";

import { APP_VERSION } from "@/shared/constants";

// Stateless MCP server. A fresh Server + transport is built per request (bindings are
// request-scoped); there are no sessions or Durable Objects. The @hono/mcp transport runs
// stateless because we pass no sessionIdGenerator, and we use a JSON response (not SSE) for
// a simple request/response that's easy for any client to consume. The cfworker JSON-schema
// validator is used instead of the default Ajv one, which relies on eval (banned in workerd).

export async function handleMcpRequest(c: Context<AppEnv>): Promise<Response> {
  const ctx: ToolContext = {
    db: c.get("db"),
    env: c.env,
    origin: c.get("origin"),
    userId: c.get("authUserId"),
  };

  const server = new Server(
    { name: "dito-cms", version: APP_VERSION },
    { capabilities: { tools: {} }, jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = TOOLS.find((t) => t.name === req.params.name);
    if (!tool) {
      return { content: [{ type: "text", text: `Unknown tool "${req.params.name}"` }], isError: true };
    }
    return tool.run(ctx, req.params.arguments);
  });

  const transport = new StreamableHTTPTransport({ enableJsonResponse: true });
  await server.connect(transport);
  const response = await transport.handleRequest(c);
  return response ?? c.body(null, 202);
}
