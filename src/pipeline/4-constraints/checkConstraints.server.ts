// [4] 제약조건 파악 — 저작권/초상권/광고 표시 의무/미성년자 규제 등 플랫폼 정책 위반 소지 체크.
// 요구서에 따라 "시사/이슈" 계열 카테고리(정부지원사업·정책 안내 포함)는 명예훼손·정치적 편향
// 여부를 특화 체크리스트로 본다. 위반 소지가 있으면 진행 전 사용자에게 경고 표시해야 하므로,
// 자동으로 답을 낼 수 없는 항목(광고/협찬 표시 여부 등)은 "needs_review"로 남겨 사용자 확인을
// 요구하고, 임의로 통과시키지 않는다.
import { callClaudeJSON } from "../../core/claude.server";
import { getLatestRun } from "../1-data-collection/snapshotStore";
import { resolveScope } from "../0-category/scope";
import { IMAGE_LICENSE_ADVISORY } from "./imageLicenseAdvisory";

export type ConstraintStatus = "ok" | "needs_review" | "warning";

export interface ConstraintCheckItem {
  id: string;
  label: string;
  status: ConstraintStatus;
  detail: string;
}

export interface ConstraintReport {
  groupId: string;
  groupLabel: string;
  checks: ConstraintCheckItem[];
  hasBlockingIssue: boolean;
}

const neutralityCheckSchema = {
  type: "object",
  properties: {
    biased: { type: "boolean", description: "특정 정당/정치 세력을 일방적으로 홍보하거나 편향된 시각으로 서술하는지" },
    biasReasoning: { type: "string", description: "biased 판단 근거 (구체적으로 어떤 표현이 편향적인지, 없으면 '편향 소지 없음')" },
    defamationRisk: { type: "boolean", description: "특정 개인/단체에 대한 명예훼손 소지가 있는지" },
    defamationReasoning: { type: "string", description: "defamationRisk 판단 근거 (없으면 '명예훼손 소지 없음')" },
  },
  required: ["biased", "biasReasoning", "defamationRisk", "defamationReasoning"],
};

async function checkPoliticalNeutralityAndDefamation(itemSummaries: string): Promise<ConstraintCheckItem[]> {
  const result = await callClaudeJSON(
    "당신은 미디어 콘텐츠의 정치적 편향성과 명예훼손 소지를 검토하는 법무/편집 검수자입니다. 정부 정책을 사실 그대로 소개하는 것은 편향이 아니며, 특정 정당을 홍보하거나 반대로 비난하는 어조가 있을 때만 편향으로 판단하세요.",
    `다음은 쇼츠 영상 소재로 쓸 항목 요약들입니다. 정치적 편향, 명예훼손 소지를 검토해주세요.\n\n${itemSummaries}`,
    "check_neutrality",
    neutralityCheckSchema,
    { maxTokens: 800 }
  );

  return [
    {
      id: "political_bias",
      label: "정치적 편향 여부",
      status: result?.biased ? "warning" : "ok",
      detail: result?.biasReasoning || "확인 실패",
    },
    {
      id: "defamation",
      label: "명예훼손 소지",
      status: result?.defamationRisk ? "warning" : "ok",
      detail: result?.defamationReasoning || "확인 실패",
    },
  ];
}

function checkMinorDepiction(groupId: string): ConstraintCheckItem {
  const affectsMinors = groupId === "infant_child" || groupId === "teen";
  return {
    id: "minor_depiction",
    label: "미성년자 관련 규제",
    status: affectsMinors ? "needs_review" : "ok",
    detail: affectsMinors
      ? "이 그룹은 영유아·아동/청소년을 다룸 — 실제로 식별 가능한 미성년자 사진을 쓰면 보호자 동의가 필요하므로, [7]단계에서 스톡 사진(Unsplash/Pexels) 위주로 고르고 특정 개인이 식별되는 사진은 피할 것"
      : "이 그룹은 미성년자를 직접 다루지 않음",
  };
}

function checkAdDisclosure(isSponsoredContent?: boolean): ConstraintCheckItem {
  if (isSponsoredContent === undefined) {
    return {
      id: "ad_disclosure",
      label: "광고/협찬 표시 의무",
      status: "needs_review",
      detail: "이 콘텐츠가 정부/기관의 지원(협찬)을 받아 제작되는 것인지 확인이 필요합니다 — 그렇다면 표시광고법상 협찬 표시 문구를 영상에 넣어야 합니다.",
    };
  }
  return {
    id: "ad_disclosure",
    label: "광고/협찬 표시 의무",
    status: "ok",
    detail: isSponsoredContent
      ? "협찬 콘텐츠로 확인됨 — [8]단계 출력물에 '이 영상은 OO의 지원을 받아 제작되었습니다' 형태의 협찬 표시 문구를 반드시 포함할 것"
      : "협찬/광고 콘텐츠가 아닌 것으로 확인됨 — 별도 표시 의무 없음",
  };
}

