import { McpUseProvider, useCallTool, useWidget, type WidgetMetadata } from "mcp-use/react";
import React, { useState, useEffect, useMemo } from "react";
import { z } from "zod";
import { Server, ExternalLink, Search } from "lucide-react";

// 1. Define the schema for the widget props
const serverSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  url: z.string()
});

const propSchema = z.object({
  pulseEndpoint: z.string().optional().describe("The Pulse API endpoint URL"),
  initialServers: z.array(serverSchema).optional().describe("Initial list of MCP servers")
});

export const widgetMetadata: WidgetMetadata = {
  description: "Pulse MCP Servers Directory",
  props: propSchema,
  exposeAsTool: false,
  metadata: {
    csp: {
      connectDomains: ["https://api.pulse.local"],
      resourceDomains: [],
      scriptDirectives: ["'unsafe-eval'"],
    },
    prefersBorder: true,
    autoResize: true,
    widgetDescription: "Directory of available MCP Servers",
  },
  annotations: {
    readOnlyHint: true,
  },
};

type PulseProps = z.infer<typeof propSchema>;
type ServerData = z.infer<typeof serverSchema>;

type PulseToolInput = {
  search?: string;
};

type PulseToolResponse = {
  structuredContent?: {
    servers?: ServerData[];
  };
};

const PulseDashboard: React.FC = () => {
  const { props, isPending, theme } = useWidget<PulseProps>();
  const isDark = theme === "dark";

  const {
    callToolAsync,
    data,
    isPending: isSearching,
    isError,
    error,
  } = useCallTool<PulseToolInput, PulseToolResponse>("list-pulse-servers");

  const [searchQuery, setSearchQuery] = useState("");
  const [hasAutoFetched, setHasAutoFetched] = useState(false);

  // Use initialServers from props (provided by the backend tool), or fall back to tool response
  const serversFromTool = useMemo(
    () => data?.structuredContent?.servers ?? [],
    [data]
  );

  const servers: ServerData[] = useMemo(() => {
    // If we got data from a tool call, use that
    if (serversFromTool.length > 0) return serversFromTool;
    // Otherwise use initial props from the widget invocation
    if (props?.initialServers && props.initialServers.length > 0) return props.initialServers;
    return [];
  }, [serversFromTool, props?.initialServers]);

  // Auto-fetch on mount if no initial data was provided
  useEffect(() => {
    if (!isPending && !hasAutoFetched && (!props?.initialServers || props.initialServers.length === 0)) {
      setHasAutoFetched(true);
      void callToolAsync({});
    }
  }, [isPending, hasAutoFetched, props?.initialServers]);

  // Filter locally based on search query
  const filteredServers = useMemo(
    () =>
      servers.filter(
        (s) =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.description.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [servers, searchQuery]
  );

  const bgClass = isDark ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900";
  const cardClass = isDark ? "bg-gray-800 border-gray-700 hover:border-gray-600" : "bg-white border-gray-200 hover:border-gray-300";
  const borderClass = isDark ? "border-gray-700" : "border-gray-200";
  const textMutedClass = isDark ? "text-gray-400" : "text-gray-500";
  const inputClass = isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900 placeholder-gray-400";

  return (
    <McpUseProvider debugger viewControls autoSize>
      {isPending ? (
        <div className={`flex items-center justify-center p-12 rounded-xl border ${cardClass}`}>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <div className={`p-6 rounded-xl border ${bgClass} ${borderClass} font-sans max-w-5xl mx-auto`}>
          
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Server className="text-blue-500" />
                MCP Servers Directory
              </h1>
              <p className={`text-sm mt-1 ${textMutedClass}`}>
                Live data from the MCP server via <code>list-pulse-servers</code> tool
              </p>
            </div>
            
            <div className="relative w-full md:w-72">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={16} className={textMutedClass} />
              </div>
              <input
                type="text"
                placeholder="Search servers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${inputClass}`}
              />
            </div>
          </div>

          {/* Error state */}
          {isError && (
            <div className="mb-4 p-4 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700">
              Failed to load servers: {error instanceof Error ? error.message : "Unknown error"}
            </div>
          )}

          {/* Loading indicator */}
          {isSearching && (
            <div className={`mb-4 p-4 rounded-lg border text-center ${cardClass} ${textMutedClass}`}>
              Loading servers from MCP backend…
            </div>
          )}

          {/* Server Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredServers.length === 0 && !isSearching ? (
              <div className={`col-span-full p-12 text-center rounded-lg border ${cardClass} ${textMutedClass}`}>
                {searchQuery
                  ? `No servers found matching "${searchQuery}".`
                  : "No servers available."}
              </div>
            ) : (
              filteredServers.map((server) => (
                <div key={server.id} className={`p-5 rounded-lg border transition-all duration-200 shadow-sm ${cardClass} flex flex-col h-full`}>
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-lg font-semibold leading-tight">{server.name}</h3>
                    <div className={`p-1.5 rounded-md flex-shrink-0 ml-2 ${isDark ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                      <Server size={16} />
                    </div>
                  </div>
                  
                  <p className={`text-sm mb-5 flex-grow ${textMutedClass}`}>
                    {server.description}
                  </p>
                  
                  <div className={`pt-3 mt-auto border-t ${borderClass}`}>
                    <a 
                      href={server.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className={`text-xs flex items-center gap-1.5 hover:underline truncate ${isDark ? 'text-blue-400' : 'text-blue-600'}`}
                      title={server.url}
                    >
                      <ExternalLink size={14} className="flex-shrink-0" />
                      <span className="truncate">{server.url}</span>
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
      )}
    </McpUseProvider>
  );
};

export default PulseDashboard;
