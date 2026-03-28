import { MCPServer, text, widget } from "mcp-use/server";
import { z } from "zod";

async function fetchReadme(
  owner: string,
  repo: string,
  headers: Record<string, string>
): Promise<string | null> {
  // GitHub has a dedicated README endpoint
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/readme`,
      { headers }
    );
    if (res.status === 200) {
      const data = await res.json();
      if (data.content) {
        return Buffer.from(data.content, "base64").toString("utf-8");
      }
    }
  } catch {
    // fall through
  }
  return null;
}

export function registerAnalyzeTool(server: MCPServer) {
  server.tool(
    {
      name: "analyze-mcp-server",
      description:
        "Analyze a GitHub repository to extract MCP server details, exposed tools, and health metrics",
      schema: z.object({
        repoUrl: z
          .string()
          .describe(
            "GitHub repository URL, e.g. https://github.com/owner/repo"
          ),
      }),
      widget: {
        name: "server-analysis",
        invoking: "Analyzing MCP server...",
        invoked: "Analysis complete",
      },
    },
    async ({ repoUrl }) => {
      const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\s#?]+)/);
      if (!match) {
        return widget({
          props: { error: "Invalid GitHub URL. Expected format: https://github.com/owner/repo" },
          output: text("Error: Invalid GitHub URL"),
        });
      }

      const owner = match[1];
      const repo = match[2].replace(/\.git$/, "");

      const ghHeaders: Record<string, string> = {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "mcp-analyze-server",
      };
      if (process.env.GITHUB_TOKEN) {
        ghHeaders["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
      }

      // Fetch repo metadata
      let repoMeta: any;
      try {
        const metaRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}`,
          { headers: ghHeaders }
        );
        if (metaRes.status === 404) {
          return widget({
            props: { error: `Repository ${owner}/${repo} not found. Check the URL and make sure the repo is public.` },
            output: text("Error: Repository not found"),
          });
        }
        if (metaRes.status === 403) {
          return widget({
            props: { error: "GitHub API rate limit exceeded. Set GITHUB_TOKEN in .env to increase limits." },
            output: text("Error: GitHub rate limit"),
          });
        }
        if (!metaRes.ok) {
          return widget({
            props: { error: `GitHub API error (${metaRes.status}).` },
            output: text(`Error: GitHub API ${metaRes.status}`),
          });
        }
        repoMeta = await metaRes.json();
      } catch (e: any) {
        return widget({
          props: { error: `Failed to reach GitHub API: ${e.message}` },
          output: text("Error: GitHub API unreachable"),
        });
      }

      // Fetch README
      const readme = await fetchReadme(owner, repo, ghHeaders);

      if (!readme) {
        return widget({
          props: { error: `No README found in ${owner}/${repo}.` },
          output: text("Error: No README found"),
        });
      }

      // Check Anthropic API key
      if (!process.env.ANTHROPIC_API_KEY) {
        return widget({
          props: { error: "ANTHROPIC_API_KEY not set. Add it to your .env file." },
          output: text("Error: ANTHROPIC_API_KEY not set"),
        });
      }

      // Analyze README with Claude
      let analysis: any;
      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            system:
              'Sei un analizzatore di MCP server. Analizza il README e rispondi SOLO con JSON valido, zero testo aggiuntivo, zero markdown, zero backtick. Estrai tutte le informazioni possibili sui tool esposti, le funzionalità, e il tipo di server. Struttura: {"tools":[{"name":string,"description":string,"inputParams":string[]}],"hasWidgets":boolean,"language":string,"complexity":"low"|"medium"|"high","summary":string,"mainUseCase":string}. Se non trovi tool specifici, deducili dalla descrizione del progetto. Se un campo non è determinabile, usa valori ragionevoli basati sul contesto.',
            messages: [
              {
                role: "user",
                content: `Analizza questo README di un MCP server e estrai i dettagli:\n\n${readme.slice(0, 3000)}`,
              },
            ],
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          return widget({
            props: { error: `Anthropic API error (${response.status}): ${errBody.slice(0, 200)}` },
            output: text(`Error: Anthropic API returned ${response.status}`),
          });
        }

        const claudeData = await response.json();

        if (!claudeData.content?.[0]?.text) {
          return widget({
            props: { error: `Unexpected API response: ${JSON.stringify(claudeData).slice(0, 200)}` },
            output: text("Error: Unexpected API response"),
          });
        }

        let rawText = claudeData.content[0].text.trim();
        // Strip markdown code fences if present
        rawText = rawText.replace(/^```json?\s*/i, "").replace(/\s*```$/, "");
        // Remove trailing commas before } or ]
        rawText = rawText.replace(/,\s*([\]}])/g, "$1");
        analysis = JSON.parse(rawText);
      } catch (e: any) {
        return widget({
          props: { error: `Failed to analyze: ${e.message}` },
          output: text("Error: Analysis failed"),
        });
      }

      return widget({
        props: {
          repoUrl,
          repoName: repo,
          owner,
          stars: repoMeta.stargazers_count,
          description: repoMeta.description,
          lastUpdated: repoMeta.pushed_at,
          openIssues: repoMeta.open_issues_count,
          analysis,
        },
        output: text(
          `Analyzed ${repo}: ${analysis.tools.length} tools found`
        ),
      });
    }
  );
}
