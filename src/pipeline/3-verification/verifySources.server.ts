// [3] 사실/신뢰성 검증 — [1]단계가 모아둔 항목들을 서로 교차 확인하고, 신뢰도 등급을 매기고,
// 검증되지 않은 정보는 "미검증"으로 분리한다.
//
// 요구사항([[project-government-subsidy-content]] + 원 기능요구서 49행)에 따라, 이 모듈은
// "검증했다"는 표시만 남기지 않는다 — 각 항목이 왜 verified/unverified/needs_manual_check로
// 갈렸는지 decisionLog에 그대로 남겨서 사용자가 실제 판단 근거를 확인할 수 있게 한다.
import { callClaudeJSON } from "../../core/claude.server";
import { getLatestRun, RawCollectedItem } from "../1-data-collection/snapshotStore";
import { resolveScope } from "../0-category/scope";
import type { CategoryDef } from "../0-category/categories";
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

// 무엇을 "같은 것"으로 볼지는 카테고리마다 다르다 — 공공정보는 시행 주체가 다르면 별개
// 사업이고, 상품은 모델명이 다르면 별개 제품이다. categories.ts의 identityRule을 쓴다.
function buildCrossCheckSchema(itemNoun: string) {
  return {
    type: "object",
    properties: {
      clusters: {
        type: "array",
        description: `진짜로 동일한 ${itemNoun}을(를) 다루는 항목들끼리만 묶은 그룹 — 서로 다른 대상이면 유사해 보여도 별개이므로 묶지 않음. 겹치는 다른 항목이 없으면 이 배열에 포함시키지 않아도 됨.`,
        items: {
          type: "object",
          properties: {
            topic: { type: "string", description: "이 그룹이 다루는 대상 (짧게)" },
            itemIndexes: { type: "array", items: { type: "integer" }, description: `이 그룹에 속하는 항목의 1부터 시작하는 번호들 (2개 이상, 반드시 동일한 ${itemNoun}일 때만)` },
            consistent: { type: "boolean", description: "같은 대상을 다루는 이 항목들이 수치·조건 등 구체적인 내용까지 서로 일치하는가" },
            reasoning: { type: "string", description: "일치/불일치로 판단한 구체적 근거 (어떤 부분이 같거나 다른지)" },
          },
          required: ["topic", "itemIndexes", "consistent", "reasoning"],
        },
      },
    },
    required: ["clusters"],
  };
}

async function crossCheckItems(items: RawCollectedItem[], category: CategoryDef): Promise<ClusterInfo[]> {
  if (items.length < 2) return [];
  const itemList = items.map((item, i) => `${i + 1}. ${item.title}\n   ${item.summary}\n   출처: ${item.sourceUrl}`).join("\n\n");
  const { itemNoun, identityRule, verificationFocus } = category;
  const result = await callClaudeJSON(
    `당신은 여러 출처의 내용을 교차 확인하는 팩트체커입니다. ${identityRule} 그런 경우는 애초에 같은 그룹으로 묶지 마세요. 그룹으로 묶는 것은 정말로 동일한 대상을 서로 다른 출처가 설명하고 있을 때만입니다. consistent=false는 같은 대상인데 구체적인 수치나 조건이 서로 어긋날 때만 쓰고, 애초에 다른 대상이면 그룹 자체를 만들지 마세요.`,
    `다음 항목들 중 진짜로 동일한 ${itemNoun}을(를) 다루는 것들만 찾아 그룹으로 묶고, 그룹 내 내용이 일치하는지 확인해주세요. ${identityRule}\n\n주의: 서로 다른 주체가 각자 내놓은 별개의 것(예: A사 발표와 B사 발표)은 주제가 비슷해도 같은 것이 아닙니다. 둘 다 사실일 수 있으므로 묶지 말고, 묶어서 상충으로 처리하지 마세요. consistent=false 는 정말로 같은 하나를 두 출처가 서로 다르게 설명할 때만 씁니다.\n\n[이 분야에서 특히 확인할 점]\n${verificationFocus}\n\n${itemList}`,
    "cross_check",
    buildCrossCheckSchema(itemNoun),
    { maxTokens: 1500 }
  );
  return Array.isArray(result?.clusters) ? result.clusters : [];
}

// 같은 수집 회차라면 검증 결과는 항상 같다.
// [5]후킹과 [6]대본이 각각 이 함수를 다시 부르기 때문에, 캐시가 없으면 영상 하나 만들 때
// 똑같은 AI 교차확인이 세 번 나간다(그만큼 느리고 그만큼 돈이 든다).
// 수집을 다시 하면 collectedAt 이 바뀌므로 자동으로 새로 계산된다.
const verificationCache = new Map<string, { collectedAt: string; report: VerificationReport }>();

export async function verifySourcesForGroup(groupId: string): Promise<VerificationReport> {
  const scope = resolveScope(groupId);

  const latestRun = getLatestRun(groupId);
  if (!latestRun || !latestRun.items.length) {
    throw new Error("이 그룹에 대해 먼저 [1]자료 수집을 실행해야 합니다 (수집된 항목이 없습니다).");
  }

  const cached = verificationCache.get(groupId);
  if (cached && cached.collectedAt === latestRun.collectedAt) return cached.report;

  const clusters = await crossCheckItems(latestRun.items, scope.category);

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
      // 버릴지 사람에게 넘길지는 분야마다 다르다 — categories.ts의 soloSourcePolicy 참고.
      // 여행 후기나 생활 정보는 원래 출처가 하나뿐인 게 정상이라, 여기서 전부 버리면
      // 쓸 항목이 0개가 되어 대본 자체를 만들 수 없다.
      if (scope.category.soloSourcePolicy === "flag") {
        finalStatus = "needs_manual_check";
        decisionLog.push("판정: 신뢰도 낮은 단일 출처지만 이 분야는 단일 출처가 흔하므로, 버리지 않고 사람 확인 필요로 분리");
      } else {
        finalStatus = "unverified";
        decisionLog.push("판정: 신뢰도 낮은 단일 출처(4등급)이고 다른 출처의 뒷받침도 없어 미검증 처리");
      }
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

  const report: VerificationReport = {
    groupId,
    groupLabel: scope.label,
    basedOnCollectedAt: latestRun.collectedAt,
    results,
  };

  verificationCache.set(groupId, { collectedAt: latestRun.collectedAt, report });
  return report;
}
