// [2] 장단점 분석 — [1]단계가 모아둔 최신 수집 결과를 바탕으로, 이 주제로 쇼츠를 만들었을 때의
// 장점(화제성/공감도/정보가치)과 단점(민감성/편향 우려/정보 신뢰도 낮음)을 항목화해서 사용자가
// 진행 여부를 판단할 수 있는 요약 리포트로 출력한다.
import { callClaudeJSON } from "../../core/claude.server";
import { getLatestRun } from "../1-data-collection/snapshotStore";
import { getLifecycleGroup } from "../1-data-collection/lifecycleGroups";

export interface ItemProsCons {
  title: string;
  sourceUrl: string;
  pros: string[];
  cons: string[];
}

export interface ProsConsReport {
  groupId: string;
  groupLabel: string;
  basedOnCollectedAt: string;
  items: ItemProsCons[];
  overallRecommendation: string;
}

const prosConsSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      description: "입력된 각 항목에 대한 장단점 분석 (입력 순서와 개수를 그대로 유지)",
      items: {
        type: "object",
        properties: {
          pros: { type: "array", items: { type: "string" }, description: "장점 (화제성, 공감도, 정보 가치 등) 1~3개" },
          cons: { type: "array", items: { type: "string" }, description: "단점 (민감성, 편향 우려, 정보 신뢰도 낮음 등) 0~3개, 없으면 빈 배열" },
        },
        required: ["pros", "cons"],
      },
    },
    overallRecommendation: {
      type: "string",
      description: "이 그룹 전체를 쇼츠 주제로 다루는 것에 대한 종합 의견 2~3문장 (진행 여부 판단에 참고할 요약)",
    },
  },
  required: ["items", "overallRecommendation"],
};

export async function analyzeProsCons(groupId: string): Promise<ProsConsReport> {
  const group = getLifecycleGroup(groupId);
  if (!group) throw new Error(`알 수 없는 생애주기 그룹입니다: ${groupId}`);

  const latestRun = getLatestRun(groupId);
  if (!latestRun || !latestRun.items.length) {
    throw new Error("이 그룹에 대해 먼저 [1]자료 수집을 실행해야 합니다 (수집된 항목이 없습니다).");
  }

  const itemList = latestRun.items
    .map((item, i) => `${i + 1}. ${item.title}\n   ${item.summary}\n   출처: ${item.sourceUrl}`)
    .join("\n\n");

  const analyzed = await callClaudeJSON(
    "당신은 쇼츠(숏폼) 영상 제작 여부를 판단하기 위한 콘텐츠 기획 분석가입니다. 화제성/공감도/정보가치는 장점으로, 민감성/편향 우려/정보 신뢰도 낮음은 단점으로 분류합니다.",
    `"${group.label}" 대상 정부 지원 정책 항목들입니다. 각 항목을 쇼츠 소재로 다룰 때의 장단점을 분석해주세요.\n\n${itemList}`,
    "analyze_pros_cons",
    prosConsSchema,
    { maxTokens: 2000 }
  );

  const analyzedItems: Array<{ pros: string[]; cons: string[] }> = Array.isArray(analyzed?.items) ? analyzed.items : [];

  const items: ItemProsCons[] = latestRun.items.map((item, i) => ({
    title: item.title,
    sourceUrl: item.sourceUrl,
    pros: analyzedItems[i]?.pros ?? [],
    cons: analyzedItems[i]?.cons ?? [],
  }));

  return {
    groupId,
    groupLabel: group.label,
    basedOnCollectedAt: latestRun.collectedAt,
    items,
    overallRecommendation: typeof analyzed?.overallRecommendation === "string" ? analyzed.overallRecommendation : "",
  };
}
