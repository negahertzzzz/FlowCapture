import type { CostEstimate, GenerateDocumentationResult } from "@/lib/api";

const numberFormat = new Intl.NumberFormat("it-IT");

export function formatTokens(tokens: number): string {
  return numberFormat.format(Math.round(tokens));
}

export function formatUsd(amount: number): string {
  if (amount === 0) return "$0";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

/** Text shown in the confirmation dialog before starting a generation. */
export function describeCostEstimate(estimate: CostEstimate): string {
  const model = estimate.model ? ` (${estimate.model})` : "";
  const lines = [
    `Provider: ${estimate.provider_name}${model}`,
    `Richieste AI: ${estimate.llm_calls}`,
    `Token stimati: ~${formatTokens(estimate.input_tokens)} in ingresso, ~${formatTokens(estimate.output_tokens)} in uscita`,
  ];

  if (estimate.estimated_cost_usd !== null) {
    lines.push(`Costo stimato: ~${formatUsd(estimate.estimated_cost_usd)}`);
  } else {
    lines.push("Costo: prezzo del modello sconosciuto (impostalo in Impostazioni → provider).");
  }

  if (estimate.needs_transcription) {
    lines.push("L'audio verrà trascritto: la trascrizione ha un costo separato.");
  }

  lines.push(
    "",
    "La stima è indicativa: la lunghezza reale della guida e gli eventuali token di ragionamento del modello possono variare.",
  );
  return lines.join("\n");
}

/** Short summary of the tokens actually used by a completed generation. */
export function describeUsage(result: GenerateDocumentationResult): string {
  const { input_tokens, output_tokens } = result.usage;
  const cost = result.cost_usd !== null ? ` · costo ~${formatUsd(result.cost_usd)}` : "";
  const partial = result.unreported_calls > 0 ? " (conteggio parziale)" : "";
  return `Token usati: ${formatTokens(input_tokens)} in / ${formatTokens(output_tokens)} out${cost}${partial}`;
}
