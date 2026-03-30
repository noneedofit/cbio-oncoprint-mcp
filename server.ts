import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";

const CBIO_API = "https://www.cbioportal.org/api";
const DIST_DIR = path.join(import.meta.dirname, "dist");

// ─── cBioPortal API helpers ───────────────────────────────────────────────────

async function cbioFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) throw new Error(`cBioPortal API ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

interface CbioGene { entrezGeneId: number; hugoGeneSymbol: string; }
interface CbioMutation { sampleId: string; entrezGeneId: number; mutationType: string; proteinChange: string; }
interface CbioStudy {
  studyId: string; name: string; description: string; cancerTypeId: string;
  allSampleCount: number; sequencedSampleCount: number; cnaSampleCount: number;
  mrnaRnaSeqV2SampleCount: number; citation: string; pmid: string;
}
interface CbioProfile { molecularProfileId: string; name: string; molecularAlterationType: string; datatype: string; }

type AlterationType = "MUTATION_MISSENSE" | "MUTATION_TRUNCATING" | "AMPLIFICATION" | "DELETION" | "FUSION";

function mapMutationType(raw: string): AlterationType {
  const t = raw.toLowerCase();
  if (t.includes("missense")) return "MUTATION_MISSENSE";
  if (t.includes("frameshift") || t.includes("nonsense") || t.includes("splice") || t.includes("translation_start")) return "MUTATION_TRUNCATING";
  if (t.includes("fusion") || t.includes("structural")) return "FUSION";
  return "MUTATION_MISSENSE";
}

// ─── OncoPrint: live mutations from cBioPortal REST API ──────────────────────

async function fetchOncoPrintData(genes: string[], studyId: string): Promise<object> {
  const mutProfileId = `${studyId}_mutations`;
  const sampleListId = `${studyId}_sequenced`;

  // Resolve Hugo symbols → Entrez IDs, validating genes against cBioPortal's gene DB
  const geneData = await cbioFetch<CbioGene[]>(
    `${CBIO_API}/genes/fetch?geneIdType=HUGO_GENE_SYMBOL`,
    { method: "POST", body: JSON.stringify(genes) }
  );
  if (geneData.length === 0) throw new Error("No matching genes found in cBioPortal.");

  const entrezIds = geneData.map((g) => g.entrezGeneId);
  const symbolMap = new Map(geneData.map((g) => [g.entrezGeneId, g.hugoGeneSymbol]));
  const resolvedGenes = geneData.map((g) => g.hugoGeneSymbol);

  // Fetch mutations — capped at 500 rows to stay within response-time budget
  const mutations = await cbioFetch<CbioMutation[]>(
    `${CBIO_API}/molecular-profiles/${mutProfileId}/mutations/fetch?pageSize=500`,
    { method: "POST", body: JSON.stringify({ sampleListId, entrezGeneIds: entrezIds }) }
  );

  // Show the first 40 distinct altered samples (mirrors cBioPortal's default OncoPrint view)
  const alteredSamples = [...new Set(mutations.map((m) => m.sampleId))].slice(0, 40);

  const alterations = mutations
    .filter((m) => alteredSamples.includes(m.sampleId))
    .map((m) => ({
      gene: symbolMap.get(m.entrezGeneId) ?? String(m.entrezGeneId),
      sample: m.sampleId,
      type: mapMutationType(m.mutationType),
      detail: m.proteinChange || m.mutationType,
    }));

  const freqMap: Record<string, number> = {};
  resolvedGenes.forEach((g) => {
    const altered = new Set(alterations.filter((a) => a.gene === g).map((a) => a.sample)).size;
    freqMap[g] = alteredSamples.length > 0 ? Math.round((altered / alteredSamples.length) * 100) : 0;
  });

  return {
    genes: resolvedGenes,
    samples: alteredSamples,
    alterations,
    frequencies: freqMap,
    studyName: `Breast Cancer (${studyId}) — Live Data from cBioPortal`,
    studyUrl: `https://www.cbioportal.org/study/summary?id=${studyId}`,
    isLiveData: true,
  };
}

