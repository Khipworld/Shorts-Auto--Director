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

/**
 * 모아온 자료가 전부 걸러졌을 때, 왜 그런지와 무엇을 하면 되는지 알려준다.
 * 이유별로 세어서 알려줘야 사용자가 주제를 바꿀지 기다릴지 판단할 수 있다.
 */
function describeAllFilteredOut(
  총건수: number,
  걸러진항목: { title: string; decisionLog?: string[] }[]
): string {
  const 이유 = { 단일출처: 0, 상충: 0, 기타: 0 };
  for (const item of 걸러진항목) {
    const log = (item.decisionLog ?? []).join(" ");
    if (log.includes("단일 출처")) 이유.단일출처 += 1;
    else if (log.includes("상충")) 이유.상충 += 1;
    else 이유.기타 += 1;
  }

  const 내역 = [
    이유.단일출처 ? `${이유.단일출처}건은 뒷받침해 주는 다른 출처를 찾지 못했고` : "",
    이유.상충 ? `${이유.상충}건은 출처끼리 내용이 어긋났으며` : "",
    이유.기타 ? `${이유.기타}건은 그 밖의 이유로 걸러졌습니다` : "",
  ].filter(Boolean).join(", ").replace(/,([^,]*)$/, "$1");

  return (
    `찾은 자료 ${총건수}건이 모두 확인되지 않아 대본을 만들 수 없습니다. ` +
    (내역 ? `(${내역}) ` : "") +
    "너무 최근 일이라 아직 여러 곳에서 다뤄지지 않았거나, 주제가 좁아 자료가 흩어져 있을 수 있습니다. " +
    "주제를 조금 더 넓게 바꾸거나 다른 낱말로 바꿔서 다시 시도해 보세요."
  );
}

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
    // 화면에는 [3]검증 단계가 따로 없으므로(백엔드 작업이라 감춰 뒀다),
    // "검증 결과를 확인하라"고만 하면 사용자가 할 수 있는 일이 없다. 이유와 다음 행동을 적는다.
    throw new Error(describeAllFilteredOut(verification.results.length, unverifiedItems));
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
    `"${scope.label}" 대상 쇼츠 영상 대본을 작성해주세요. ${hookInstruction}\n\n[사용 가능한 항목 — 이 내용만 근거로 쓸 것]\n${itemList}\n\n[요구사항]\n- 전체 나레이션은 한국어로 약 ${targetCharCount}자 내외(${targetDurationSec}초 분량)\n- ${scope.category.scriptGuidance}\n- 출처를 밝힐 때는 문장 맨 앞에 "${scope.category.attributionPhrase}," 처럼 한 번만 쓰세요. URL을 그대로 쓰지 말고, 같은 문장 끝에 "~전해졌습니다", "~알려졌습니다"를 덧붙여 이중으로 표현하지 마세요`,
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
    unverifiedLeakCheck: checkUnverifiedLeakage(
      narration,
      unverifiedItems.map((r) => r.title),
      usable.map((r) => r.title)
    ),
  };
}
