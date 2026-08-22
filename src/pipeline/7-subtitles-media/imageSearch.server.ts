// Real-photo search + relevance verification, adapted from K-Street Evolution Director's
// server.ts (searchWikimediaPhoto/searchUnsplashPhoto/searchNaverImagePhoto/verifyPhotoRelevance).
// Generalized from that project's "region + era stage" framing to a plain "query + subject
// context" framing so any pipeline stage (not just era-stage videos) can ask for a verified
// real photo. Adds Pexels as a second stock-photo source alongside Unsplash (사용자 요청).
//
// Source order: Wikimedia Commons (free, no key, deep historical/non-Western coverage) ->
// Unsplash -> Pexels -> Naver (broadest, Korean-language safety net). Every candidate is
// checked by verifyPhotoRelevance before being accepted.
import { getEffectiveKey } from "../../../apiKeys.server";
import { fetchImageAsDataUrl, getClaudeImagePart } from "../../core/imageFetch.server";
import { callClaudeText } from "../../core/claude.server";
import { scorePhotoRelevance } from "./clipRelevance.server";

export interface PhotoResult {
  imageUrl: string;
  sourceUrl: string;
  photographer: string;
  source: string;
}
export type PhotoSearchOutcome = PhotoResult | { quotaError: true; billingUrl?: string } | null;

export async function searchWikimediaPhoto(query: string, opts: { perPage?: number; index?: number } = {}): Promise<PhotoResult | null> {
  const perPage = opts.perPage ?? 1;
  const index = opts.index ?? 0;
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: String(perPage),
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "1200",
    format: "json",
    origin: "*",
  });
  const url = `https://commons.wikimedia.org/w/api.php?${params.toString()}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "ShortsAutoDirector/1.0 (local dev; stock photo search)" } });
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    const list = Object.values(pages) as any[];
    if (!list.length) return null;
    const page = list[index % list.length];
    const info = page?.imageinfo?.[0];
    const imageUrl = info?.thumburl || info?.url;
    if (!imageUrl) return null;
    const rawArtist: string = info?.extmetadata?.Artist?.value || "";
    const photographer = rawArtist.replace(/<[^>]+>/g, "").trim() || "Wikimedia Commons";
    return { imageUrl, sourceUrl: info?.descriptionurl || url, photographer, source: "Wikimedia Commons" };
  } catch {
    return null;
  }
}

export async function searchUnsplashPhoto(
  query: string,
  accessKey: string,
  opts: { perPage?: number; index?: number } = {}
): Promise<PhotoSearchOutcome> {
  const perPage = opts.perPage ?? 1;
  const index = opts.index ?? 0;
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${accessKey}` } });
  if (!res.ok) {
    if (res.status === 403) return { quotaError: true, billingUrl: "https://unsplash.com/developers" };
    return null;
  }
  const data = await res.json();
  const results = data.results ?? [];
  if (!results.length) return null;
  const photo = results[index % results.length];
  if (!photo) return null;
  return { imageUrl: photo.urls?.regular || photo.urls?.small, sourceUrl: photo.links?.html, photographer: photo.user?.name || "Unknown", source: "Unsplash" };
}

export async function searchPexelsPhoto(
  query: string,
  apiKey: string,
  opts: { perPage?: number; index?: number } = {}
): Promise<PhotoSearchOutcome> {
  const perPage = opts.perPage ?? 1;
  const index = opts.index ?? 0;
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${Math.max(perPage, index + 1)}&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) {
    if (res.status === 429) return { quotaError: true, billingUrl: "https://www.pexels.com/api/" };
    return null;
  }
  const data = await res.json();
  const photos = data.photos ?? [];
  if (!photos.length) return null;
  const photo = photos[index % photos.length];
  if (!photo) return null;
  return {
    imageUrl: photo.src?.large2x || photo.src?.large || photo.src?.original,
    sourceUrl: photo.url,
    photographer: photo.photographer || "Pexels",
    source: "Pexels",
  };
}

