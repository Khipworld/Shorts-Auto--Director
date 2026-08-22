// Local, free, no-API-key photo-relevance pre-filter using CLIP (via @huggingface/transformers,
// runs the ONNX model directly in Node — no Python service, no external calls, no cost).
// Reused as-is from K-Street Evolution Director's clip.server.ts. Empirically, CLIP zero-shot
// classification separates real matches from wrong-place/wrong-subject photos very clearly
// (~0.99 vs <0.1) as long as the labels stay short single-concept phrases — a verbose
// "e.g. X, Y, Z" negative label confuses the text encoder and collapses that gap.
// `any`로 둔 이유: 클라이언트(React, DOM lib)와 같은 tsconfig를 쓰다 보니 @huggingface/
// transformers의 Pipeline 오버로드 유니언이 DOM 타입과 겹쳐 "union type too complex to
// represent" 컴파일 에러가 남 — 실제로도 결과를 바로 `as any[]`로 다루고 있어 엄격한 타입이
// 필요 없는 자리라 그대로 any로 우회.
let classifierPromise: Promise<any> | null = null;

function getClassifier(): Promise<any> {
  if (!classifierPromise) {
    classifierPromise = import("@huggingface/transformers").then(({ pipeline }) =>
      (pipeline as any)("zero-shot-image-classification", "Xenova/clip-vit-base-patch32")
    );
  }
  return classifierPromise;
}

// Returns a 0-1 confidence that the image matches `subject`/`context`, or null if CLIP
// couldn't score it (model/image load failure) — callers should treat null as "skip this
// check" rather than a rejection.
export async function scorePhotoRelevance(imageUrl: string, subject: string, context: string): Promise<number | null> {
  try {
    const classifier = await getClassifier();
    const labels = [`a photo of ${subject}, ${context}`, "an unrelated photo"];
    const output = await classifier(imageUrl, labels);
    const match = (output as any[]).find((o) => o.label === labels[0]);
    return typeof match?.score === "number" ? match.score : null;
  } catch {
    return null;
  }
}
