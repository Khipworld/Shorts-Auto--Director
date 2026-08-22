// [5] 플랫폼별 후킹·SEO 분석 — 대상 플랫폼별로 초반 후킹 문구(복수안), 해시태그, 썸네일 문구를
// 각각 다르게 생성한다("동일 주제라도 플랫폼마다 다른 버전 제공" 요구사항).
//
// [3]단계에서 "unverified"로 분리된 항목은 여기서도 제외한다 — 검증 안 된 사실을 홍보 문구로
// 만들어 퍼뜨리면 안 되므로, 후킹 문구도 어느 정도 사실에 기반해야 한다는 원칙을 그대로 적용.
//
// 참고 — [[feedback-shorts-hook-editing]]: 이 문구 생성 자체는 화면 전환 속도와 무관하지만,
// 나중에 실제 영상 편집 단계에서 카드 전환 속도를 더 빠르게 하는 방향은 이미 한 번 거절된 적
// 있다는 것을 참고할 것 (문구/노출 순서 등 다른 축으로만 후킹을 개선).
import { callClaudeJSON } from "../../core/claude.server";
import { getLifecycleGroup } from "../1-data-collection/lifecycleGroups";
import { verifySourcesForGroup } from "../3-verification/verifySources.server";
import { PLATFORM_SPECS, getPlatformSpec, PlatformSpec } from "./platformSpecs";

export interface PlatformHookSeo {
  platformId: string;
  platformLabel: string;
  recommendedDurationSec: [number, number];
  subtitleStyleNote: string;
  hooks: string[];
  hashtags: string[];
  thumbnailPhrases: string[];
}

export interface HookSeoReport {
  groupId: string;
  groupLabel: string;
  excludedUnverifiedCount: number;
  platforms: PlatformHookSeo[];
}

const hookSeoSchema = {
  type: "object",
  properties: {
    platforms: {
      type: "array",
      description: "요청받은 각 플랫폼에 대한 결과 (입력 순서와 개수를 그대로 유지)",
      items: {
        type: "object",
        properties: {
          hooks: { type: "array", items: { type: "string" }, description: "영상 시작 1~3초에 쓸 후킹 문구 3개 (서로 다른 접근)" },
          hashtags: { type: "array", items: { type: "string" }, description: "SEO용 해시태그 5~8개 (# 포함)" },
          thumbnailPhrases: { type: "array", items: { type: "string" }, description: "썸네일에 넣을 짧은 문구 2~3개" },
        },
        required: ["hooks", "hashtags", "thumbnailPhrases"],
      },
    },
  },
  required: ["platforms"],
};

export async function generateHookSeo(groupId: string, platformIds?: string[]): Promise<HookSeoReport> {
  const group = getLifecycleGroup(groupId);
  if (!group) throw new Error(`알 수 없는 생애주기 그룹입니다: ${groupId}`);

  const targetPlatforms: PlatformSpec[] = (platformIds?.length ? platformIds : PLATFORM_SPECS.map((p) => p.id))
    .map((id) => getPlatformSpec(id))
    .filter((p): p is PlatformSpec => !!p);
  if (!targetPlatforms.length) throw new Error("유효한 플랫폼이 없습니다.");

  const verification = await verifySourcesForGroup(groupId);
  const usable = verification.results.filter((r) => r.finalStatus !== "unverified");
  const excludedUnverifiedCount = verification.results.length - usable.length;
  if (!usable.length) {
    throw new Error("검증된(또는 재확인 필요로 표시된) 항목이 없어 후킹 문구를 생성할 수 없습니다. [3]검증 결과를 확인해주세요.");
  }

  const itemSummaries = usable.map((r) => `- ${r.title}`).join("\n");
  const platformPrompt = targetPlatforms.map((p, i) => `${i + 1}. ${p.label} (${p.id}) — 권장 길이 ${p.recommendedDurationSec[0]}~${p.recommendedDurationSec[1]}초`).join("\n");

  const result = await callClaudeJSON(
    "당신은 쇼츠(숏폼) 영상의 후킹 문구와 SEO 해시태그를 전문으로 다루는 콘텐츠 마케터입니다. 플랫폼마다 톤과 접근을 다르게 씁니다.",
    `"${group.label}" 대상의 다음 정부 지원 정책 항목들로 쇼츠를 만듭니다:\n${itemSummaries}\n\n아래 플랫폼별로 각각 다른 후킹 문구/해시태그/썸네일 문구를 만들어주세요:\n${platformPrompt}`,
    "generate_hook_seo",
    hookSeoSchema,
    { maxTokens: 2000 }
  );

  const platformResults: Array<{ hooks: string[]; hashtags: string[]; thumbnailPhrases: string[] }> = Array.isArray(result?.platforms) ? result.platforms : [];

  const platforms: PlatformHookSeo[] = targetPlatforms.map((spec, i) => ({
    platformId: spec.id,
    platformLabel: spec.label,
    recommendedDurationSec: spec.recommendedDurationSec,
    subtitleStyleNote: spec.subtitleStyleNote,
    hooks: platformResults[i]?.hooks ?? [],
    hashtags: platformResults[i]?.hashtags ?? [],
    thumbnailPhrases: platformResults[i]?.thumbnailPhrases ?? [],
  }));

  return {
    groupId,
    groupLabel: group.label,
    excludedUnverifiedCount,
    platforms,
  };
}
