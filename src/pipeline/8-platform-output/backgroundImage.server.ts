// 영상의 배경 이미지 하나를 고른다.
//
// 처음엔 실사진 검색(findVerifiedPhoto)을 먼저 시도했으나, 실제로 렌더링해보니("청년 지원금
// 총정리" 테스트) CLIP 관련성 점수는 통과해도 내용상 전혀 안 맞는 사진(수능 시험지, 광고
// 로고 등)이 배경으로 나오는 문제를 발견함 — "청년 지원 정책" 같은 추상적 정책 주제는애초에
// 매칭될 만한 실사진 자체가 없어서 생기는 문제(K-Street의 "인천 송도 시대별 사진"처럼 실제
// 장소 사진을 찾는 경우와 다름). 그래서 이 프로젝트(정부지원사업 카테고리)는 Pollinations.ai
// AI 일러스트를 기본으로 쓰고, 실사진은 이미지 소스가 실존 인물/장소를 다루는 카테고리가
// 추가되면 그때 다시 우선순위를 고려하기로 함.
const POLLINATIONS_TIMEOUT_MS = 30000;

export async function pickBackgroundImageDataUrl(subject: string, context: string): Promise<string> {
  const prompt = `A clean, modern flat-design illustration representing "${subject}: ${context}". Bright friendly colors, simple shapes, no text, no watermark, no photorealistic faces, vertical composition, suitable as a background for a Korean government policy explainer video.`;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1080&height=1920&nologo=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(POLLINATIONS_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`배경 이미지 생성에 실패했습니다 (HTTP ${res.status})`);
  const arrayBuffer = await res.arrayBuffer();
  const mimeType = res.headers.get("content-type") || "image/jpeg";
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}
