import type {
  ClaimOp,
  ClaimType,
  CommitmentOwner,
  ProposedClaimInput,
  RelationshipTemperature,
} from "../types.ts";

const CLAIM_TYPES = new Set<ClaimType>([
  "commitment",
  "stance",
  "relationship_temperature",
  "taboo",
]);

const CLAIM_OPS = new Set<ClaimOp>(["add", "update", "retract"]);

const OWNERS = new Set<CommitmentOwner>(["me", "them", "both"]);

const TEMPS = new Set<RelationshipTemperature>([
  "cold",
  "cool",
  "neutral",
  "warm",
  "close",
]);

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clip(summary: string, max = 40): string {
  return summary.length <= max ? summary : summary.slice(0, max);
}

function normalizePayload(
  type: ClaimType,
  payload: unknown,
): ProposedClaimInput["payload"] | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;

  if (type === "commitment") {
    const text = asString(p.text);
    const owner = asString(p.owner) as CommitmentOwner | null;
    if (!text || !owner || !OWNERS.has(owner)) return null;
    return {
      text,
      due_at: asString(p.due_at) ?? null,
      owner,
    };
  }

  if (type === "stance") {
    const topic = asString(p.topic);
    const position = asString(p.position);
    if (!topic || !position) return null;
    return { topic, position };
  }

  if (type === "relationship_temperature") {
    const value = asString(p.value) as RelationshipTemperature | null;
    if (!value || !TEMPS.has(value)) return null;
    return { value, note: asString(p.note) ?? null };
  }

  const topic = asString(p.topic);
  if (!topic) return null;
  return { topic, note: asString(p.note) ?? null };
}

/** Coerce model JSON into ProposedClaimInput[]; drop invalid rows. */
export function normalizeProposedClaims(
  personId: string,
  raw: unknown,
): ProposedClaimInput[] {
  const list = Array.isArray(raw)
    ? raw
    : raw &&
        typeof raw === "object" &&
        Array.isArray((raw as { claims?: unknown }).claims)
      ? (raw as { claims: unknown[] }).claims
      : null;

  if (!list) return [];

  const out: ProposedClaimInput[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const type = asString(row.type) as ClaimType | null;
    const op = (asString(row.op) as ClaimOp | null) ?? "add";
    const summary = asString(row.summary);
    if (!type || !CLAIM_TYPES.has(type) || !CLAIM_OPS.has(op) || !summary) {
      continue;
    }

    const payload = normalizePayload(type, row.payload);
    if (!payload) continue;

    const evidenceObj =
      row.evidence && typeof row.evidence === "object"
        ? (row.evidence as Record<string, unknown>)
        : null;
    const quote = asString(evidenceObj?.quote) ?? asString(row.evidence_quote);
    if (!quote) continue;

    const tags = Array.isArray(row.tags)
      ? row.tags
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
      : [];

    const confidence =
      typeof row.confidence === "number" && Number.isFinite(row.confidence)
        ? Math.min(1, Math.max(0, row.confidence))
        : null;

    out.push({
      person_id: personId,
      type,
      op,
      summary: clip(summary),
      payload,
      evidence: {
        quote,
        t_start:
          typeof evidenceObj?.t_start === "number" ? evidenceObj.t_start : null,
        t_end: typeof evidenceObj?.t_end === "number" ? evidenceObj.t_end : null,
      },
      tags,
      confidence,
      replaces_claim_id: asString(row.replaces_claim_id),
    });
  }
  return out;
}
