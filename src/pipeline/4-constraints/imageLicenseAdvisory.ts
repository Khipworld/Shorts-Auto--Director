// [7]단계 이미지 검색이 실제로 어떤 소스(Wikimedia/Unsplash/Pexels/Naver)에서 사진을 가져왔는지에
// 따라 저작권/초상권 위험이 다르다. [4]단계 시점엔 아직 이미지를 고르기 전이라 사전 안내로만
// 두고, 실제 이미지가 정해지는 [7]/[8]단계에서 이 표를 참고해 소스별로 다르게 처리해야 한다.
export interface LicenseAdvisory {
  source: string;
  copyrightNote: string;
  portraitRightRisk: "low" | "needs_manual_check";
}

export const IMAGE_LICENSE_ADVISORY: LicenseAdvisory[] = [
  {
    source: "Wikimedia Commons",
    copyrightNote: "파일별로 라이선스가 다름(CC-BY, CC-BY-SA, Public Domain 등) — 사용 전 해당 파일 페이지의 저작자 표시 요건 확인 필요",
    portraitRightRisk: "low",
  },
  {
    source: "Unsplash",
    copyrightNote: "Unsplash 라이선스 — 상업적 이용 가능, 저작자 표시는 의무는 아니나 권장",
    portraitRightRisk: "low",
  },
  {
    source: "Pexels",
    copyrightNote: "Pexels 라이선스 — 상업적 이용 가능, 저작자 표시 불필요",
    portraitRightRisk: "low",
  },
  {
    source: "Naver",
    copyrightNote: "임의의 제3자 웹사이트에서 가져온 이미지 — 저작권자·이용 조건이 확인되지 않음",
    portraitRightRisk: "needs_manual_check",
  },
];

export function getLicenseAdvisory(source: string): LicenseAdvisory | undefined {
  return IMAGE_LICENSE_ADVISORY.find((a) => a.source === source);
}