/**
 * 표시광고법 — 상품·서비스 카테고리 전용.
 * 근거 없는 "최고/1위/유일" 같은 표현은 실제로 법 위반이 될 수 있어서
 * 수집된 내용에 그런 표현이 있으면 사람이 확인하도록 세운다.
 */
function checkFalseAdvertising(itemSummaries: string): ConstraintCheckItem {
  const risky = ["최고", "최상", "1위", "유일", "100%", "완벽", "무조건", "확실히"];
  const found = risky.filter((w) => itemSummaries.includes(w));
  return {
    id: "false_advertising",
    label: "표시광고법 · 과대광고",
    status: found.length ? "warning" : "needs_review",
    detail: found.length
      ? `수집된 내용에 근거가 필요한 표현이 있습니다: ${found.join(", ")} — 객관적 근거(시험 성적서, 공신력 있는 조사 등)가 없으면 표시광고법 위반이 될 수 있으므로 문구를 고치거나 근거를 명시하세요.`
      : "단정적 과장 표현은 발견되지 않았습니다. 다만 가격·성능 비교를 넣을 때는 비교 시점과 기준을 함께 밝히세요.",
  };
}

/** 초상권 — 여행·장소 카테고리 전용. 장소 사진에는 사람이 찍히기 쉽다. */
function checkPortraitRight(): ConstraintCheckItem {
  return {
    id: "portrait_right",
    label: "초상권",
    status: "needs_review",
    detail: "장소 사진에는 지나가는 사람이 함께 찍히는 경우가 많습니다 — 얼굴이 식별되는 사진은 피하거나 가려서 쓰세요. 매장 내부 촬영은 업주 동의가 필요할 수 있습니다.",
  };
}

/** 의료·법률·투자 등은 단정적으로 말하면 안 된다 — 지식·정보 카테고리 전용. */
function checkProfessionalAdvice(itemSummaries: string): ConstraintCheckItem {
  const fields = ["의료", "약", "치료", "진단", "법률", "소송", "투자", "주식", "세금", "보험"];
  const found = fields.filter((w) => itemSummaries.includes(w));
  return {
    id: "professional_advice",
    label: "전문분야 단정 주의",
    status: found.length ? "needs_review" : "ok",
    detail: found.length
      ? `${found.join(", ")} 관련 내용이 있습니다 — 개인에게 맞는 조언처럼 들리지 않도록 하고, "전문가 상담이 필요합니다" 같은 안내를 넣으세요.`
      : "전문 자격이 필요한 분야 내용은 발견되지 않았습니다.",
  };
}

function checkImageLicenseAdvisory(): ConstraintCheckItem {
  const naver = IMAGE_LICENSE_ADVISORY.find((a) => a.source === "Naver")!;
  return {
    id: "image_license",
    label: "저작권/초상권 사전 안내",
    status: "ok",
    detail: `[7]단계에서 이미지를 고를 때 출처별로 다르게 취급할 것 — Wikimedia/Unsplash/Pexels는 상업적 이용 가능. ${naver.source}: ${naver.copyrightNote} (초상권 확인 필요, portraitRightRisk=${naver.portraitRightRisk})`,
  };
}

export async function checkConstraints(groupId: string, opts: { isSponsoredContent?: boolean } = {}): Promise<ConstraintReport> {
  const scope = resolveScope(groupId);

  const latestRun = getLatestRun(groupId);
  if (!latestRun || !latestRun.items.length) {
    throw new Error("이 그룹에 대해 먼저 [1]자료 수집을 실행해야 합니다 (수집된 항목이 없습니다).");
  }
  const itemSummaries = latestRun.items.map((item) => `- ${item.title}: ${item.summary}`).join("\n");

  // 카테고리마다 봐야 할 항목이 다르다 — categories.ts의 constraintIds에 정의돼 있다.
  // 예: 상품·서비스는 표시광고법이 핵심이고, 여행·장소는 초상권이 중요하다.
  const wanted = new Set(scope.category.constraintIds);
  const checks: ConstraintCheckItem[] = [];

  // 정치편향·명예훼손은 AI 호출이 필요하므로 해당 카테고리일 때만 부른다(비용 절약).
  if (wanted.has("political_bias") || wanted.has("defamation")) {
    const neutralityChecks = await checkPoliticalNeutralityAndDefamation(itemSummaries);
    checks.push(...neutralityChecks.filter((c) => wanted.has(c.id)));
  }
  if (wanted.has("minor_depiction")) checks.push(checkMinorDepiction(groupId));
  if (wanted.has("ad_disclosure")) checks.push(checkAdDisclosure(opts.isSponsoredContent));
  if (wanted.has("false_advertising")) checks.push(checkFalseAdvertising(itemSummaries));
  if (wanted.has("portrait_right")) checks.push(checkPortraitRight());
  if (wanted.has("professional_advice")) checks.push(checkProfessionalAdvice(itemSummaries));
  if (wanted.has("image_license")) checks.push(checkImageLicenseAdvisory());

  return {
    groupId,
    groupLabel: scope.label,
    checks,
    hasBlockingIssue: checks.some((c) => c.status === "warning"),
  };
}
