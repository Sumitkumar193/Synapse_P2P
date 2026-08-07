/**
 * ResumeRAGService.ts
 *
 * Hybrid RAG (Retrieval-Augmented Generation) & Embedding Engine for Resume Context.
 * Combines section-aware chunking, TF-IDF vector similarity, and metric/keyword indexing
 * to retrieve high-precision candidate background context for incoming speaker questions.
 */

export interface ResumeChunk {
  id: string;
  section: 'summary' | 'experience' | 'projects' | 'skills' | 'education' | 'certifications' | 'general';
  title: string;
  content: string;
  metrics: string[];
  keywords: string[];
  recencyRank?: number; // 1 = Most Recent / Current Role, 2 = Next Most Recent, etc.
  vector?: number[];
}

export interface RetrievalResult {
  chunk: ResumeChunk;
  score: number;
  matchType: 'summary_override' | 'metric_exact' | 'hybrid_semantic';
}

export function loadInitialResumeText(): string {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('synapse_resume_text');
    if (saved) return saved;
  }
  try {
    // Use eval('require') to bypass esbuild static bundling for the renderer process
    const req = typeof eval !== 'undefined' ? eval('require') : null;
    if (!req) return '';
    const fs = req('fs');
    const path = req('path');
    
    // Try multiple resolution strategies for the resume file
    const candidates = [
      path.resolve(process.cwd(), 'assets/resume.md'),
      path.resolve(__dirname, '../../../assets/resume.md'),
      path.resolve(__dirname, '../../assets/resume.md'),
      path.resolve(__dirname, '../assets/resume.md'),
    ];

    // Also try Electron's app path if available
    try {
      const { app } = req('electron');
      if (app) {
        candidates.unshift(path.resolve(app.getAppPath(), 'assets/resume.md'));
      }
    } catch {}

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        const text = fs.readFileSync(candidate, 'utf8');
        console.log(`[ResumeRAGService] ✅ Loaded resume from: ${candidate} (${text.length} chars)`);
        return text;
      } else {
        console.log(`[ResumeRAGService] ❌ Resume not found at: ${candidate}`);
      }
    }

    console.warn('[ResumeRAGService] ⚠️ No resume.md found at any candidate path');
  } catch (err) {
    console.error('[ResumeRAGService] Error loading resume:', err);
  }
  return '';
}

export class ResumeRAGService {
  private static instance: ResumeRAGService | null = null;
  private resumeText: string = '';
  private chunks: ResumeChunk[] = [];
  private vocabulary: Map<string, number> = new Map();
  private idfMap: Map<string, number> = new Map();
  private isIndexed = false;

  private constructor() {
    this.indexResume(this.loadPersistedResume() || loadInitialResumeText());
  }

  public static getInstance(): ResumeRAGService {
    if (!ResumeRAGService.instance) {
      ResumeRAGService.instance = new ResumeRAGService();
    }
    return ResumeRAGService.instance;
  }

