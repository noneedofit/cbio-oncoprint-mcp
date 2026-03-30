import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@modelcontextprotocol/ext-apps";

// ─── Types ────────────────────────────────────────────────────────────────────

type AlterationType =
  | "MUTATION_MISSENSE"
  | "MUTATION_TRUNCATING"
  | "AMPLIFICATION"
  | "DELETION"
  | "FUSION";

interface Alteration {
  gene: string;
  sample: string;
  type: AlterationType;
  detail: string;
}

interface OncoPrintData {
  genes: string[];
  samples: string[];
  alterations: Alteration[];
  frequencies: Record<string, number>;
  studyName: string;
  studyUrl?: string;
  isLiveData?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS: Record<AlterationType, string> = {
  MUTATION_MISSENSE: "#008000",
  MUTATION_TRUNCATING: "#000000",
  AMPLIFICATION: "#FF0000",
  DELETION: "#0000FF",
  FUSION: "#8B008B",
};

const LABELS: Record<AlterationType, string> = {
  MUTATION_MISSENSE: "Missense Mutation",
  MUTATION_TRUNCATING: "Truncating Mutation",
  AMPLIFICATION: "Amplification",
  DELETION: "Deep Deletion",
  FUSION: "Fusion",
};

const CELL_W = 14;
const CELL_H = 22;
const ROW_LABEL_W = 80;
const FREQ_W = 52;

// ─── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipInfo {
  gene: string;
  sample: string;
  type: AlterationType;
  detail: string;
  x: number;
  y: number;
}

// ─── OncoPrint Grid ───────────────────────────────────────────────────────────

