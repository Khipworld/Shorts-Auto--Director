// [1] 자료 수집 — 주제(생애주기 그룹)에 대해 웹 검색으로 최소 3개 이상 출처를 모으고,
// 출처 URL·수집 시각을 저장한다.
//
// 실무 제약([[project-government-subsidy-content]]에서 확인됨): 정부24/고용노동부/행안부 등
// 공식 사이트는 robots.txt로 직접 스크래핑이 막혀 있음. 이 서버가 그 사이트를 직접 fetch하는
// 대신, Claude의 서버 실행형 웹 검색(web_search tool)에 맡겨 언론·공공 발표 보도 등 2차 출처
// 위주로 찾게 하고, 공식 도메인은 결과에 섞여 나오면 인용/신뢰도 표시 용도로만 쓴다.
import { callClaudeText, callClaudeJSON } from "../../core/claude.server";
import { classifySourceTrust, TrustTierDef } from "../3-verification/sourceTrustTiers";
import { diffAgainstHistoryAndSave, RawCollectedItem } from "./snapshotStore";
import { getLifecycleGroup } from "./lifecycleGroups";

export interface CollectedSource extends RawCollectedItem {
  trustTier: TrustTierDef["tier"];
  trustLabel: string;
  novelty: "new" | "changed" | "unchanged";
}

export interface CollectionResult {
  groupId: string;
  groupLabel: string;
  collectedAt: string;
  sources: CollectedSource[];
  distinctSourceCount: number;
  belowMinimumSources: boolean; // 요구서: 최소 3개 이상 서로 다른 출처 확보가 기본 기준
}

const extractionSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      description: "찾아낸 신규/변경 지원 정책 항목 목록",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "정책/지원사업 항목 제목 (한 줄)" },
          summary: { type: "string", description: "대상 조건, 지원 내용, 신청 방법을 담은 2~3문장 요약" },
          sourceUrl: { type: "string", description: "이 항목의 근거가 된 실제 출처 URL" },
        },
        required: ["title", "summary", "sourceUrl"],
      },
    },
  },
  required: ["items"],
};

export async function collectSourcesForGroup(groupId: string): Promise<CollectionResult> {
  const group = getLifecycleGroup(groupId);
  if (!group) throw new Error(`알 수 없는 생애주기 그룹입니다: ${groupId}`);

  // 1단계: 웹 검색으로 근거를 실제로 찾게 한다 (인용이 섞인 자유 텍스트로 받음).
  const groundedText = await callClaudeText(
    "당신은 대한민국 정부 지원 정책을 조사하는 리서처입니다. 반드시 실제 웹 검색 결과에 근거해서만 답하고, 각 항목마다 실제 출처 URL을 명시하세요. 확실하지 않은 내용은 포함하지 마세요.",
    `"${group.label}"(${group.searchHint}) 대상의 최근 신규 또는 변경된 정부 지원사업/정책을 조사해주세요. 정부24, 고용노동부, 행정안전부 등 공식 사이트는 직접 접근이 막혀 있을 수 있으니, 언론 보도나 복지로(bokjiro.go.kr)·정부 부처 보도자료를 인용한 뉴스 기사 등 2차 출처를 적극 활용하세요. 항목마다 제목, 대상/지원 내용/신청 방법 요약, 실제 출처 URL을 반드시 포함해서 답해주세요. 최소 3개 이상 서로 다른 출처에서 찾아주세요.`,
    { maxTokens: 3000, useWebSearch: true }
  );

  // 2단계: 위 자유 텍스트를 구조화된 항목 목록으로 정리 (검색은 이미 끝났으니 여기선 구조화만).
  const structured = await callClaudeJSON(
    "당신은 리서치 결과 텍스트를 정확한 JSON 항목으로 정리하는 데이터 정리 담당자입니다. 원문에 없는 내용을 추가하지 마세요.",
    `다음 조사 결과 텍스트에서 항목별로 제목/요약/출처 URL을 추출해 정리해주세요:\n\n"""${groundedText}"""`,
    "extract_items",
    extractionSchema,
    { maxTokens: 2000 }
  );

  const rawItems: RawCollectedItem[] = Array.isArray(structured?.items)
    ? structured.items.filter((i: any) => i?.title && i?.summary && i?.sourceUrl)
    : [];

  const tagged = diffAgainstHistoryAndSave(groupId, rawItems);

  const sources: CollectedSource[] = tagged.map((item) => {
    const tierDef = classifySourceTrust(item.sourceUrl);
    return { ...item, trustTier: tierDef.tier, trustLabel: tierDef.label };
  });

  const distinctSourceCount = new Set(sources.map((s) => s.sourceUrl)).size;

  return {
    groupId,
    groupLabel: group.label,
    collectedAt: new Date().toISOString(),
    sources,
    distinctSourceCount,
    belowMinimumSources: distinctSourceCount < 3,
  };
}
