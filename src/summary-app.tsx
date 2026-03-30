import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@modelcontextprotocol/ext-apps";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DataType { name: string; type: string; }

interface StudySummaryData {
  studyId: string;
  name: string;
  description: string;
  cancerTypeId: string;
  totalSamples: number;
  sequencedSamples: number;
  cnaSamples: number;
  mrnaSamples: number;
  citation?: string;
  pmid?: string;
  dataTypes: DataType[];
  studyUrl: string;
}

// ─── Alteration type → color + label ─────────────────────────────────────────

const TYPE_META: Record<string, { color: string; label: string }> = {
  MUTATION_EXTENDED:      { color: "#008000", label: "Mutations" },
  COPY_NUMBER_ALTERATION: { color: "#FF0000", label: "Copy Number" },
  MRNA_EXPRESSION:        { color: "#6600CC", label: "mRNA Expression" },
  PROTEIN_LEVEL:          { color: "#FF8C00", label: "Protein" },
  STRUCTURAL_VARIANT:     { color: "#8B008B", label: "Fusions / SVs" },
  METHYLATION:            { color: "#005C99", label: "Methylation" },
};

function typeMeta(type: string) {
  return TYPE_META[type] ?? { color: "#888", label: type.replace(/_/g, " ") };
}

// ─── Coverage bar ─────────────────────────────────────────────────────────────

function Bar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#555", marginBottom: 3 }}>
        <span>{label}</span>
        <span>
          <strong>{count.toLocaleString()}</strong>
          <span style={{ color: "#999", marginLeft: 4 }}>({pct}%)</span>
        </span>
      </div>
      <div style={{ background: "#e8eaf0", borderRadius: 4, height: 7 }}>
        <div style={{ width: `${pct}%`, background: color, borderRadius: 4, height: 7, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

// ─── Main app ─────────────────────────────────────────────────────────────────

function StudySummaryApp() {
  const [data, setData] = useState<StudySummaryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const app = new App({ name: "Study Summary App", version: "0.1.0" });

    app.ontoolresult = (result) => {
      try {
        const text = result.content?.find((c: { type: string }) => c.type === "text");
        if (!text || text.type !== "text") throw new Error("No text content");
        setData(JSON.parse(text.text) as StudySummaryData);
        setLoading(false);
      } catch {
        setError("Failed to parse study data from server.");
        setLoading(false);
      }
    };

    app.connect().catch(() => {
      setError("Could not connect to MCP host.");
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div style={S.center}>
        <div style={S.spinner} />
        <p style={{ color: "#666", marginTop: 12, fontFamily: "sans-serif", fontSize: 13 }}>
          Fetching study data from cBioPortal…
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={S.center}>
        <p style={{ color: "#c00", fontFamily: "sans-serif" }}>⚠ {error ?? "No data received."}</p>
      </div>
    );
  }

  // Deduplicate molecular alteration types — a study can have multiple profiles of the same type
  const uniqueTypes = [...new Map(data.dataTypes.map((d) => [d.type, d])).values()];

  return (
    <div style={S.card}>
      {/* Header */}
      <div style={S.header}>
        <div style={{ flex: 1 }}>
          <h2 style={S.title}>{data.name}</h2>
          <div style={S.meta}>
            <span style={S.pill}>{data.studyId}</span>
            <span style={S.pill}>{data.cancerTypeId.toUpperCase()}</span>
            {data.citation && <span style={S.pill}>{data.citation}</span>}
            {data.pmid && (
              <a
                href={`https://pubmed.ncbi.nlm.nih.gov/${data.pmid}`}
                target="_blank" rel="noreferrer"
                style={{ ...S.pill, background: "#e8f0fe", color: "#2d6ecc", textDecoration: "none" }}
              >
                PubMed ↗
              </a>
            )}
          </div>
        </div>
        <a href={data.studyUrl} target="_blank" rel="noreferrer" style={S.openBtn}>
          Explore ↗
        </a>
      </div>

      {/* Description */}
      {data.description && (
        <p style={S.desc}>
          {data.description.length > 300 ? data.description.slice(0, 300) + "…" : data.description}
        </p>
      )}

      <hr style={{ border: "none", borderTop: "1px solid #eee", margin: "14px 0" }} />

      {/* Sample coverage */}
      <div style={S.section}>
        <h3 style={S.sectionTitle}>
          Data Coverage &nbsp;·&nbsp;
          <span style={{ color: "#2d6ecc", fontWeight: 700 }}>{data.totalSamples.toLocaleString()}</span>
          {" "}total samples
        </h3>
        {data.sequencedSamples > 0 && (
          <Bar label="Sequenced (mutations)" count={data.sequencedSamples} total={data.totalSamples} color="#008000" />
        )}
        {data.cnaSamples > 0 && (
          <Bar label="Copy Number (CNA)" count={data.cnaSamples} total={data.totalSamples} color="#FF0000" />
        )}
        {data.mrnaSamples > 0 && (
          <Bar label="mRNA Expression" count={data.mrnaSamples} total={data.totalSamples} color="#6600CC" />
        )}
      </div>

      {/* Data type badges */}
      <div style={S.section}>
        <h3 style={S.sectionTitle}>Available Molecular Data</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {uniqueTypes.map((dt) => {
            const { color, label } = typeMeta(dt.type);
            return (
              <div
                key={dt.type}
                style={{
                  fontSize: 12, padding: "4px 10px", borderRadius: 20, fontWeight: 600,
                  background: color + "18", color, border: `1px solid ${color}44`,
                }}
              >
                {label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  card: {
    fontFamily: "sans-serif", padding: "18px 22px", maxWidth: 580,
    background: "#fff", borderRadius: 12, boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
    margin: "12px auto",
  } as React.CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 8 } as React.CSSProperties,
  title: { margin: 0, fontSize: 18, fontWeight: 700, color: "#2d6ecc", lineHeight: 1.3 } as React.CSSProperties,
  meta: { display: "flex", flexWrap: "wrap" as const, gap: 6, marginTop: 6 },
  pill: {
    fontSize: 11, padding: "2px 8px", borderRadius: 12,
    background: "#f0f0f5", color: "#555", fontWeight: 500,
  } as React.CSSProperties,
  openBtn: {
    flexShrink: 0, fontSize: 12, background: "#2d6ecc", color: "#fff",
    padding: "6px 14px", borderRadius: 20, textDecoration: "none", fontWeight: 600,
    alignSelf: "flex-start",
  } as React.CSSProperties,
  desc: { margin: 0, fontSize: 13, color: "#555", lineHeight: 1.6 } as React.CSSProperties,
  section: { marginBottom: 16 } as React.CSSProperties,
  sectionTitle: {
    fontSize: 12, fontWeight: 600, color: "#777", margin: "0 0 10px",
    textTransform: "uppercase" as const, letterSpacing: 0.5,
  },
  center: { display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", height: "100vh" },
  spinner: {
    width: 32, height: 32, border: "4px solid #e0e0ef", borderTop: "4px solid #2d6ecc",
    borderRadius: "50%", animation: "spin 0.8s linear infinite",
  } as React.CSSProperties,
};

const style = document.createElement("style");
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(style);

// ─── Mount ────────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")!).render(<StudySummaryApp />);
