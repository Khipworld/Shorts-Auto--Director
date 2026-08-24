// 채널 브랜드 설정.
//
// 매번 입력하기 번거로운 항목(채널명·로고·색상)은 여기에 한 번 정해두고 자동으로 적용한다.
// 사용자 지시(2026-08-24): "채널명은 hip world, 로고는 첨부 이미지, 브랜드 색상은 일단
// 알아서 고르고 나중에 편집할 수 있게(색상이 카테고리별로 달라질 수 있으니)".
//
// 색상은 로고에서 실제로 뽑았다 — 청록(바탕/헤드폰)과 주황(글자)이 로고의 두 축이다.
// 카테고리별로 다른 색을 쓰되 이 두 색과 어울리는 계열로 잡았고, 화면에서 고칠 수 있게
// 값으로 분리해 두었다.

export interface BrandTheme {
  /** 배경 그라데이션 위쪽(진한 쪽) */
  gradientTop: string;
  /** 배경 그라데이션 아래쪽(밝은 쪽) */
  gradientBottom: string;
  /** 카드 안 핵심 수치를 강조하는 색 */
  highlight: string;
}

export interface BrandSettings {
  channelName: string;
  /** 영상에 얹을 로고 (배경 투명 PNG). public/ 기준 경로 */
  logoPath: string;
  /** 로고를 영상에 표시할지 */
  showLogo: boolean;
  /** 카테고리별 색상 — 화면에서 고칠 수 있는 값 */
  themes: Record<string, BrandTheme>;
}

// 로고에서 뽑은 기준색
export const BRAND_TEAL = "#1F5F6E"; // 로고 바탕·헤드폰
export const BRAND_ORANGE = "#E8811F"; // 로고 글자
export const BRAND_GOLD = "#E3C77A"; // 로고 테두리

// 카테고리별 기본 색상. 로고의 청록·주황과 부딪히지 않는 범위에서 카테고리를 구분한다.
// (지금은 6개 카테고리가 아직 없으므로, 기존 생애주기 그룹과 카테고리 양쪽 키를 함께 둔다.)
export const DEFAULT_THEMES: Record<string, BrandTheme> = {
  // ── 카테고리 (전환 후 사용) ──
  public_info: { gradientTop: "#1F5F6E", gradientBottom: "#BFDDE0", highlight: "#E8811F" },
  product: { gradientTop: "#8C3B1E", gradientBottom: "#F2D2B8", highlight: "#1F5F6E" },
  place: { gradientTop: "#1E6B52", gradientBottom: "#C3E3D4", highlight: "#E8811F" },
  knowledge: { gradientTop: "#2C4A7A", gradientBottom: "#C6D4EA", highlight: "#E8811F" },
  trend: { gradientTop: "#6B2145", gradientBottom: "#EBC7D6", highlight: "#E3C77A" },
  etc: { gradientTop: "#3D4756", gradientBottom: "#D2D8E0", highlight: "#E8811F" },

  // ── 기존 생애주기 그룹 (전환 전까지 유지) ──
  pregnancy: { gradientTop: "#A83258", gradientBottom: "#F3C9D8", highlight: "#1F5F6E" },
  infant_child: { gradientTop: "#1F6E68", gradientBottom: "#C2E4E0", highlight: "#E8811F" },
  teen: { gradientTop: "#5A3A82", gradientBottom: "#DCCCEC", highlight: "#E8811F" },
  youth: { gradientTop: "#1F5F6E", gradientBottom: "#BFDDE0", highlight: "#E8811F" },
  middle_age: { gradientTop: "#9E5A1B", gradientBottom: "#F0D7B4", highlight: "#1F5F6E" },
  senior: { gradientTop: "#2A4A3C", gradientBottom: "#CBDCD1", highlight: "#E3C77A" },
};

export const DEFAULT_BRAND: BrandSettings = {
  channelName: "hip world",
  logoPath: "/brand/logo.png",
  showLogo: true,
  themes: DEFAULT_THEMES,
};

export function getBrandTheme(brand: BrandSettings, key: string): BrandTheme {
  return brand.themes[key] ?? brand.themes.etc ?? DEFAULT_THEMES.etc;
}
