import { MCPServer, object, text, completable, error } from "mcp-use/server";
import { z } from "zod";

// Create MCP server instance
const server = new MCPServer({
  name: "my-mcp-server",
  title: "my-mcp-server", // display name
  version: "1.0.0",
  description: "My first MCP server with all features",
  baseUrl: process.env.MCP_URL || "http://localhost:3000", // Full base URL (e.g., https://myserver.com)
  favicon: "favicon.ico",
  websiteUrl: "https://mcp-use.com", // Can be customized later
  icons: [
    {
      src: "icon.svg",
      mimeType: "image/svg+xml",
      sizes: ["512x512"],
    },
  ],
});

/**
 * Define UI Widgets
 * All React components in the `resources/` folder
 * are automatically registered as MCP tools and resources.
 *
 * Just export widgetMetadata with description and Zod schema,
 * and mcp-use handles the rest!
 *
 * Docs: https://manufact.com/docs/typescript/server/mcp-apps
 */

/*
 * Define MCP tools
 * Docs: https://mcp-use.com/docs/typescript/server/tools
 */
server.tool(
  {
    name: "fetch-weather",
    description: "Fetch the weather for a city",
    schema: z.object({
      city: z.string().describe("The city to fetch the weather for"),
    }),
  },
  async ({ city }) => {
    return text(`The weather in ${city} is sunny`);
  }
);

server.tool(
  {
    name: "list-mcp-registry-servers",
    description:
      "Retrieve MCP servers from registry.modelcontextprotocol.io with optional filtering and pagination",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      cursor: z
        .string()
        .optional()
        .describe("Pagination cursor (example: server-cursor-123)"),
      include_deleted: z
        .enum(["not_set", "false", "true"])
        .optional()
        .describe(
          "Whether to include deleted servers: not_set (omit query param), false, or true"
        ),
      limit: z
        .number()
        .optional()
        .describe("Max number of servers to return (default: 30)"),
      search: z.string().optional().describe("Search term (example: filesystem)"),
      updated_since: z
        .string()
        .optional()
        .describe(
          "Only return servers updated since this ISO timestamp (example: 2025-08-07T13:15:04.280Z)"
        ),
      version: z
        .string()
        .optional()
        .describe("Version selector (example: latest)"),
    }),
  },
  async ({ cursor, include_deleted, limit, search, updated_since, version }) => {
    const normalizedLimit = Number.isFinite(limit) ? Number(limit) : 30;
    if (!Number.isInteger(normalizedLimit) || normalizedLimit < 1 || normalizedLimit > 100) {
      return error("`limit` must be an integer between 1 and 100.");
    }

    if (updated_since && Number.isNaN(Date.parse(updated_since))) {
      return error(
        "`updated_since` must be a valid ISO datetime string, e.g. 2025-08-07T13:15:04.280Z."
      );
    }

    const url = new URL("https://registry.modelcontextprotocol.io/v0.1/servers");
    const params = url.searchParams;

    if (cursor) params.set("cursor", cursor);
    params.set("limit", String(normalizedLimit));
    if (search) params.set("search", search);
    if (updated_since) params.set("updated_since", updated_since);
    if (version) params.set("version", version);
    if (include_deleted && include_deleted !== "not_set") {
      params.set("include_deleted", include_deleted);
    }

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json, application/problem+json",
        },
      });

      const rawBody = await response.text();
      let body: unknown = null;

      if (rawBody) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          body = rawBody;
        }
      }

      if (!response.ok) {
        return error(
          `Registry API request failed (${response.status} ${response.statusText}) for ${url.toString()}`
        );
      }

      return object({
        source: "registry.modelcontextprotocol.io",
        endpoint: url.toString(),
        request: {
          cursor,
          include_deleted: include_deleted ?? "not_set",
          limit: normalizedLimit,
          search,
          updated_since,
          version,
        },
        response: body,
      });
    } catch (err) {
      return error(
        `Failed to retrieve MCP servers: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }
);

/*
 * Define MCP resources
 * Docs: https://mcp-use.com/docs/typescript/server/resources
 */
server.resource(
  {
    name: "config",
    uri: "config://settings",
    description: "Server configuration",
  },
  async () =>
    object({
      theme: "dark",
      language: "en",
    })
);

/*
 * Define MCP prompts
 * Docs: https://mcp-use.com/docs/typescript/server/prompts
 */
server.prompt(
  {
    name: "review-code",
    description: "Review code for best practices and potential issues",
    schema: z.object({
      language: completable(z.string(), [
        "python",
        "javascript",
        "typescript",
        "java",
        "cpp",
        "go",
        "rust",
      ]).describe("The programming language"),
      code: z.string().describe("The code to review"),
    }),
  },
  async ({ language, code }) => {
    return text(`Reviewing ${language} code:\n\n${code}`);
  }
);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
console.log(`Server running on port ${PORT}`);
// Start the server
server.listen(PORT);
