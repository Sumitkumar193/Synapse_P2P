import promptsData from './prompts.json';

interface DictionaryEntry {
  canonical: string;
  aliases: string[];
  fullForm?: string;
}

interface RawPromptsData {
  technicalDictionary: DictionaryEntry[];
  systemPrompts: {
    intentClassifier: string;
    technicalAssistant: string;
  };
}

export interface PromptsConfig {
  systemPrompts: {
    intentClassifier: string;
    technicalAssistant: string;
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
 * Builds STT vocabulary guide from canonical names + full forms.
 * Auto-generated — no more maintaining a separate vocab list.
 */
function buildSttVocabulary(dictionary: DictionaryEntry[]): string {
  const terms: string[] = [];
  for (const entry of dictionary) {
    terms.push(entry.canonical);
    if (entry.fullForm) terms.push(entry.fullForm);
  }
  return terms.join(', ');
}

// --- Assemble prompts at startup ---
const raw = promptsData as unknown as RawPromptsData;
const dictionary = raw.technicalDictionary;
const phonemeMapping = buildPhonemeMapping(dictionary);
const sttVocab = buildSttVocabulary(dictionary);

// Inject dictionary into prompt templates (single place, no duplication)
const intentClassifier = raw.systemPrompts.intentClassifier.replace('{{SPEECH_DICTIONARY}}', phonemeMapping);
const technicalAssistant = raw.systemPrompts.technicalAssistant.replace('{{SPEECH_DICTIONARY}}', phonemeMapping);

export const prompts: PromptsConfig = {
  systemPrompts: {
    intentClassifier,
    technicalAssistant,
  },
  sttPrompts: {
    technicalVocabularyGuide: sttVocab,
  },
};
