// Local, free, no-API-key photo-relevance pre-filter using CLIP (via @huggingface/transformers,
// runs the ONNX model directly in Node — no Python service, no external calls, no cost).
// Reused as-is from K-Street Evolution Director's clip.server.ts. Empirically, CLIP zero-shot
// classification separates real matches from wrong-place/wrong-subject photos very clearly
// (~0.99 vs <0.1) as long as the labels stay short single-concept phrases — a verbose
// "e.g. X, Y, Z" negative label confuses the text encoder and collapses that gap.
import type { ZeroShotImageClassificationPipeline } from "@huggingface/transformers";

let classifierPromise: Promise<ZeroShotImageClassificationPipeline> | null = null;

function getClassifier(): Promise<ZeroShotImageClassificationPipeline> {
  if (!classifierPromise) {
    classifierPromise = import("@huggingface/transformers").then(({ pipeline }) =>
      pipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch32")
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
