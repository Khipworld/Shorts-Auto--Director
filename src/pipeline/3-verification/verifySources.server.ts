// [3] 사실/신뢰성 검증 — [1]단계가 모아둔 항목들을 서로 교차 확인하고, 신뢰도 등급을 매기고,
// 검증되지 않은 정보는 "미검증"으로 분리한다.
//
// 요구사항([[project-government-subsidy-content]] + 원 기능요구서 49행)에 따라, 이 모듈은
// "검증했다"는 표시만 남기지 않는다 — 각 항목이 왜 verified/unverified/needs_manual_check로
// 갈렸는지 decisionLog에 그대로 남겨서 사용자가 실제 판단 근거를 확인할 수 있게 한다.
import { callClaudeJSON } from "../../core/claude.server";
import { getLatestRun, RawCollectedItem } from "../1-data-collection/snapshotStore";
import { getLifecycleGroup } from "../1-data-collection/lifecycleGroups";
import { classifySourceTrust } from "./sourceTrustTiers";
import { detectAmounts } from "./detectAmounts";

export type VerificationStatus = "verified" | "unverified" | "needs_manual_check";

export interface VerificationResult {
  title: string;
  sourceUrl: string;
  trustTier: string;
  trustLabel: string;
  matchedAmounts: string[];
  corroboratedBy: string[];
  contradicted: boolean;
  finalStatus: VerificationStatus;
  decisionLog: string[];
}

export interface VerificationReport {
  groupId: string;
  groupLabel: string;
  basedOnCollectedAt: string;
  results: VerificationResult[];
}

interface ClusterInfo {
  topic: string;
  itemIndexes: number[];
  consistent: boolean;
  reasoning: string;
}

const crossCheckSchema = {
  type: "object",
  properties: {
    clusters: {
      type: "array",
      description: "서로 같은 정책/사실을 다루는 항목들끼리 묶은 그룹. 겹치는 다른 항목이 없으면 이 배열에 포함시키지 않아도 됨.",
      items: {
        type: "object",
        properties: {
          topic: { type: "string", description: "이 그룹이 다루는 정책/사실 (짧게)" },
          itemIndexes: { type: "array", items: { type: "integer" }, description: "이 그룹에 속하는 항목의 1부터 시작하는 번호들 (2개 이상)" },
          consistent: { type: "boolean", description: "이 그룹에 속한 항목들이 서로 내용(금액/대상/기간 등)이 일치하는가" },
          reasoning: { type: "string", description: "일치/불일치로 판단한 구체적 근거 (어떤 부분이 같거나 다른지)" },
        },
        required: ["topic", "itemIndexes", "consistent", "reasoning"],
      },
    },
  },
  required: ["clusters"],
};

async function crossCheckItems(items: RawCollectedItem[]): Promise<ClusterInfo[]> {
  if (items.length < 2) return [];
  const itemList = items.map((item, i) => `${i + 1}. ${item.title}\n   ${item.summary}\n   출처: ${item.sourceUrl}`).join("\n\n");
  const result = await callClaudeJSON(
    "당신은 여러 출처의 내용을 교차 확인하는 팩트체커입니다. 서로 다른 항목이 같은 정책/사실을 다루고 있는지, 다루고 있다면 금액·대상·기간 등 핵심 내용이 일치하는지 확인합니다.",
    `다음 항목들 중 서로 같은 정책/사실을 다루는 것들을 찾아 그룹으로 묶고, 그룹 내 내용이 일치하는지 확인해주세요.\n\n${itemList}`,
    "cross_check",
    crossCheckSchema,
    { maxTokens: 1500 }
  );
  return Array.isArray(result?.clusters) ? result.clusters : [];
}

export async function verifySourcesForGroup(groupId: string): Promise<VerificationReport> {
  const group = getLifecycleGroup(groupId);
  if (!group) throw new Error(`알 수 없는 생애주기 그룹입니다: ${groupId}`);

  const latestRun = getLatestRun(groupId);
  if (!latestRun || !latestRun.items.length) {
    throw new Error("이 그룹에 대해 먼저 [1]자료 수집을 실행해야 합니다 (수집된 항목이 없습니다).");
  }

  const clusters = await crossCheckItems(latestRun.items);

  const results: VerificationResult[] = latestRun.items.map((item, idx) => {
    const itemNumber = idx + 1;
    const cluster = clusters.find((c) => c.itemIndexes.includes(itemNumber) && c.itemIndexes.length > 1);
    const corroboratedBy = cluster
      ? cluster.itemIndexes.filter((n) => n !== itemNumber).map((n) => latestRun.items[n - 1]?.sourceUrl).filter(Boolean)
      : [];
    const contradicted = !!cluster && cluster.consistent === false;
    const matchedAmounts = detectAmounts(`${item.title} ${item.summary}`);
    const tierDef = classifySourceTrust(item.sourceUrl);

    const decisionLog: string[] = [`출처 신뢰도: ${tierDef.label}`];
    if (cluster) decisionLog.push(`교차 확인: "${cluster.topic}" 그룹 (${cluster.itemIndexes.length}개 출처) — ${cluster.reasoning}`);
    else decisionLog.push("교차 확인: 이 내용을 다루는 다른 출처를 찾지 못함 (단일 출처)");
    if (matchedAmounts.length) decisionLog.push(`금액/비율 감지: ${matchedAmounts.join(", ")} → 배포 전 원문 재확인 필요`);

    let finalStatus: VerificationStatus;
    if (contradicted) {
      finalStatus = "unverified";
      decisionLog.push("판정: 다른 출처와 내용이 상충하여 미검증 처리");
    } else if (matchedAmounts.length > 0) {
      finalStatus = "needs_manual_check";
      decisionLog.push("판정: 금액/비율이 포함되어 있어 자동 반영하지 않고 사람 재확인 필요로 분리");
    } else if (tierDef.tier === "unverified" && corroboratedBy.length === 0) {
      finalStatus = "unverified";
      decisionLog.push("판정: 신뢰도 낮은 단일 출처(4등급)이고 다른 출처의 뒷받침도 없어 미검증 처리");
    } else {
      finalStatus = "verified";
      decisionLog.push("판정: 검증됨 (신뢰도 등급 또는 교차 확인 통과)");
    }

    return {
      title: item.title,
      sourceUrl: item.sourceUrl,
      trustTier: tierDef.tier,
      trustLabel: tierDef.label,
      matchedAmounts,
      corroboratedBy,
      contradicted,
      finalStatus,
      decisionLog,
    };
  });

  return {
    groupId,
    groupLabel: group.label,
    basedOnCollectedAt: latestRun.collectedAt,
    results,
  };
}
