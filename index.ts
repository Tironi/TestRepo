import "dotenv/config";
import { MCPServer, object, text, completable, error, widget } from "mcp-use/server";
import { z } from "zod";
import { registerAnalyzeTool } from "./src/tools/analyze-server.js";

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
    name: "list-pulse-servers",
    description: "List available MCP servers from the Pulse directory, with optional search filtering",
    schema: z.object({
      search: z.string().optional().describe("Optional search term to filter servers by name or description"),
    }),
    widget: {
      name: "pulse-mcp-dashboard",
      invoking: "Loading MCP Servers…",
      invoked: "MCP Servers loaded",
    },
  },
  async ({ search }) => {
    // Server directory – in production this would come from a database or API
    const allServers = [
      {
        id: "srv-01",
        name: "Weather API",
        description: "Provides real-time weather conditions and forecasts for global locations.",
        url: "https://weather.mcp.local/sse",
      },
      {
        id: "srv-02",
        name: "PostgreSQL Connector",
        description: "Read-only interface to query the main analytics database.",
        url: "https://db.mcp.local/sse",
      },
      {
        id: "srv-03",
        name: "GitHub Integration",
        description: "Manage issues, PRs, and repository metadata directly from the chat.",
        url: "https://github.mcp.local/sse",
      },
      {
        id: "srv-04",
        name: "Local File System",
        description: "Access to local project files and logs for debugging purposes.",
        url: "http://localhost:8080/sse",
      },
      {
        id: "srv-05",
        name: "Jira Tracker",
        description: "Create and update Jira tickets, fetch sprint status.",
        url: "https://jira.mcp.local/sse",
      },
    ];

    const query = (search ?? "").toLowerCase().trim();
    const filtered = query
      ? allServers.filter(
          (s) =>
            s.name.toLowerCase().includes(query) ||
            s.description.toLowerCase().includes(query)
        )
      : allServers;

    return widget({
      props: {
        initialServers: filtered,
      },
      output: object({
        message: `Found ${filtered.length} server(s)`,
        servers: filtered,
      }),
    });
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
    widget: {
      name: "widget",
      invoking: "Searching MCP Registry...",
      invoked: "MCP Registry results ready",
    },
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

      const payload = {
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
      };

      const resultCount = Array.isArray((body as { servers?: unknown[] })?.servers)
        ? (body as { servers: unknown[] }).servers.length
        : "unknown";

      return widget({
        props: {
          initialFilters: {
            cursor: cursor ?? "",
            include_deleted: include_deleted ?? "not_set",
            limit: normalizedLimit,
            search: search ?? "",
            updated_since: updated_since ?? "",
            version: version ?? "latest",
          },
          initialEndpoint: url.toString(),
          initialResponse: body,
        },
        output: object({
          message: `Retrieved ${resultCount} server entries from MCP Registry.`,
          ...payload,
        }),
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

// ─── Fruits data (from my-widget-server) ───
const fruits = [
  { fruit: "mango", color: "bg-[#FBF1E1] dark:bg-[#FBF1E1]/10" },
  { fruit: "pineapple", color: "bg-[#f8f0d9] dark:bg-[#f8f0d9]/10" },
  { fruit: "cherries", color: "bg-[#E2EDDC] dark:bg-[#E2EDDC]/10" },
  { fruit: "coconut", color: "bg-[#fbedd3] dark:bg-[#fbedd3]/10" },
  { fruit: "apricot", color: "bg-[#fee6ca] dark:bg-[#fee6ca]/10" },
  { fruit: "blueberry", color: "bg-[#e0e6e6] dark:bg-[#e0e6e6]/10" },
  { fruit: "grapes", color: "bg-[#f4ebe2] dark:bg-[#f4ebe2]/10" },
  { fruit: "watermelon", color: "bg-[#e6eddb] dark:bg-[#e6eddb]/10" },
  { fruit: "orange", color: "bg-[#fdebdf] dark:bg-[#fdebdf]/10" },
  { fruit: "avocado", color: "bg-[#ecefda] dark:bg-[#ecefda]/10" },
  { fruit: "apple", color: "bg-[#F9E7E4] dark:bg-[#F9E7E4]/10" },
  { fruit: "pear", color: "bg-[#f1f1cf] dark:bg-[#f1f1cf]/10" },
  { fruit: "plum", color: "bg-[#ece5ec] dark:bg-[#ece5ec]/10" },
  { fruit: "banana", color: "bg-[#fdf0dd] dark:bg-[#fdf0dd]/10" },
  { fruit: "strawberry", color: "bg-[#f7e6df] dark:bg-[#f7e6df]/10" },
  { fruit: "lemon", color: "bg-[#feeecd] dark:bg-[#feeecd]/10" },
];

// Register analyze-mcp-server tool
registerAnalyzeTool(server);

server.tool(
  {
    name: "search-tools",
    description: "Search for fruits and display the results in a visual widget",
    schema: z.object({
      query: z.string().optional().describe("Search query to filter fruits"),
    }),
    widget: {
      name: "product-search-result",
      invoking: "Searching...",
      invoked: "Results loaded",
    },
  },
  async ({ query }) => {
    const results = fruits.filter(
      (f) => !query || f.fruit.toLowerCase().includes(query.toLowerCase())
    );

    // emulate a delay to show the loading state
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return widget({
      props: { query: query ?? "", results },
      output: text(
        `Found ${results.length} fruits matching "${query ?? "all"}"`
      ),
    });
  }
);

server.tool(
  {
    name: "get-fruit-details",
    description: "Get detailed information about a specific fruit",
    schema: z.object({
      fruit: z.string().describe("The fruit name"),
    }),
    outputSchema: z.object({
      fruit: z.string(),
      color: z.string(),
      facts: z.array(z.string()),
    }),
  },
  async ({ fruit }) => {
    const found = fruits.find(
      (f) => f.fruit?.toLowerCase() === fruit?.toLowerCase()
    );
    return object({
      fruit: found?.fruit ?? fruit,
      color: found?.color ?? "unknown",
      facts: [
        `${fruit} is a delicious fruit`,
        `Color: ${found?.color ?? "unknown"}`,
      ],
    });
  }
);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
console.log(`Server running on port ${PORT}`);
// Start the server
server.listen(PORT);
