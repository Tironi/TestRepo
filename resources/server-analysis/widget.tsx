import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import React from "react";

export const widgetMetadata: WidgetMetadata = {
  description: "Display MCP server analysis results with tools, health metrics, and repository info",
  props: undefined,
  exposeAsTool: false,
  metadata: {
    prefersBorder: false,
    invoking: "Analyzing MCP server...",
    invoked: "Analysis complete",
  },
};

interface ToolInfo {
  name: string;
  description: string;
  inputParams: string[];
}

interface Analysis {
  tools: ToolInfo[];
  hasWidgets: boolean;
  language: string;
  complexity: "low" | "medium" | "high";
  summary: string;
  mainUseCase: string;
}

interface ServerAnalysisProps {
  error?: string;
  repoUrl?: string;
  repoName?: string;
  owner?: string;
  stars?: number;
  description?: string;
  lastUpdated?: string;
  openIssues?: number;
  analysis?: Analysis;
}

const ServerAnalysis: React.FC = () => {
  const { props, theme } = useWidget<ServerAnalysisProps>();
  const dark = theme === "dark";

  const bg = dark ? "#1a1a2e" : "#ffffff";
  const cardBg = dark ? "#16213e" : "#f8f9fa";
  const text = dark ? "#e0e0e0" : "#1a1a1a";
  const textSecondary = dark ? "#a0a0a0" : "#6b7280";
  const border = dark ? "#2a2a4a" : "#e5e7eb";
  const accent = dark ? "#4fc3f7" : "#2563eb";
  const errorColor = dark ? "#ff6b6b" : "#dc2626";

  const containerStyle: React.CSSProperties = {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    background: bg,
    color: text,
    borderRadius: "16px",
    border: `1px solid ${border}`,
    overflow: "hidden",
  };

  if (props.error) {
    return (
      <McpUseProvider>
        <div style={containerStyle}>
          <div style={{ padding: "24px", textAlign: "center" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>!</div>
            <p style={{ color: errorColor, fontSize: "14px", fontWeight: 600 }}>
              {props.error}
            </p>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const {
    repoName,
    owner,
    stars,
    description,
    lastUpdated,
    openIssues,
    analysis,
    repoUrl,
  } = props;

  const complexityColors: Record<string, { bg: string; text: string }> = {
    low: { bg: dark ? "#1b4332" : "#dcfce7", text: dark ? "#6ee7b7" : "#166534" },
    medium: { bg: dark ? "#451a03" : "#fff7ed", text: dark ? "#fdba74" : "#9a3412" },
    high: { bg: dark ? "#450a0a" : "#fef2f2", text: dark ? "#fca5a5" : "#991b1b" },
  };

  const daysSincePush = lastUpdated
    ? Math.floor((Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const maintenanceColor =
    daysSincePush !== null && daysSincePush < 90
      ? { bg: dark ? "#1b4332" : "#dcfce7", text: dark ? "#6ee7b7" : "#166534" }
      : daysSincePush !== null && daysSincePush < 365
        ? { bg: dark ? "#451a03" : "#fff7ed", text: dark ? "#fdba74" : "#9a3412" }
        : { bg: dark ? "#450a0a" : "#fef2f2", text: dark ? "#fca5a5" : "#991b1b" };

  const maintenanceLabel =
    daysSincePush !== null && daysSincePush < 90
      ? "Active"
      : daysSincePush !== null && daysSincePush < 365
        ? "Moderate"
        : "Stale";

  const badgeStyle = (colors: { bg: string; text: string }): React.CSSProperties => ({
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 600,
    background: colors.bg,
    color: colors.text,
  });

  const cardStyle: React.CSSProperties = {
    background: cardBg,
    borderRadius: "12px",
    padding: "16px",
    border: `1px solid ${border}`,
  };

  const complexity = analysis?.complexity ?? "low";
  const cColors = complexityColors[complexity] ?? complexityColors.low;

  return (
    <McpUseProvider>
      <div style={containerStyle}>
        {/* Header */}
        <div style={{ padding: "24px 24px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>
              {owner}/{repoName}
            </h2>
            <span style={badgeStyle(cColors)}>
              {complexity.toUpperCase()}
            </span>
            {analysis?.hasWidgets && (
              <span
                style={badgeStyle({
                  bg: dark ? "#1e3a5f" : "#dbeafe",
                  text: dark ? "#93c5fd" : "#1e40af",
                })}
              >
                Has Widgets
              </span>
            )}
            <span style={{ color: textSecondary, fontSize: "14px" }}>
              {stars ?? 0} stars
            </span>
            {repoUrl && (
              <a
                href={repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: accent,
                  fontSize: "13px",
                  textDecoration: "none",
                  marginLeft: "auto",
                }}
              >
                View on GitHub
              </a>
            )}
          </div>
          {description && (
            <p style={{ margin: "8px 0 0", color: textSecondary, fontSize: "14px" }}>
              {description}
            </p>
          )}
        </div>

        {/* Summary Box */}
        {analysis && (
          <div style={{ padding: "0 24px 16px" }}>
            <div style={cardStyle}>
              <p style={{ margin: "0 0 8px", fontSize: "14px", lineHeight: 1.5 }}>
                {analysis.summary}
              </p>
              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "13px", color: textSecondary }}>
                <span><strong>Use case:</strong> {analysis.mainUseCase}</span>
                <span><strong>Language:</strong> {analysis.language}</span>
                {lastUpdated && (
                  <span>
                    <strong>Last activity:</strong>{" "}
                    {new Date(lastUpdated).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tool Cards */}
        {analysis && analysis.tools.length > 0 && (
          <div style={{ padding: "0 24px 16px" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: "15px", fontWeight: 600 }}>
              Tools ({analysis.tools.length})
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {analysis.tools.map((tool) => (
                <div key={tool.name} style={cardStyle}>
                  <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "4px" }}>
                    {tool.name}
                  </div>
                  <div style={{ fontSize: "13px", color: textSecondary, marginBottom: "8px" }}>
                    {tool.description}
                  </div>
                  {tool.inputParams.length > 0 && (
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {tool.inputParams.map((param) => (
                        <span
                          key={param}
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 500,
                            background: dark ? "#2a2a4a" : "#e5e7eb",
                            color: textSecondary,
                            fontFamily: "monospace",
                          }}
                        >
                          {param}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Health Section */}
        <div style={{ padding: "0 24px 24px" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: "15px", fontWeight: 600 }}>
            Health
          </h3>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ ...cardStyle, flex: "1 1 120px", textAlign: "center", minWidth: "120px" }}>
              <div style={{ fontSize: "20px", fontWeight: 700 }}>{openIssues ?? 0}</div>
              <div style={{ fontSize: "12px", color: textSecondary }}>Open Issues</div>
            </div>
            <div style={{ ...cardStyle, flex: "1 1 120px", textAlign: "center", minWidth: "120px" }}>
              <div style={{ fontSize: "14px", fontWeight: 600 }}>
                {lastUpdated ? new Date(lastUpdated).toLocaleDateString() : "N/A"}
              </div>
              <div style={{ fontSize: "12px", color: textSecondary }}>Last Push</div>
            </div>
            <div style={{ ...cardStyle, flex: "1 1 120px", textAlign: "center", minWidth: "120px" }}>
              <span style={badgeStyle(maintenanceColor)}>{maintenanceLabel}</span>
              <div style={{ fontSize: "12px", color: textSecondary, marginTop: "4px" }}>
                Maintenance
              </div>
            </div>
          </div>
        </div>
      </div>
    </McpUseProvider>
  );
};

export default ServerAnalysis;
