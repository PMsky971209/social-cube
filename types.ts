/**
 * 社交魔方 — Person / Session / Claim (cloud-first recall loop).
 * Source of truth for the pre-meeting brief is confirmed Claims only.
 */

export type ISODateTime = string;

export type RelationshipTemperature =
  | "cold"
  | "cool"
  | "neutral"
  | "warm"
  | "close";

export type SessionSource = "qwen_earbuds" | "upload" | "other";

export type SessionStatus =
  | "ingested"
  | "extracted"
  | "confirmed"
  | "archived";

export type ClaimType =
  | "commitment"
  | "stance"
  | "relationship_temperature"
  | "taboo";

export type ClaimOp = "add" | "update" | "retract";

export type ClaimStatus =
  | "proposed"
  | "accepted"
  | "edited"
  | "rejected"
  | "superseded";

export type ConfirmVia = "push" | "voice" | "app";

export type DecisionAction = "accept" | "edit" | "reject";

export type CommitmentOwner = "me" | "them" | "both";

// --- Entities ---

export interface Person {
  id: string;
  display_name: string;
  aliases: string[];
  /** Last user-confirmed temperature only; never auto-overwritten. */
  relationship_temperature?: RelationshipTemperature | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Session {
  id: string;
  started_at: ISODateTime;
  ended_at?: ISODateTime | null;
  source: SessionSource;
  /** Object-store URI or transcript document id. */
  transcript_ref: string;
  participant_person_ids: string[];
  status: SessionStatus;
  created_at: ISODateTime;
}

export interface ClaimEvidence {
  quote: string;
  t_start?: number | null;
  t_end?: number | null;
}

export interface CommitmentPayload {
  text: string;
  due_at?: ISODateTime | null;
  owner: CommitmentOwner;
}

export interface StancePayload {
  topic: string;
  position: string;
}

export interface RelationshipTemperaturePayload {
  value: RelationshipTemperature;
  note?: string | null;
}

export interface TabooPayload {
  topic: string;
  note?: string | null;
}

export type ClaimPayload =
  | CommitmentPayload
  | StancePayload
  | RelationshipTemperaturePayload
  | TabooPayload;

export interface Claim {
  id: string;
  person_id: string;
  session_id: string;
  type: ClaimType;
  op: ClaimOp;
  /** ≤40 chars; primary push copy. */
  summary: string;
  payload: ClaimPayload;
  evidence: ClaimEvidence;
  tags: string[];
  status: ClaimStatus;
  confidence?: number | null;
  replaces_claim_id?: string | null;
  confirmed_at?: ISODateTime | null;
  confirmed_via?: ConfirmVia | null;
  created_at: ISODateTime;
}

// --- Extraction (write proposed claims) ---

export interface ProposedClaimInput {
  person_id: string;
  type: ClaimType;
  op: ClaimOp;
  summary: string;
  payload: ClaimPayload;
  evidence: ClaimEvidence;
  tags?: string[];
  confidence?: number | null;
  replaces_claim_id?: string | null;
}

export interface CreateExtractionRequest {
  claims: ProposedClaimInput[];
}

export interface CreateExtractionResponse {
  session_id: string;
  claim_ids: string[];
  confirmation_id: string;
}

// --- Inbox confirmation (push-first) ---

export interface ConfirmationClaimView {
  claim_id: string;
  type: ClaimType;
  op: ClaimOp;
  summary: string;
  tags: string[];
  evidence_quote: string;
  payload: ClaimPayload;
}

export interface ConfirmationItem {
  confirmation_id: string;
  session_id: string;
  person: Pick<Person, "id" | "display_name">;
  claims: ConfirmationClaimView[];
}

export interface ListConfirmationsResponse {
  items: ConfirmationItem[];
}

export interface ClaimDecision {
  claim_id: string;
  action: DecisionAction;
  /** Tags the user kept; on accept/edit becomes Claim.tags. */
  selected_tags?: string[];
  /** Required when action === "edit". */
  patch?: {
    summary?: string;
    payload?: ClaimPayload;
    tags?: string[];
  };
}

export interface DecideConfirmationRequest {
  via: ConfirmVia;
  decisions: ClaimDecision[];
}

export interface DecideConfirmationResponse {
  person_id: string;
  applied: string[];
  rejected: string[];
  person_preview: {
    relationship_temperature?: RelationshipTemperature | null;
    open_commitments_count: number;
  };
}

// --- Pre-meeting brief (read model) ---

export interface BriefCommitment {
  claim_id: string;
  summary: string;
  due_at?: ISODateTime | null;
  owner: CommitmentOwner;
}

export interface BriefStance {
  claim_id: string;
  topic: string;
  position: string;
}

export interface BriefTaboo {
  claim_id: string;
  topic: string;
  note?: string | null;
}

export interface PersonBrief {
  person: Pick<Person, "id" | "display_name" | "relationship_temperature">;
  commitments: BriefCommitment[];
  stances: BriefStance[];
  taboos: BriefTaboo[];
  last_session_at?: ISODateTime | null;
}
