// 플랫폼별 정적 권장사항 — 정확한 알고리즘/정책 세부사항은 플랫폼이 수시로 바꾸므로, 여기 값은
// "일반적으로 통용되는 실무 가이드"이지 공식 스펙이 아니다. 배포 직전에는 각 플랫폼 최신 정책을
// 다시 확인할 것.
export interface PlatformSpec {
  id: string;
  label: string;
  recommendedDurationSec: [number, number];
  aspectRatio: string;
  subtitleStyleNote: string;
}

export const PLATFORM_SPECS: PlatformSpec[] = [
  {
    id: "youtube_shorts",
    label: "유튜브 쇼츠",
    recommendedDurationSec: [15, 60],
    aspectRatio: "9:16",
    subtitleStyleNote: "화면 중앙~하단 큰 글씨, 첫 문장은 영상 시작과 동시에 노출 권장",
  },
  {
    id: "tiktok",
    label: "틱톡",
    recommendedDurationSec: [15, 34],
    aspectRatio: "9:16",
    subtitleStyleNote: "트렌디한 폰트/애니메이션 자막 선호, 상단 UI(팔로우 버튼 등)와 겹치지 않게 여백 확보",
  },
  {
    id: "instagram_reels",
    label: "인스타그램 릴스",
    recommendedDurationSec: [15, 30],
    aspectRatio: "9:16",
    subtitleStyleNote: "하단 UI(캡션/좋아요 버튼)와 겹치지 않게 자막을 화면 중앙~중하단에 배치",
  },
];

export function getPlatformSpec(id: string): PlatformSpec | undefined {
  return PLATFORM_SPECS.find((p) => p.id === id);
}
