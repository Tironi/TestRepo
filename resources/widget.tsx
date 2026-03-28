import { useEffect, useMemo, useState } from "react";
import {
  McpUseProvider,
  useCallTool,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";

const includeDeletedOptions = ["not_set", "false", "true"] as const;
const includeDeletedSchema = z.enum(includeDeletedOptions);

const filterSchema = z.object({
  cursor: z.string(),
  include_deleted: includeDeletedSchema,
  limit: z.number().int().min(1).max(100),
  search: z.string(),
  updated_since: z.string(),
  version: z.string(),
});

const widgetPropsSchema = z.object({
  initialFilters: filterSchema.partial().optional(),
  initialEndpoint: z.string().optional(),
  initialResponse: z.unknown().optional(),
});

type IncludeDeletedValue = z.infer<typeof includeDeletedSchema>;
type FilterState = z.infer<typeof filterSchema>;
type WidgetProps = z.infer<typeof widgetPropsSchema>;

type RegistryToolInput = {
  cursor?: string;
  include_deleted?: IncludeDeletedValue;
  limit?: number;
  search?: string;
  updated_since?: string;
  version?: string;
};

type RegistryStructuredContent = {
  endpoint?: string;
  request?: Record<string, unknown>;
  response?: unknown;
};

type RegistryToolResponse = {
  structuredContent?: RegistryStructuredContent;
};

const DEFAULT_FILTERS: FilterState = {
  cursor: "",
  include_deleted: "not_set",
  limit: 30,
  search: "",
  updated_since: "",
  version: "latest",
};

export const widgetMetadata: WidgetMetadata = {
  title: "MCP Registry Dashboard",
  description: "Interactive MCP Registry search dashboard with filter controls and paginated results.",
  props: widgetPropsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Preparing dashboard...",
    invoked: "Dashboard ready",
    prefersBorder: true,
    autoResize: true,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function extractServers(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload)) return [];

  const directKeys = ["servers", "items", "results"];
  for (const key of directKeys) {
    const list = asRecordArray(payload[key]);
    if (list.length > 0) return list;
  }

  const dataValue = payload.data;
  if (isRecord(dataValue)) {
    for (const key of directKeys) {
      const list = asRecordArray(dataValue[key]);
      if (list.length > 0) return list;
    }
  }

  return [];
}

function extractNextCursor(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;

  const value = payload.next_cursor ?? payload.nextCursor ?? payload.cursor;
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  const pagination = payload.pagination;
  if (isRecord(pagination)) {
    const paged = pagination.next_cursor ?? pagination.nextCursor;
    if (typeof paged === "string" && paged.trim()) {
      return paged;
    }
  }

  return undefined;
}

function readString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function readTags(record: Record<string, unknown>): string[] {
  const candidates = [record.tags, record.keywords, record.capabilities];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .slice(0, 4);
    }
  }
  return [];
}

