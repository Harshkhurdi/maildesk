"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type Generation,
  getAllGenerations,
  newId,
  saveGeneration,
} from "@/lib/ai-studio/storage/db";

interface ImageModel {
  id: string;
  name: string;
}

interface ImageApiResponse {
  data?: Array<{ b64_json?: string; url?: string; media_type?:string }>;
  images?: Array<{ b64_json?: string; url?: string; media_type?:string }>;
}

/**
 * Image-generation studio. Strictly gated to $0 models via /api/images:
 * when OpenRouter has no verified free image models the panel
 * says so — and activates automatically the moment one appears.
 */
export function ImagesView() {
  const [models, setModels] = useState<ImageModel[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState("1:1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<Generation[]>([]);

  useEffect(() => {
    getAllGenerations().then(setGallery).catch(err => setError(`Saved images could not be loaded: ${String(err)}`));
  }, []);

  const refreshModels = useCallback(() => {
    fetch("/api/ai/images")
      .then(async (r) => {const data=await r.json() as {models?:ImageModel[];error?:string};if(!r.ok)throw Error(data.error??"The image catalog is unavailable.");return data;})
      .then((j: { models?: ImageModel[] }) => {
        setModels(j.models ?? []);
        setLoaded(true);
      })
      .catch(e=>{setError(e.message);setLoaded(true);});
  }, []);

  useEffect(refreshModels, [refreshModels]);

  async function generate() {
    if (!prompt.trim() || busy || models.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: models[0].id, prompt, aspectRatio: ratio }),
      });
      const json = (await res.json()) as ImageApiResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const first = json.data?.[0] ?? json.images?.[0];
      const dataUrl = first?.b64_json
        ? `data:${first.media_type??"image/png"};base64,${first.b64_json}`
        : first?.url;
      if (!dataUrl) throw new Error("Response contained no image.");
      const gen: Generation = {
        id: newId(),
        prompt,
        model: models[0].id,
        dataUrl,
        createdAt: Date.now(),
      };
      await saveGeneration(gen);
      setGallery((prev) => [gen, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Images</h1>

      {error&&<p role="alert" className="mt-3 text-xs text-red-500">{error}</p>}
      {loaded && models.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-edge p-5 text-sm leading-relaxed text-ink-secondary">
          <p className="font-medium text-ink">No free image-generation models right now.</p>
          <p className="mt-1">
            No image model passed the free-price checks in the current catalog. This app is limited
            to zero-cost models only. The moment a free one appears in OpenRouter&apos;s live
            catalog, generation unlocks here automatically — nothing paid is ever listed or callable.
          </p>
          <p className="mt-2">
            Meanwhile, several free chat models can <em>understand</em> images — attach one in the Chat tab.
          </p>
        </div>
      ) : (
        <>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder={
              loaded && models.length > 0
                ? `Describe an image to generate with ${models[0].name}…`
                : "Loading free image models…"
            }
            disabled={busy || models.length === 0}
            className="mt-4 w-full resize-none rounded-2xl border border-edge bg-composer p-3.5 text-[15px] text-ink outline-none placeholder:text-ink-secondary focus:border-accent disabled:opacity-60"
          />
          <div className="mt-2 flex items-center gap-3">
            <select
              value={ratio}
              onChange={(e) => setRatio(e.target.value)}
              disabled={busy || models.length === 0}
              className="rounded-lg border border-edge bg-composer px-3 py-2 text-sm text-ink outline-none"
            >
              {["1:1", "16:9", "9:16", "4:3", "3:4"].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              onClick={generate}
              disabled={busy || !prompt.trim() || models.length === 0}
              className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40"
            >
              {busy ? "Generating…" : "Generate"}
            </button>
            {error && <span className="text-xs text-red-500">{error}</span>}
          </div>
        </>
      )}

      {gallery.length > 0 && (
        <>
          <p className="mt-8 pb-2 text-xs font-medium uppercase tracking-wide text-ink-secondary">
            Your generations (saved locally)
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {gallery.map((g) => (
              <figure key={g.id} className="overflow-hidden rounded-xl border border-edge">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.dataUrl} alt={g.prompt} className="aspect-square w-full object-cover" />
                <figcaption className="flex items-center justify-between gap-2 p-2 text-xs">
                  <span className="truncate text-ink-secondary" title={g.prompt}>
                    {g.prompt}
                  </span>
                  <a href={g.dataUrl} download={`image-${g.id}.png`} className="shrink-0 text-accent hover:underline">
                    Save
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