function OncoPrintGrid({ data, sortByFreq }: { data: OncoPrintData; sortByFreq: boolean }) {
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

  // Build a fast lookup: gene+sample → alteration
  const altMap = new Map<string, Alteration>();
  data.alterations.forEach((a) => altMap.set(`${a.gene}::${a.sample}`, a));

  // Optionally sort samples so altered ones come first (classic OncoPrint ordering)
  const sortedSamples = sortByFreq
    ? [...data.samples].sort((a, b) => {
        const aAltered = data.genes.filter((g) => altMap.has(`${g}::${a}`)).length;
        const bAltered = data.genes.filter((g) => altMap.has(`${g}::${b}`)).length;
        return bAltered - aAltered;
      })
    : data.samples;

  const totalW = ROW_LABEL_W + FREQ_W + sortedSamples.length * CELL_W;
  const totalH = data.genes.length * CELL_H;

  return (
    <div style={{ position: "relative", overflowX: "auto" }}>
      <svg width={totalW} height={totalH}>
        {data.genes.map((gene, gi) => {
          const y = gi * CELL_H;
          const freq = data.frequencies[gene] ?? 0;

          return (
            <g key={gene}>
              {/* Gene label */}
              <text
                x={ROW_LABEL_W - 6}
                y={y + CELL_H / 2 + 4}
                textAnchor="end"
                fontSize={11}
                fontFamily="monospace"
                fontWeight="600"
                fill="#222"
              >
                {gene}
              </text>

              {/* Frequency badge */}
              <rect x={ROW_LABEL_W} y={y + 3} width={FREQ_W - 4} height={CELL_H - 6} rx={3} fill="#f0f0f0" />
              <text
                x={ROW_LABEL_W + (FREQ_W - 4) / 2}
                y={y + CELL_H / 2 + 4}
                textAnchor="middle"
                fontSize={10}
                fontFamily="sans-serif"
                fill="#555"
              >
                {freq}%
              </text>

              {/* Grey background row */}
              <rect
                x={ROW_LABEL_W + FREQ_W}
                y={y}
                width={sortedSamples.length * CELL_W}
                height={CELL_H}
                fill={gi % 2 === 0 ? "#f9f9f9" : "#f0f0f0"}
              />

              {/* Alteration cells */}
              {sortedSamples.map((sample, si) => {
                const alt = altMap.get(`${gene}::${sample}`);
                const cx = ROW_LABEL_W + FREQ_W + si * CELL_W;

                if (!alt) return null;

                // Missense & truncating render as thin vertical bars (classic OncoPrint style)
                const isMutation =
                  alt.type === "MUTATION_MISSENSE" || alt.type === "MUTATION_TRUNCATING";
                const barW = isMutation ? 4 : CELL_W - 2;
                const barH = isMutation ? CELL_H : Math.round(CELL_H * 0.45);
                const barX = cx + (CELL_W - barW) / 2;
                const barY = isMutation ? y : y + (CELL_H - barH) / 2;

                return (
                  <rect
                    key={sample}
                    x={barX}
                    y={barY}
                    width={barW}
                    height={barH}
                    fill={COLORS[alt.type]}
                    rx={isMutation ? 1 : 2}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={(e) =>
                      setTooltip({
                        gene,
                        sample,
                        type: alt.type,
                        detail: alt.detail,
                        x: e.clientX,
                        y: e.clientY,
                      })
                    }
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: tooltip.x + 12,
            top: tooltip.y - 10,
            background: "#1a1a2e",
            color: "#eee",
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: 12,
            fontFamily: "monospace",
            pointerEvents: "none",
            zIndex: 1000,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            maxWidth: 220,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4, color: COLORS[tooltip.type] }}>
            {LABELS[tooltip.type]}
          </div>
          <div>
            <span style={{ color: "#aaa" }}>Gene: </span>
            {tooltip.gene}
          </div>
          <div>
            <span style={{ color: "#aaa" }}>Sample: </span>
            {tooltip.sample}
          </div>
          <div>
            <span style={{ color: "#aaa" }}>Detail: </span>
            {tooltip.detail}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "10px 20px",
        marginBottom: 16,
        padding: "10px 14px",
        background: "#f7f7fb",
        borderRadius: 8,
        border: "1px solid #e0e0ef",
      }}
    >
      {(Object.entries(LABELS) as [AlterationType, string][]).map(([type, label]) => (
        <div key={type} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <div
            style={{
              width: type === "MUTATION_MISSENSE" || type === "MUTATION_TRUNCATING" ? 4 : 14,
              height: type === "MUTATION_MISSENSE" || type === "MUTATION_TRUNCATING" ? 18 : 10,
              background: COLORS[type],
              borderRadius: 2,
            }}
          />
          <span style={{ color: "#444", fontFamily: "sans-serif" }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

function OncoPrintApp() {
  const [data, setData] = useState<OncoPrintData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortByFreq, setSortByFreq] = useState(true);
  const [loading, setLoading] = useState(true);

  // Bidirectional: connect to host and receive the tool result
  useEffect(() => {
    const app = new App({ name: "OncoPrint App", version: "0.1.0" });

    app.ontoolresult = (result) => {
      try {
        const text = result.content?.find((c: { type: string }) => c.type === "text");
        if (!text || text.type !== "text") throw new Error("No text content in result");
        const parsed: OncoPrintData = JSON.parse(text.text);
        setData(parsed);
        setLoading(false);
      } catch (e) {
        setError("Failed to parse genomics data from server.");
        setLoading(false);
      }
    };

    app.connect().catch(() => {
      setError("Could not connect to MCP host.");
      setLoading(false);
    });
  }, []);

  // ── Fallback / loading states ──

  if (loading) {
    return (
      <div style={styles.center}>
        <div style={styles.spinner} />
        <p style={{ color: "#666", marginTop: 12, fontFamily: "sans-serif" }}>
          Connecting to cBioPortal MCP server…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.center}>
        <p style={{ color: "#c00", fontFamily: "sans-serif" }}>⚠ {error}</p>
      </div>
    );
  }

  if (!data) return null;

  const alteredCount = new Set(data.alterations.map((a) => a.sample)).size;
  const overallFreq = Math.round((alteredCount / data.samples.length) * 100);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h2 style={styles.title}>OncoPrint</h2>
              {data.isLiveData && (
                <span style={{ fontSize: 10, background: "#e8f5e9", color: "#2e7d32", padding: "2px 7px", borderRadius: 10, fontWeight: 600, border: "1px solid #a5d6a7" }}>
                  LIVE
                </span>
              )}
            </div>
            <p style={styles.subtitle}>
              {data.studyName}
              {data.studyUrl && (
                <a href={data.studyUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 8, fontSize: 11, color: "#2d6ecc" }}>Open ↗</a>
              )}
            </p>
          {data.samples.length} samples &nbsp;·&nbsp;{" "}
          <span style={{ color: "#e05" }}>{overallFreq}%</span> altered
        </div>
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        <label style={styles.toggle}>
          <input
            type="checkbox"
            checked={sortByFreq}
            onChange={(e) => setSortByFreq(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Sort samples by alteration frequency
        </label>
      </div>

      {/* Legend */}
      <Legend />

      {/* Column header: "Gene  Freq  samples →" */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: 4,
          paddingLeft: ROW_LABEL_W + FREQ_W,
        }}
      >
        <span style={{ fontSize: 10, color: "#888", fontFamily: "sans-serif", letterSpacing: 1 }}>
          ← samples ({data.samples.length}) →
        </span>
      </div>

      {/* Grid */}
      <OncoPrintGrid data={data} sortByFreq={sortByFreq} />
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  container: {
    fontFamily: "sans-serif",
    padding: "16px 20px",
    maxWidth: 860,
    background: "#fff",
    borderRadius: 12,
    boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
    margin: "12px auto",
  } as React.CSSProperties,
  header: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 14,
    borderBottom: "2px solid #2d6ecc",
    paddingBottom: 10,
  } as React.CSSProperties,
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: "#2d6ecc",
    letterSpacing: -0.5,
  } as React.CSSProperties,
  subtitle: {
    margin: "2px 0 0",
    fontSize: 12,
    color: "#666",
  } as React.CSSProperties,
  badge: {
    fontSize: 13,
    color: "#444",
    background: "#eef3fb",
    padding: "4px 10px",
    borderRadius: 20,
    fontWeight: 500,
  } as React.CSSProperties,
  controls: {
    marginBottom: 12,
    display: "flex",
    gap: 16,
  } as React.CSSProperties,
  toggle: {
    fontSize: 13,
    color: "#444",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
  } as React.CSSProperties,
  center: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
  } as React.CSSProperties,
  spinner: {
    width: 36,
    height: 36,
    border: "4px solid #e0e0ef",
    borderTop: "4px solid #2d6ecc",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  } as React.CSSProperties,
};

// Inject spinner animation globally
const style = document.createElement("style");
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(style);

// ─── Mount ────────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")!).render(<OncoPrintApp />);