function formatTimestamp(value: string | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function normalizeFilters(initial?: Partial<FilterState>): FilterState {
  return {
    cursor: initial?.cursor ?? DEFAULT_FILTERS.cursor,
    include_deleted: initial?.include_deleted ?? DEFAULT_FILTERS.include_deleted,
    limit: initial?.limit ?? DEFAULT_FILTERS.limit,
    search: initial?.search ?? DEFAULT_FILTERS.search,
    updated_since: initial?.updated_since ?? DEFAULT_FILTERS.updated_since,
    version: initial?.version ?? DEFAULT_FILTERS.version,
  };
}

function toToolInput(filters: FilterState): RegistryToolInput {
  const cursor = filters.cursor.trim();
  const search = filters.search.trim();
  const updated_since = filters.updated_since.trim();
  const version = filters.version.trim();

  return {
    cursor: cursor.length > 0 ? cursor : undefined,
    include_deleted: filters.include_deleted,
    limit: filters.limit,
    search: search.length > 0 ? search : undefined,
    updated_since: updated_since.length > 0 ? updated_since : undefined,
    version: version.length > 0 ? version : undefined,
  };
}

export default function Widget() {
  const theme = useWidgetTheme();
  const { props, isPending: widgetPending } = useWidget<WidgetProps>();

  const {
    callToolAsync,
    data,
    isPending: isSearching,
    isError,
    error,
  } = useCallTool<RegistryToolInput, RegistryToolResponse>("list-mcp-registry-servers");

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [isHydrated, setIsHydrated] = useState(false);
  const [hasAutoQueried, setHasAutoQueried] = useState(false);
  const [lastRequestAt, setLastRequestAt] = useState<string>("");

  useEffect(() => {
    if (!widgetPending && !isHydrated) {
      setFilters(normalizeFilters(props.initialFilters));
      setIsHydrated(true);
    }
  }, [widgetPending, isHydrated, props.initialFilters]);

  const palette = theme === "dark"
    ? {
        text: "#e8f4ff",
        muted: "#9eb4c8",
        border: "rgba(128, 170, 198, 0.28)",
        surface: "rgba(10, 23, 35, 0.84)",
        surfaceAlt: "rgba(17, 35, 50, 0.78)",
        accent: "#2cc8a6",
        accentSoft: "rgba(44, 200, 166, 0.2)",
        warning: "#ff9f4f",
        background: "linear-gradient(135deg, #05131f 0%, #14334a 48%, #091c2a 100%)",
        shadow: "0 18px 42px rgba(0, 0, 0, 0.35)",
      }
    : {
        text: "#162833",
        muted: "#536673",
        border: "rgba(31, 73, 89, 0.24)",
        surface: "rgba(255, 255, 255, 0.88)",
        surfaceAlt: "rgba(255, 255, 255, 0.74)",
        accent: "#0f8f79",
        accentSoft: "rgba(15, 143, 121, 0.16)",
        warning: "#d86f2d",
        background: "linear-gradient(135deg, #f7efe1 0%, #e6f4f2 52%, #f0f8f7 100%)",
        shadow: "0 18px 42px rgba(21, 52, 68, 0.16)",
      };

  const fallbackStructured: RegistryStructuredContent = {
    endpoint: props.initialEndpoint,
    response: props.initialResponse,
  };
  const structured = data?.structuredContent ?? fallbackStructured;
  const endpoint = structured?.endpoint;
  const responsePayload = structured?.response;

  const servers = useMemo(() => extractServers(responsePayload), [responsePayload]);
  const nextCursor = useMemo(() => extractNextCursor(responsePayload), [responsePayload]);

  const runSearch = async (nextFilters: FilterState) => {
    await callToolAsync(toToolInput(nextFilters));
    setLastRequestAt(new Date().toISOString());
  };

  useEffect(() => {
    const hasInitialPayload = props.initialResponse !== undefined;
    if (isHydrated && !hasAutoQueried && !hasInitialPayload) {
      setHasAutoQueried(true);
      void runSearch(filters);
    }
  }, [isHydrated, hasAutoQueried, filters, props.initialResponse]);

  if (widgetPending) {
    return (
      <McpUseProvider autoSize>
        <div
          style={{
            padding: 28,
            fontFamily: '"Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif',
            color: palette.text,
            background: palette.background,
            borderRadius: 18,
          }}
        >
          Loading MCP Registry dashboard...
        </div>
      </McpUseProvider>
    );
  }

  return (
    <McpUseProvider autoSize>
      <div
        style={{
          fontFamily: '"Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif',
          color: palette.text,
          background: palette.background,
          borderRadius: 18,
          border: `1px solid ${palette.border}`,
          boxShadow: palette.shadow,
          position: "relative",
          overflow: "hidden",
          padding: 18,
        }}
      >
        <style>{`
          @keyframes riseIn {
            from { opacity: 0; transform: translateY(14px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes shimmerPulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(15, 143, 121, 0.0); }
            50% { box-shadow: 0 0 0 7px rgba(15, 143, 121, 0.12); }
          }
          .registry-card {
            animation: riseIn 420ms ease-out both;
          }
        `}</style>

        <div
          style={{
            position: "absolute",
            width: 280,
            height: 280,
            borderRadius: "50%",
            background: palette.accentSoft,
            right: -120,
            top: -130,
            filter: "blur(6px)",
          }}
        />

        <header
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 14,
            position: "relative",
          }}
        >
          <div>
            <div
              style={{
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: palette.muted,
                fontSize: 12,
              }}
            >
              Registry Explorer
            </div>
            <h2 style={{ margin: "6px 0 0", fontSize: 28, lineHeight: 1.15 }}>
              MCP Server Dashboard
            </h2>
          </div>
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: `1px solid ${palette.border}`,
              background: palette.surfaceAlt,
              color: palette.muted,
              fontSize: 12,
            }}
          >
            Last request: {lastRequestAt ? formatTimestamp(lastRequestAt) : "Not yet"}
          </div>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch(filters);
          }}
          style={{
            background: palette.surface,
            border: `1px solid ${palette.border}`,
            borderRadius: 16,
            padding: 14,
            position: "relative",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 10,
            }}
          >
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: palette.muted }}>Search</span>
              <input
                type="text"
                value={filters.search}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, search: event.target.value }))
                }
                placeholder="filesystem"
                style={inputStyle(palette)}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: palette.muted }}>Version</span>
              <input
                type="text"
                value={filters.version}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, version: event.target.value }))
                }
                placeholder="latest"
                style={inputStyle(palette)}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: palette.muted }}>Limit</span>
              <input
                type="number"
                min={1}
                max={100}
                value={filters.limit}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  setFilters((prev) => ({
                    ...prev,
                    limit: Number.isFinite(parsed) ? parsed : DEFAULT_FILTERS.limit,
                  }));
                }}
                style={inputStyle(palette)}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: palette.muted }}>Include Deleted</span>
              <select
                value={filters.include_deleted}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    include_deleted: event.target.value as IncludeDeletedValue,
                  }))
                }
                style={inputStyle(palette)}
              >
                <option value="not_set">Not set</option>
                <option value="false">False</option>
                <option value="true">True</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: palette.muted }}>Updated Since (ISO)</span>
              <input
                type="text"
                value={filters.updated_since}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, updated_since: event.target.value }))
                }
                placeholder="2025-08-07T13:15:04.280Z"
                style={inputStyle(palette)}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: palette.muted }}>Cursor</span>
              <input
                type="text"
                value={filters.cursor}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, cursor: event.target.value }))
                }
                placeholder="server-cursor-123"
                style={inputStyle(palette)}
              />
            </label>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginTop: 12,
              alignItems: "center",
            }}
          >
            <button
              type="submit"
              disabled={isSearching}
              style={{
                ...buttonStyle(palette, true),
                animation: isSearching ? "shimmerPulse 1200ms ease-in-out infinite" : undefined,
              }}
            >
              {isSearching ? "Searching..." : "Search Servers"}
            </button>
            <button
              type="button"
              disabled={isSearching}
              style={buttonStyle(palette, false)}
              onClick={() => {
                const reset = { ...DEFAULT_FILTERS };
                setFilters(reset);
                void runSearch(reset);
              }}
            >
              Reset Filters
            </button>
            {nextCursor ? (
              <button
                type="button"
                disabled={isSearching}
                style={buttonStyle(palette, false)}
                onClick={() => {
                  const next = { ...filters, cursor: nextCursor };
                  setFilters(next);
                  void runSearch(next);
                }}
              >
                Load Next Page
              </button>
            ) : null}
          </div>
        </form>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <StatCard label="Matching Servers" value={String(servers.length)} palette={palette} />
          <StatCard
            label="Next Cursor"
            value={nextCursor ? "Available" : "None"}
            palette={palette}
          />
          <StatCard
            label="Active Search"
            value={filters.search.trim() || "(all)"}
            palette={palette}
          />
        </section>

        <div
          style={{
            marginBottom: 10,
            color: palette.muted,
            fontSize: 12,
            overflowWrap: "anywhere",
          }}
        >
          Endpoint: {endpoint ?? "-"}
        </div>

        {isError ? (
          <div
            style={{
              background: palette.surface,
              border: `1px solid ${palette.warning}`,
              borderRadius: 12,
              padding: 12,
              color: palette.warning,
              marginBottom: 10,
            }}
          >
            Search failed: {error instanceof Error ? error.message : "Unknown error"}
          </div>
        ) : null}

        {servers.length === 0 ? (
          <div
            style={{
              border: `1px dashed ${palette.border}`,
              borderRadius: 14,
              background: palette.surfaceAlt,
              color: palette.muted,
              padding: 18,
              textAlign: "center",
            }}
          >
            No servers returned for this filter set.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: 10,
            }}
          >
            {servers.map((server, index) => {
              const name =
                readString(server, ["name", "title", "id", "slug"]) ?? `Server ${index + 1}`;
              const description =
                readString(server, ["description", "summary", "short_description"]) ??
                "No description provided.";
              const version = readString(server, ["version", "latest_version", "latestVersion"]);
              const updated = readString(server, ["updated_at", "updatedAt", "last_updated"]);
              const tags = readTags(server);

              return (
                <article
                  key={`${name}-${index}`}
                  className="registry-card"
                  style={{
                    background: palette.surface,
                    border: `1px solid ${palette.border}`,
                    borderRadius: 14,
                    padding: 12,
                    boxShadow: palette.shadow,
                    animationDelay: `${Math.min(index * 35, 280)}ms`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      marginBottom: 8,
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: 17, lineHeight: 1.2 }}>{name}</h3>
                    <span
                      style={{
                        fontSize: 11,
                        color: palette.accent,
                        border: `1px solid ${palette.accent}`,
                        borderRadius: 999,
                        padding: "2px 8px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {version ?? "version n/a"}
                    </span>
                  </div>

                  <p
                    style={{
                      margin: "0 0 8px",
                      color: palette.muted,
                      fontSize: 13,
                      lineHeight: 1.45,
                    }}
                  >
                    {description}
                  </p>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {tags.length === 0
                      ? null
                      : tags.map((tag) => (
                          <span
                            key={tag}
                            style={{
                              fontSize: 11,
                              borderRadius: 999,
                              padding: "3px 8px",
                              background: palette.accentSoft,
                              color: palette.text,
                              border: `1px solid ${palette.border}`,
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                  </div>

                  <div style={{ fontSize: 11, color: palette.muted }}>
                    Updated: {formatTimestamp(updated)}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </McpUseProvider>
  );
}

type Palette = {
  text: string;
  muted: string;
  border: string;
  surface: string;
  surfaceAlt: string;
  accent: string;
  accentSoft: string;
  warning: string;
  background: string;
  shadow: string;
};

function inputStyle(palette: Palette) {
  return {
    width: "100%",
    borderRadius: 10,
    border: `1px solid ${palette.border}`,
    background: palette.surfaceAlt,
    color: palette.text,
    padding: "9px 11px",
    outline: "none",
    fontSize: 13,
  };
}

function buttonStyle(palette: Palette, primary: boolean) {
  return {
    borderRadius: 10,
    border: primary ? "none" : `1px solid ${palette.border}`,
    background: primary ? palette.accent : palette.surface,
    color: primary ? "#ffffff" : palette.text,
    padding: "9px 13px",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
  };
}

function StatCard({ label, value, palette }: { label: string; value: string; palette: Palette }) {
  return (
    <div
      style={{
        background: palette.surface,
        border: `1px solid ${palette.border}`,
        borderRadius: 12,
        padding: 12,
      }}
    >
      <div style={{ color: palette.muted, fontSize: 12 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, lineHeight: 1.15 }}>{value}</div>
    </div>
  );
}
