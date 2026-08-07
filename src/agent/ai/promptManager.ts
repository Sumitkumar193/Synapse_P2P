import promptsData from './prompts.json';

interface DictionaryEntry {
  canonical: string;
  aliases: string[];
  fullForm?: string;
}

interface RawPromptsData {
  systemPrompts: {
    intentClassifier: string;
    technicalAssistant: string;
    behavioralFormattingRules: string;
    generalFormattingRules: string;
    technicalFormattingRules: string;
  };
}

export interface PromptsConfig {
  systemPrompts: {
    intentClassifier: string;
    technicalAssistant: string;
    behavioralFormattingRules: string;
    generalFormattingRules: string;
    technicalFormattingRules: string;
  };
  sttPrompts: {
    technicalVocabularyGuide: string;
  };
}

/**
 * Builds phoneme mapping string from the single-source-of-truth dictionary.
 * Output: "radish" or "red is" → "Redis", "rack" or "rag" → "RAG (Retrieval-Augmented Generation)"
 */
function buildPhonemeMapping(dictionary: DictionaryEntry[]): string {
  return dictionary
    .filter((e) => e.aliases.length > 0)
    .map((e) => {
      const target = e.fullForm ? `${e.canonical} (${e.fullForm})` : e.canonical;
      const aliasStr = e.aliases.map((a) => `"${a}"`).join(' or ');
      return `${aliasStr} → "${target}"`;
    })
    .join(', ');
}

/**
 * Builds STT vocabulary guide as a concise natural prompt.
 * Kept short (< 250 chars) to prevent Whisper prompt context overflow and repetition loop hallucinations.
 */
function buildSttVocabulary(dictionary: DictionaryEntry[]): string {
  const topTerms = dictionary.slice(0, 20).map((e) => e.canonical).join(', ');
  return `Technical interview dialogue covering ${topTerms}, system architecture, and core development.`;
}

// --- Assemble prompts at startup ---
const raw = promptsData as unknown as RawPromptsData;

import { dictionaries } from './speech';

// Load domain-specific dictionaries into a Map
export const dictionaryMap = new Map<string, DictionaryEntry[]>();
for (const [domain, entries] of Object.entries(dictionaries)) {
  dictionaryMap.set(domain, entries as DictionaryEntry[]);
}

// Combine all into a single array for phoneme mapping
const fullDictionary = Object.values(dictionaries).flat() as DictionaryEntry[];
const phonemeMapping = buildPhonemeMapping(fullDictionary);
const sttVocab = buildSttVocabulary(fullDictionary);

// Inject dictionary into prompt templates (single place, no duplication)
const intentClassifier = raw.systemPrompts.intentClassifier.replace('{{SPEECH_DICTIONARY}}', phonemeMapping);
const technicalAssistant = raw.systemPrompts.technicalAssistant.replace('{{SPEECH_DICTIONARY}}', phonemeMapping);

export const prompts: PromptsConfig = {
  systemPrompts: {
    intentClassifier,
    technicalAssistant,
    behavioralFormattingRules: raw.systemPrompts.behavioralFormattingRules,
    generalFormattingRules: raw.systemPrompts.generalFormattingRules,
    technicalFormattingRules: raw.systemPrompts.technicalFormattingRules,
  },
  sttPrompts: {
    technicalVocabularyGuide: sttVocab,
  },
};
