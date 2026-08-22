// Shared image-fetch helpers — reused as-is from K-Street Evolution Director's server.ts.
// Resolves any data:/relative/remote image URL to raw bytes, for two purposes:
//  1) building a Claude vision content block (getClaudeImagePart)
//  2) proxying a non-CORS third-party image (e.g. Naver results) into a data: URI so the
//     browser can draw it into a <canvas> without a cross-origin failure.
export async function fetchImageAsBase64(imageUrl: string): Promise<{ mimeType: string; data: string } | null> {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("data:")) {
    const commaIndex = imageUrl.indexOf(",");
    if (commaIndex !== -1) {
      const mimePart = imageUrl.substring(0, commaIndex);
      const dataPart = imageUrl.substring(commaIndex + 1);
      const mimeMatch = mimePart.match(/data:(.*?);base64/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
      return { mimeType, data: dataPart };
    }
  }
  if (imageUrl.startsWith("blob:")) return null;

  try {
    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mimeType = res.headers.get("content-type") || "image/jpeg";
      return { mimeType, data: buffer.toString("base64") };
    }
  } catch (error) {
    console.error("Error fetching remote image:", error);
  }
  return null;
}

export async function getClaudeImagePart(imageUrl: string) {
  const img = await fetchImageAsBase64(imageUrl);
  if (!img) return null;
  return { type: "image", source: { type: "base64", media_type: img.mimeType, data: img.data } };
}

// Downloads an image and returns it as a data: URI so the browser never has to load it
// cross-origin. Caps size/time so one slow/huge third-party image can't hang or bloat a
// request — returns null on any failure, letting callers fall back to the next source.
export async function fetchImageAsDataUrl(url: string, maxBytes = 8 * 1024 * 1024): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) return null;
    return `data:${contentType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
