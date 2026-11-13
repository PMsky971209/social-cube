import type { ProposedClaimInput } from "../types.ts";

export interface ExtractInput {
  person_id: string;
  person_display_name: string;
  transcript_text: string;
}

/**
 * Deterministic mock extractor — no API key.
 * Heuristics only; swap later for an LLM-backed implementation.
 */
export function extractClaimsMock(input: ExtractInput): ProposedClaimInput[] {
  const text = input.transcript_text;
  const claims: ProposedClaimInput[] = [];
  const personId = input.person_id;

  const commitMatch = text.match(/(.{0,12}(?:下周|明天|后天).{0,20}(?:发|给|交|送).{0,12})/);
  if (commitMatch) {
    const quote = commitMatch[1]!.trim();
    claims.push({
      person_id: personId,
      type: "commitment",
      op: "add",
      summary: "对方提到将交付材料",
      payload: {
        text: quote,
        due_at: null,
        owner: "them",
      },
      evidence: { quote },
      tags: ["承诺", "交付"],
      confidence: 0.7,
    });
  }

  if (/价格|报价|便宜|贵/.test(text)) {
    const quote =
      text.match(/(.{0,20}(?:价格|报价|便宜|贵).{0,20})/)?.[1]?.trim() ??
      "谈到价格";
    claims.push({
      person_id: personId,
      type: "stance",
      op: "add",
      summary: "对方对价格有明确态度",
      payload: {
        topic: "价格",
        position: /谨慎|再看|比两家|再考虑/.test(text)
          ? "偏谨慎"
          : "已谈及价格",
      },
      evidence: { quote },
      tags: ["价格"],
      confidence: 0.65,
    });
  }

  if (/挺顺|继续聊|合作愉快|老朋友/.test(text)) {
    const quote =
      text.match(/(.{0,16}(?:挺顺|继续聊|合作愉快|老朋友).{0,16})/)?.[1]?.trim() ??
      "语气偏熟络";
    claims.push({
      person_id: personId,
      type: "relationship_temperature",
      op: "add",
      summary: "关系温度偏暖",
      payload: { value: "warm", note: quote },
      evidence: { quote },
      tags: ["warm"],
      confidence: 0.6,
    });
  }

  if (/别提|不谈|换个话题|忌讳/.test(text)) {
    const quote =
      text.match(/(.{0,20}(?:别提|不谈|换个话题|忌讳).{0,20})/)?.[1]?.trim() ??
      "出现回避话题";
    claims.push({
      person_id: personId,
      type: "taboo",
      op: "add",
      summary: "出现忌讳/回避话题",
      payload: { topic: "敏感话题", note: quote },
      evidence: { quote },
      tags: ["忌讳"],
      confidence: 0.55,
    });
  }

  if (claims.length === 0) {
    claims.push({
      person_id: personId,
      type: "stance",
      op: "add",
      summary: "本场暂无高置信信号",
      payload: {
        topic: "整体",
        position: "需人工补充",
      },
      evidence: {
        quote: text.slice(0, 40) || "（空转写）",
      },
      tags: ["低置信"],
      confidence: 0.2,
    });
  }

  return claims;
}