// Naver's general web image index — a broader Korean-language safety net for whatever
// Wikimedia/Unsplash/Pexels don't have. Results come from arbitrary third-party sites that
// almost never send CORS headers, so the image is downloaded server-side and returned as a
// data: URI (fetchImageAsDataUrl) instead of a bare remote URL.
export async function searchNaverImagePhoto(
  query: string,
  clientId: string,
  clientSecret: string,
  opts: { perPage?: number; index?: number } = {}
): Promise<PhotoSearchOutcome> {
  const perPage = opts.perPage ?? 1;
  const index = opts.index ?? 0;
  const url = "https://naverapihub.apigw.ntruss.com/search/v1/image?" + new URLSearchParams({
    query,
    display: String(Math.max(perPage, index + 1)),
    sort: "sim",
  });
  const res = await fetch(url, { headers: { "X-NCP-APIGW-API-KEY-ID": clientId, "X-NCP-APIGW-API-KEY": clientSecret } });
  if (!res.ok) {
    if (res.status === 429) return { quotaError: true, billingUrl: "https://console.ncloud.com/billing" };
    return null;
  }
  const data = await res.json();
  const items = data.items ?? [];
  if (!items.length) return null;
  const item = items[index % items.length];
  if (!item?.link) return null;
  const dataUrl = await fetchImageAsDataUrl(item.link);
  if (!dataUrl) return null;
  return { imageUrl: dataUrl, sourceUrl: item.link, photographer: "Naver 이미지 검색", source: "Naver" };
}

// Two-stage relevance check: CLIP (free, local) decides the clear cases; only genuinely
// ambiguous scores fall through to a Claude vision call.
export async function verifyPhotoRelevance(imageUrl: string, subject: string, context: string): Promise<boolean> {
  const clipScore = await scorePhotoRelevance(imageUrl, subject, context);
  if (clipScore !== null) {
    if (clipScore >= 0.5) return true;
    if (clipScore <= 0.08) return false;
  }
  try {
    const imagePart = await getClaudeImagePart(imageUrl);
    if (!imagePart) return true;
    const text = await callClaudeText(
      "You are a strict but fair visual fact-checker for a stock-photo picker used in short-form video production. Answer with exactly one word: YES or NO.",
      [
        imagePart,
        {
          type: "text",
          text: `Could this photo plausibly represent "${subject}" (${context}) in a short video? Reject it (answer NO) only if it clearly depicts a different, identifiable subject or a completely unrelated scene. A generic or stylistically loose match is fine — only reject on a clear contradiction. Answer YES or NO only, nothing else.`,
        },
      ],
      { maxTokens: 5 }
    );
    return /^\s*yes/i.test(text);
  } catch {
    return true;
  }
}

// Runs the full Wikimedia -> Unsplash -> Pexels -> Naver fallback chain for one query and
// returns the first verified match, or null if nothing held up (caller should then fall back
// to AI-generated image / upload prompt, same as K-Street does).
export async function findVerifiedPhoto(query: string, subject: string, context: string): Promise<PhotoResult | { quotaError: true; billingUrl?: string } | null> {
  const { key: unsplashKey } = getEffectiveKey("unsplash");
  const { key: pexelsKey } = getEffectiveKey("pexels");
  const { key: naverClientId } = getEffectiveKey("naver_search_id");
  const { key: naverClientSecret } = getEffectiveKey("naver_search_secret");

  const wiki = await searchWikimediaPhoto(query);
  if (wiki && (await verifyPhotoRelevance(wiki.imageUrl, subject, context))) return wiki;

  if (unsplashKey) {
    const r = await searchUnsplashPhoto(query, unsplashKey);
    if (r && "quotaError" in r) return r;
    if (r && (await verifyPhotoRelevance(r.imageUrl, subject, context))) return r;
  }

  if (pexelsKey) {
    const r = await searchPexelsPhoto(query, pexelsKey);
    if (r && "quotaError" in r) return r;
    if (r && (await verifyPhotoRelevance(r.imageUrl, subject, context))) return r;
  }

  if (naverClientId && naverClientSecret) {
    const r = await searchNaverImagePhoto(query, naverClientId, naverClientSecret);
    if (r && "quotaError" in r) return r;
    if (r && (await verifyPhotoRelevance(r.imageUrl, subject, context))) return r;
  }

  return null;
}
