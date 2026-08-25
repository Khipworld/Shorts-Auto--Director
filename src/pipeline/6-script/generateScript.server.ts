// [6] 대본 생성 — [1]~[5] 분석 결과를 반영해 대본 초안을 생성한다. K-Street의 대본 생성
// 엔드포인트를 그대로 복사하지 않고([[project-shorts-auto-director]] 참고 — 이 프로젝트 주제에
// 맞는 프롬프트가 필요해서) core/claude.server.ts 헬퍼만 재사용해 새로 작성함.
//
// "미검증 정보가 대본에서 배제되었는지 자동 점검"(요구사항) — 입력 단계에서 [3]검증 결과 중
// unverified 항목을 아예 빼고 생성하지만, 그것만 믿지 않고 생성된 나레이션에 unverified 항목의
// 제목 단어가 상당 부분 등장하는지 별도로 다시 검사한다(checkUnverifiedLeakage).
import { callClaudeJSON } from "../../core/claude.server";
import { resolveScope } from "../0-category/scope";
import { verifySourcesForGroup } from "../3-verification/verifySources.server";
import { checkUnverifiedLeakage } from "../3-verification/unverifiedLeakCheck";
import { getPlatformSpec } from "../5-hook-seo/platformSpecs";

export interface ScriptResult {
  groupId: string;
  groupLabel: string;
  platformId: string;
  title: string;
  narration: string;
  estimatedDurationSec: number;
  sourceUrlsUsed: string[];
  unverifiedLeakCheck: { leaked: boolean; matches: string[] };
}

const scriptSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "영상 전체 제목 (한 줄, 핵심 혜택 강조)" },
    narration: { type: "string", description: "전체 나레이션 텍스트 (한국어, 한 문단)" },
  },
  required: ["title", "narration"],
};

// Korean narration speaks at roughly 4~5 characters per second — used only as a rough
// duration estimate for the subtitle-split stage that follows, not an exact spec.
const KOREAN_CHARS_PER_SEC = 4.5;

export async function generateScript(
  groupId: string,
  platformId: string,
  opts: { chosenHook?: string } = {}
): Promise<ScriptResult> {
  const scope = resolveScope(groupId);
  const platformSpec = getPlatformSpec(platformId);
  if (!platformSpec) throw new Error(`알 수 없는 플랫폼입니다: ${platformId}`);

  const verification = await verifySourcesForGroup(groupId);
  const usable = verification.results.filter((r) => r.finalStatus !== "unverified");
  const unverifiedItems = verification.results.filter((r) => r.finalStatus === "unverified");
  if (!usable.length) {
    throw new Error("검증된(또는 재확인 필요로 표시된) 항목이 없어 대본을 생성할 수 없습니다. [3]검증 결과를 확인해주세요.");
  }

  const [minDur, maxDur] = platformSpec.recommendedDurationSec;
  const targetDurationSec = Math.round((minDur + maxDur) / 2);
  const targetCharCount = Math.round(targetDurationSec * KOREAN_CHARS_PER_SEC);

  const itemList = usable.map((r) => `- ${r.title} (출처: ${r.sourceUrl})`).join("\n");
  const hookInstruction = opts.chosenHook
    ? `나레이션의 첫 문장은 반드시 다음 후킹 문구로 시작하세요: "${opts.chosenHook}"`
    : "나레이션은 시청자의 시선을 끄는 한 문장으로 시작하세요.";

  const currentYear = new Date().getFullYear();
  const result = await callClaudeJSON(
    `당신은 ${scope.category.summary}을(를) 알기 쉽게 설명하는 쇼츠(숏폼) 영상 작가입니다. 아래 제공된 항목에 없는 내용은 절대 추가하지 마세요. 과장이나 확정되지 않은 수치는 쓰지 마세요. 신뢰감 있고 친근한 정보 전달 톤을 씁니다. 오늘은 ${currentYear}년입니다 — 연도를 언급할 때는 항목에 실제로 나온 연도만 그대로 쓰고, 확인 안 된 연도(특히 ${currentYear - 1}년 등 지난 연도)를 습관적으로 쓰지 마세요.`,
    `"${scope.label}" 대상 쇼츠 영상 대본을 작성해주세요. ${hookInstruction}\n\n[사용 가능한 항목 — 이 내용만 근거로 쓸 것]\n${itemList}\n\n[요구사항]\n- 전체 나레이션은 한국어로 약 ${targetCharCount}자 내외(${targetDurationSec}초 분량)\n- 각 항목의 대상 조건과 신청 방법을 자연스럽게 풀어서 설명\n- 출처는 나레이션 안에 URL을 그대로 쓰지 말고 "정부 발표에 따르면" 같은 자연스러운 표현으로 처리`,
    "generate_script",
    scriptSchema,
    { maxTokens: 1500 }
  );

  const title: string = typeof result?.title === "string" ? result.title : `${scope.label} ${scope.category.bannerText}`;
  const narration: string = typeof result?.narration === "string" ? result.narration : "";

  return {
    groupId,
    groupLabel: scope.label,
    platformId,
    title,
    narration,
    estimatedDurationSec: Math.round(narration.length / KOREAN_CHARS_PER_SEC),
    sourceUrlsUsed: usable.map((r) => r.sourceUrl),
    unverifiedLeakCheck: checkUnverifiedLeakage(narration, unverifiedItems.map((r) => r.title)),
  };
}