  private loadPersistedResume(): string | null {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('synapse_resume_text');
    }
    return null;
  }

  public persistResume(text: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('synapse_resume_text', text);
    }
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.saveResumeMarkdown) {
        (window as any).electronAPI.saveResumeMarkdown(text);
      } else {
        const req = typeof eval !== 'undefined' ? eval('require') : null;
        if (!req) return;
        const fs = req('fs');
        const path = req('path');
        // Prefer writing to the project root assets directory
        let targetPath = path.resolve(process.cwd(), 'assets/resume.md');
        try {
           const { app } = req('electron');
           if (app) {
              targetPath = path.resolve(app.getAppPath(), 'assets/resume.md');
           }
        } catch {}
        
        fs.writeFileSync(targetPath, text, 'utf8');
        console.log(`[ResumeRAGService] ✅ Saved resume to: ${targetPath}`);
      }
    } catch (err) {
      console.error('[ResumeRAGService] Error persisting resume:', err);
    }
    this.indexResume(text);
  }

  public getResumeText(): string {
    return this.resumeText;
  }

  public isResumeIndexed(): boolean {
    return this.isIndexed && this.chunks.length > 0;
  }

  public getChunkCount(): number {
    return this.chunks.length;
  }

  public getChunks(): ResumeChunk[] {
    return [...this.chunks];
  }

  /**
   * Index resume text into structured, vectorized chunks
   */
  public indexResume(resumeText: string): void {
    this.resumeText = resumeText;
    this.chunks = this.parseAndChunkResume(resumeText);
    this.buildTfIdfVectors();
    this.isIndexed = true;
    console.log(`[ResumeRAGService 📚] Successfully indexed ${this.chunks.length} resume chunks.`);
  }

  /**
   * Parse resume into section-aware chunks
   */
  private parseAndChunkResume(text: string): ResumeChunk[] {
    const chunks: ResumeChunk[] = [];
    let chunkIdCounter = 1;

    // 1. Executive Summary Chunk (Highest priority for intro queries)
    const summaryMatch = text.match(/(?:##\s*)?PROFESSIONAL SUMMARY[\s\S]*?(?=(?:##\s*)?(?:TECHNICAL SKILLS|WORK EXPERIENCE|KEY PROJECTS|EDUCATION|CERTIFICATIONS)|$)/i);
    if (summaryMatch) {
      const content = summaryMatch[0].replace(/(?:##\s*)?PROFESSIONAL SUMMARY/i, '').trim();
      chunks.push({
        id: `chunk-${chunkIdCounter++}`,
        section: 'summary',
        title: 'Executive Summary & Background Overview',
        content: `Full-Stack AI Engineer candidate overview: ${content}`,
        metrics: this.extractMetrics(content),
        keywords: this.extractKeywords(content),
      });
    } else {
      // Fallback first paragraph as summary
      const firstParagraph = text.split('\n\n')[0] || text.substring(0, 500);
      chunks.push({
        id: `chunk-${chunkIdCounter++}`,
        section: 'summary',
        title: 'Executive Summary',
        content: `Candidate summary: ${firstParagraph}`,
        metrics: this.extractMetrics(firstParagraph),
        keywords: this.extractKeywords(firstParagraph),
      });
    }

    // 2. Technical Skills Chunk
    const skillsMatch = text.match(/(?:##\s*)?TECHNICAL SKILLS[\s\S]*?(?=(?:##\s*)?(?:WORK EXPERIENCE|KEY PROJECTS|EDUCATION|CERTIFICATIONS)|$)/i);
    if (skillsMatch) {
      const content = skillsMatch[0].replace(/(?:##\s*)?TECHNICAL SKILLS/i, '').trim();
      chunks.push({
        id: `chunk-${chunkIdCounter++}`,
        section: 'skills',
        title: 'Technical Skills & Architecture Stack',
        content: `Technical Skills: ${content}`,
        metrics: [],
        keywords: this.extractKeywords(content),
      });
    }

    // 3. Experience & Project Blocks
    const sectionRegex = /(?:##\s*)?(WORK EXPERIENCE|TECHNICAL SKILLS|PROFESSIONAL SUMMARY|KEY PROJECTS|EDUCATION|CERTIFICATIONS & ACHIEVEMENTS)/gi;
    const splitSections = text.split(sectionRegex);

    let experienceCount = 0;

    for (let i = 1; i < splitSections.length; i += 2) {
      const sectionHeader = splitSections[i].toUpperCase();
      const sectionBody = splitSections[i + 1] || '';

      const sectionType: ResumeChunk['section'] = sectionHeader.includes('PROJECT')
        ? 'projects'
        : sectionHeader.includes('EXPERIENCE')
        ? 'experience'
        : sectionHeader.includes('EDUCATION')
        ? 'education'
        : sectionHeader.includes('CERTIFICATION')
        ? 'certifications'
        : 'general';

      // Split body into sub-blocks by company/project headers or markdown sections
      const blocks = sectionBody
        .split(/(?=\n###?\s+)/)
        .map((b) => b.trim())
        .filter((b) => b.length > 20);

      if (blocks.length === 0 && sectionBody.trim().length > 0) {
        blocks.push(sectionBody.trim());
      }

      blocks.forEach((block) => {
        const lines = block.trim().split('\n');
        const title = lines[0].replace(/^[#•\-\*]\s*/, '').trim() || `${sectionHeader} Details`;
        const content = block.trim();

        let rank: number | undefined = undefined;
        if (sectionType === 'experience') {
          experienceCount++;
          rank = experienceCount;
        }

        chunks.push({
          id: `chunk-${chunkIdCounter++}`,
          section: sectionType,
          title,
          content,
          metrics: this.extractMetrics(content),
          keywords: this.extractKeywords(content),
          recencyRank: rank,
        });
      });
    }

    return chunks;
  }

  private splitIntoOverlappingChunks(text: string, chunkSize: number, overlap: number): string[] {
    const result: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      result.push(text.substring(start, end));
      if (end >= text.length) break;
      start += chunkSize - overlap;
    }
    return result;
  }

  private extractMetrics(text: string): string[] {
    const metricRegex = /\b(?:\d+[\d,]*\+?|\d+\s*(?:users|modules|engineer|engineers|years|years of experience|percent|%|ms|k|M|B))\b/gi;
    const matches = text.match(metricRegex);
    return matches ? Array.from(new Set(matches.map((m) => m.toLowerCase()))) : [];
  }

  private extractKeywords(text: string): string[] {
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s\-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);
    return Array.from(new Set(words));
  }

  /**
   * Build TF-IDF vector representations for cosine similarity calculation
   */
  private buildTfIdfVectors(): void {
    const docCount = this.chunks.length;
    this.vocabulary.clear();
    this.idfMap.clear();

    const docFreq: Map<string, number> = new Map();

    this.chunks.forEach((chunk) => {
      const terms = new Set(this.tokenize(chunk.content));
      terms.forEach((term) => {
        docFreq.set(term, (docFreq.get(term) || 0) + 1);
      });
    });

    let termIdx = 0;
    docFreq.forEach((freq, term) => {
      this.vocabulary.set(term, termIdx++);
      // Smoothed IDF
      this.idfMap.set(term, Math.log((docCount + 1) / (freq + 1)) + 1);
    });

    const vocabSize = this.vocabulary.size;

    this.chunks.forEach((chunk) => {
      const vector = new Array(vocabSize).fill(0);
      const tokens = this.tokenize(chunk.content);
      const termCounts: Map<string, number> = new Map();

      tokens.forEach((t) => termCounts.set(t, (termCounts.get(t) || 0) + 1));

      termCounts.forEach((count, term) => {
        const idx = this.vocabulary.get(term);
        const idf = this.idfMap.get(term) || 1;
        if (idx !== undefined) {
          vector[idx] = (count / tokens.length) * idf;
        }
      });

      // L2 Normalize vector
      const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
      chunk.vector = magnitude > 0 ? vector.map((v) => v / magnitude) : vector;
    });
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1);
  }

  private calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
    }
    return dot;
  }

  /**
   * Search RAG index for candidate query and return top K matching resume chunks
   */
  public search(query: string, topK: number = 3): RetrievalResult[] {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed || this.chunks.length === 0) return [];

    // Compute query vector
    const queryTokens = this.tokenize(query);
    const vocabSize = this.vocabulary.size;
    const queryVector = new Array(vocabSize).fill(0);
    const queryTermCounts: Map<string, number> = new Map();

    queryTokens.forEach((t) => queryTermCounts.set(t, (queryTermCounts.get(t) || 0) + 1));

    queryTermCounts.forEach((count, term) => {
      const idx = this.vocabulary.get(term);
      const idf = this.idfMap.get(term) || 1;
      if (idx !== undefined) {
        queryVector[idx] = (count / queryTokens.length) * idf;
      }
    });

    const queryMag = Math.sqrt(queryVector.reduce((sum, val) => sum + val * val, 0));
    const normQueryVector = queryMag > 0 ? queryVector.map((v) => v / queryMag) : queryVector;

    // Check for metric numbers (e.g. "500k", "500,000", "15+", "40%")
    const metricMatches = query.match(/\b(?:\d+[\d,]*\+?|\d+\s*(?:k|m|b|percent|%|users|clients|customers|requests|transactions|modules|projects|years))\b/gi) || [];

    const scoredResults: RetrievalResult[] = this.chunks.map((chunk) => {
      const cosSim = this.calculateCosineSimilarity(normQueryVector, chunk.vector || []);

      // Keyword & Metric boost
      let metricBoost = 0;
      if (metricMatches.length > 0) {
        const hasMetric = metricMatches.some((m) => {
          const normM = m.toLowerCase().replace(/,/g, '');
          return chunk.content.toLowerCase().includes(normM);
        });
        if (hasMetric) metricBoost += 0.45;
      }

      // Key tech terms boost (gives strong priority to specific technical terms like pgvector, redis, kafka, fastapi, etc.)
      let keywordBoost = 0;
      const stopWords = new Set(['what', 'have', 'with', 'your', 'about', 'tell', 'experience', 'work', 'does', 'did', 'this', 'that', 'from', 'more', 'some', 'they']);
      queryTokens.forEach((token) => {
        if (!stopWords.has(token) && (chunk.content.toLowerCase().includes(token) || chunk.keywords.includes(token))) {
          keywordBoost += 0.35;
        }
      });

      // Generic section-specific intent boost for Experience & Key Projects queries
      let sectionBoost = 0;
      const isProjectQuery = /\b(?:project|projects|built|app|application|portfolio|system|platform)\b/i.test(trimmed);
      const isExperienceQuery = /\b(?:experience|work|job|company|role|career|title|position|employment)\b/i.test(trimmed);

      if (isProjectQuery && chunk.section === 'projects') {
        sectionBoost += 0.2;
      }
      if (isExperienceQuery && chunk.section === 'experience') {
        sectionBoost += 0.2;
      }

      // Recency boost for Most Recent Work Experience Role (e.g. Senior SE vs Associate SE)
      let recencyBoost = 0;
      if (chunk.section === 'experience') {
        if (chunk.recencyRank === 1) {
          recencyBoost = 0.35; // Strong boost for most recent / current role
        } else if (chunk.recencyRank === 2) {
          recencyBoost = 0.15;
        }
      }

      const finalScore = cosSim * 0.4 + metricBoost + Math.min(0.5, keywordBoost) + sectionBoost + recencyBoost;
      const matchType: RetrievalResult['matchType'] = metricBoost > 0 ? 'metric_exact' : 'hybrid_semantic';

      return {
        chunk,
        score: finalScore,
        matchType,
      };
    });

    // Sort descending by score
    scoredResults.sort((a, b) => b.score - a.score);

    // Return top K
    const topResults = scoredResults.slice(0, topK).filter((r) => r.score > 0.05);

    // If top score is low, always include the summary chunk as context safety net
    if (topResults.length === 0 || (topResults.length > 0 && topResults[0].score < 0.2)) {
      const summaryChunk = this.chunks.find((c) => c.section === 'summary') || this.chunks[0];
      if (!topResults.some((r) => r.chunk.id === summaryChunk.id)) {
        topResults.unshift({ chunk: summaryChunk, score: 0.5, matchType: 'summary_override' });
      }
    }

    return topResults.slice(0, topK);
  }
}