// ─── Study Summary: metadata + molecular profile coverage ─────────────────────

async function fetchStudySummaryData(studyId: string): Promise<object> {
  const [study, profiles] = await Promise.all([
    cbioFetch<CbioStudy>(`${CBIO_API}/studies/${studyId}`),
    cbioFetch<CbioProfile[]>(`${CBIO_API}/studies/${studyId}/molecular-profiles`),
  ]);

  return {
    studyId: study.studyId,
    name: study.name,
    description: study.description,
    cancerTypeId: study.cancerTypeId,
    totalSamples: study.allSampleCount,
    sequencedSamples: study.sequencedSampleCount,
    cnaSamples: study.cnaSampleCount,
    mrnaSamples: study.mrnaRnaSeqV2SampleCount,
    citation: study.citation,
    pmid: study.pmid,
    dataTypes: profiles.map((p) => ({ name: p.name, type: p.molecularAlterationType })),
    studyUrl: `https://www.cbioportal.org/study/summary?id=${studyId}`,
  };
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

export function createServer(): McpServer {
  const server = new McpServer({
    name: "cBioPortal OncoPrint MCP App",
    version: "0.1.0",
  });

  // ── Tool 1: OncoPrint ─────────────────────────────────────────────────────
  const oncoPrintUri = "ui://oncoprint/mcp-app.html";

  registerAppTool(
    server,
    "show_oncoprint",
    {
      description:
        "Show an interactive OncoPrint for a set of genes in a cBioPortal study. " +
        "Fetches live mutation data and renders a sortable gene × sample alteration grid.",
      inputSchema: {
        genes: z
          .array(z.string()).min(1).max(8).default(["TP53", "KRAS", "EGFR"])
          .describe("Hugo gene symbols to visualize (max 8)"),
        studyId: z
          .string().default("brca_tcga")
          .describe("cBioPortal study ID (e.g. brca_tcga, luad_tcga, prad_tcga)"),
      },
      _meta: { ui: { resourceUri: oncoPrintUri } },
    },
    async ({ genes, studyId }: { genes: string[]; studyId: string }) => {
      const data = await fetchOncoPrintData(
        genes.map((g: string) => g.toUpperCase().trim()).slice(0, 8),
        studyId
      );
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
  );

  registerAppResource(
    server, "OncoPrint View", oncoPrintUri, {},
    async () => {
      const html = await fs.readFile(path.join(DIST_DIR, "mcp-app.html"), "utf-8");
      return { contents: [{ uri: oncoPrintUri, mimeType: RESOURCE_MIME_TYPE, text: html }] };
    }
  );

  // ── Tool 2: Study Summary ─────────────────────────────────────────────────
  const summaryUri = "ui://study-summary/summary-app.html";

  registerAppTool(
    server,
    "show_study_summary",
    {
      description:
        "Show an interactive summary card for any cBioPortal cancer study: name, description, " +
        "sample counts, available molecular data types, and a direct link to explore the cohort.",
      inputSchema: {
        studyId: z
          .string().default("brca_tcga")
          .describe("cBioPortal study ID (e.g. brca_tcga, luad_tcga, prad_tcga, msk_impact_2017)"),
      },
      _meta: { ui: { resourceUri: summaryUri } },
    },
    async ({ studyId }: { studyId: string }) => {
      const data = await fetchStudySummaryData(studyId);
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
  );

  registerAppResource(
    server, "Study Summary View", summaryUri, {},
    async () => {
      const html = await fs.readFile(path.join(DIST_DIR, "summary-app.html"), "utf-8");
      return { contents: [{ uri: summaryUri, mimeType: RESOURCE_MIME_TYPE, text: html }] };
    }
  );

  return server;
}
