import type { ProposedClaimInput } from "../types.ts";
import type { ExtractInput } from "./extract.ts";
import { normalizeProposedClaims } from "./extract-validate.ts";

const DEFAULT_BASE =
  "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen-plus";

export class QwenExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QwenExtractError";
  }
}

function apiKey(): string | null {
  return (
    process.env.DASHSCOPE_API_KEY?.trim() ||
    process.env.SOCIAL_CUBE_QWEN_API_KEY?.trim() ||
    null
  );
}

export function hasQwenCredentials(): boolean {
  return Boolean(apiKey());
}

function buildPrompt(input: ExtractInput): { system: string; user: string } {
  const system = `你是「社交魔方」抽取器。根据一场对谈转写，只输出 JSON：
{"claims":[...]}
每条 claim 必须符合：
- type: commitment | stance | relationship_temperature | taboo
- op: add | update | retract（默认 add）
- summary: 不超过40字，可勾选短句
- payload: 按 type
  - commitment: {text, due_at|null, owner: me|them|both}
  - stance: {topic, position}
  - relationship_temperature: {value: cold|cool|neutral|warm|close, note?}
  - taboo: {topic, note?}
- evidence: {quote} 必须是转写里的原句片段
- tags: string[]
- confidence: 0~1
规则：只抽取关于对话对象的信息；不要编造；宁缺毋滥；不要输出性格长文；不要 markdown。`;

  const user = `对话对象：${input.person_display_name}（id=${input.person_id}）

转写：
"""
${input.transcript_text}
"""

请输出 JSON。`;

  return { system, user };
}

export async function extractClaimsQwen(
  input: ExtractInput,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<ProposedClaimInput[]> {
  const key = apiKey();
  if (!key) {
    throw new QwenExtractError(
      "Missing DASHSCOPE_API_KEY (or SOCIAL_CUBE_QWEN_API_KEY)",
    );
  }

  const base = (
    process.env.SOCIAL_CUBE_QWEN_BASE_URL?.trim() || DEFAULT_BASE
  ).replace(/\/$/, "");
  const model = process.env.SOCIAL_CUBE_QWEN_MODEL?.trim() || DEFAULT_MODEL;
  const { system, user } = buildPrompt(input);
  const fetchImpl = opts.fetchImpl ?? fetch;

  const res = await fetchImpl(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new QwenExtractError(
      `Qwen API ${res.status}: ${text.slice(0, 400)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
  } catch {
    throw new QwenExtractError("Qwen API returned non-JSON envelope");
  }

  const content = (parsed as {
    choices?: Array<{ message?: { content?: string } }>;
  }).choices?.[0]?.message?.content;
  if (!content) {
    throw new QwenExtractError("Qwen API returned empty content");
  }

  let body: unknown;
  try {
    body = JSON.parse(content);
  } catch {
    throw new QwenExtractError("Qwen content was not valid JSON");
  }

  const claims = normalizeProposedClaims(input.person_id, body);
  if (claims.length === 0) {
    throw new QwenExtractError("Qwen returned no valid claims");
  }
  return claims;
}
