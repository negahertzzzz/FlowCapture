import { useEffect, useState } from "react";

export const DEFAULT_DUPLICATE_SIMILARITY = 97;
export const MIN_DUPLICATE_SIMILARITY = 50;
export const DUPLICATE_SIMILARITY_SETTING = "duplicate_min_similarity";

export function clampSimilarity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DUPLICATE_SIMILARITY;
  return Math.min(100, Math.max(MIN_DUPLICATE_SIMILARITY, Math.round(value)));
}

/** Slider + number box for the minimum similarity (in %) two screenshots need to be duplicates. */
export function SimilarityThreshold({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  // Typed text is applied on blur / Enter, so "9" → "95" is not clamped to 50 halfway.
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const next = clampSimilarity(Number(draft));
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <label
      className="similarity-threshold"
      title="Somiglianza minima perché due screenshot siano considerati duplicati: più è alta, più devono essere identici"
    >
      <span>Somiglianza ≥</span>
      <input
        type="range"
        min={MIN_DUPLICATE_SIMILARITY}
        max={100}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(clampSimilarity(Number(event.target.value)))}
      />
      <input
        type="number"
        className="similarity-threshold-number"
        min={MIN_DUPLICATE_SIMILARITY}
        max={100}
        step={1}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
      <span>%</span>
    </label>
  );
}
