/**
 * AI is optional. Deterministic code decides permissions, payments, rankings, budgets
 * and hard dietary exclusions. AI may only rephrase explanations or parse free-text intent,
 * and every caller must work when AI is disabled.
 */
export type SearchIntent = {
  query: string;
  maxPriceCents?: number;
  categories?: string[];
  occasion?: string;
  partySize?: number;
};

export interface AiProvider {
  readonly id: "none" | "openai";
  parseSearchIntent(text: string): Promise<SearchIntent | null>;
  rephraseExplanation(lines: string[]): Promise<string[]>;
}

export const noAiProvider: AiProvider = {
  id: "none",
  async parseSearchIntent() {
    return null; // callers fall back to keyword + filter search
  },
  async rephraseExplanation(lines) {
    return lines;
  },
};
