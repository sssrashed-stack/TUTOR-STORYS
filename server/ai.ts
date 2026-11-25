import { GoogleGenAI, Type } from '@google/genai';
import type {
  AccentType,
  CEFRLevel,
  PronunciationEvaluation,
  WritingErrorItem,
} from '../src/types.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please configure it in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function generateEphemeralStory(params: {
  words: Array<{ word: string; translationAr: string }>;
  level: CEFRLevel;
}): Promise<{ title: string; titleAr: string; text: string }> {
  const ai = getAiClient();
  const wordList = params.words.map((w) => w.word).join(', ');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Write an engaging, motivating short English story (around 95-115 words) tailored for CEFR level ${params.level}.
You MUST naturally include EVERY ONE of these target words verbatim (exact spelling): ${wordList}.
Make the plot interesting and encouraging for an adult/young-adult learner. Keep sentences clear and appropriate for level ${params.level}. Also provide a concise English title and an Arabic title.`,
    config: {
      systemInstruction:
        'You are an expert English language storyteller for Arabic-speaking learners. Produce natural, uplifting, culturally respectful stories.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Short engaging English title' },
          titleAr: { type: Type.STRING, description: 'Natural Arabic translation of the title' },
          text: { type: Type.STRING, description: 'The 95-115 word English story containing all target words' },
        },
        required: ['title', 'titleAr', 'text'],
      },
    },
  });

  const raw = (response.text ?? '{}').trim();
  const parsed = JSON.parse(raw) as { title?: string; titleAr?: string; text?: string };
  if (!parsed.text) {
    throw new Error('AI did not return a valid story.');
  }
  return {
    title: parsed.title || 'Your Custom Practice Story',
    titleAr: parsed.titleAr || 'قصتك التدريبية المخصصة',
    text: parsed.text,
  };
}

export interface WritingCorrectionResult {
  correctedText: string;
  errors: WritingErrorItem[];
  frequentPatternsAr: string[];
  suggestedWordsUsed: string[];
  overallFeedbackAr: string;
}

export async function correctWritingWithAI(params: {
  text: string;
  level: CEFRLevel;
  topicEn: string;
  suggestedWords: string[];
  previousPatterns: string[];
}): Promise<WritingCorrectionResult> {
  const ai = getAiClient();

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Analyze and correct the following English writing written by a CEFR ${params.level} Arabic-speaking learner.
Topic: "${params.topicEn}"
Suggested vocabulary words to look for: ${params.suggestedWords.join(', ') || 'None'}
Learner's previous recurring error patterns: ${params.previousPatterns.join(' | ') || 'None yet'}

Learner's text:
"""
${params.text}
"""

Provide:
1. correctedText: The natural, corrected English version preserving the learner's meaning and appropriate for level ${params.level}.
2. errors: Detailed list of spelling, grammar, punctuation, or word-choice mistakes found. For each error, explain clearly in simple Arabic (ruleAr, explanationAr) and give one short English example (exampleEn).
3. frequentPatternsAr: 1 to 3 concise Arabic bullet insights summarizing the most common error patterns in this writing (and recurring ones if applicable).
4. suggestedWordsUsed: Array of words from the suggested vocabulary list that the learner successfully used.
5. overallFeedbackAr: Encouraging, constructive summary in Arabic.`,
    config: {
      systemInstruction:
        'You are a warm, thorough English writing tutor for Arabic speakers. Give accurate corrections and crystal-clear Arabic explanations.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          correctedText: { type: Type.STRING },
          errors: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                original: { type: Type.STRING },
                correction: { type: Type.STRING },
                errorType: { type: Type.STRING },
                explanationAr: { type: Type.STRING },
                ruleAr: { type: Type.STRING },
                exampleEn: { type: Type.STRING },
              },
              required: ['original', 'correction', 'errorType', 'explanationAr', 'ruleAr', 'exampleEn'],
            },
          },
          frequentPatternsAr: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          suggestedWordsUsed: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          overallFeedbackAr: { type: Type.STRING },
        },
        required: [
          'correctedText',
          'errors',
          'frequentPatternsAr',
          'suggestedWordsUsed',
          'overallFeedbackAr',
        ],
      },
    },
  });

  const raw = (response.text ?? '{}').trim();
  const parsed = JSON.parse(raw) as Partial<WritingCorrectionResult>;
  return {
    correctedText: parsed.correctedText || params.text,
    errors: Array.isArray(parsed.errors) ? parsed.errors : [],
    frequentPatternsAr: Array.isArray(parsed.frequentPatternsAr) ? parsed.frequentPatternsAr : [],
    suggestedWordsUsed: Array.isArray(parsed.suggestedWordsUsed) ? parsed.suggestedWordsUsed : [],
    overallFeedbackAr: parsed.overallFeedbackAr || 'عمل رائع! استمر في الكتابة والمراجعة.',
  };
}

export async function evaluatePronunciationWithAI(params: {
  audioBase64: string;
  mimeType: string;
  expectedSentence: string;
  accent: AccentType;
  level: CEFRLevel;
}): Promise<PronunciationEvaluation> {
  const ai = getAiClient();

  const cleanMime = params.mimeType.split(';')[0].trim() || 'audio/webm';
  const accentLabel = params.accent === 'en-GB' ? 'British English (en-GB)' : 'American English (en-US)';

  const audioPart = {
    inlineData: {
      mimeType: cleanMime,
      data: params.audioBase64,
    },
  };

  const textPart = {
    text: `Evaluate this CEFR ${params.level} English learner's spoken pronunciation and accent.
Target sentence they were trying to read aloud:
"${params.expectedSentence}"
Target accent model: ${accentLabel}

Listen carefully to the audio recording and return an honest, encouraging evaluation:
1. pronunciationScore (0-100 integer): Clarity of vowels, consonants, word endings, and intelligibility relative to the target sentence. If the audio is silent, noise-only, or completely unrelated words, score low (e.g. 0-25).
2. accentScore (0-100 integer): Naturalness of stress, rhythm, intonation, and closeness to ${accentLabel}.
3. overallScore (0-100 integer): Weighted overall speaking score.
4. heardTranscript: Exact words you heard spoken in the recording (or "(no speech detected)" if silent).
5. wordFeedback: Evaluate the key words from the target sentence with status ("accurate", "needs_work", or "missed") and a short practical tip in simple Arabic (tipAr).
6. coachSummaryAr: Warm, actionable 2-3 sentence coaching feedback in Arabic mentioning what sounded clear and one specific sound or rhythm to improve next.`,
  };

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: { parts: [audioPart, textPart] },
    config: {
      systemInstruction:
        'You are an expert English phonetics and pronunciation coach for Arabic-speaking learners. Score accurately and encourage steady progress.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          pronunciationScore: { type: Type.INTEGER },
          accentScore: { type: Type.INTEGER },
          overallScore: { type: Type.INTEGER },
          heardTranscript: { type: Type.STRING },
          wordFeedback: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                status: { type: Type.STRING },
                tipAr: { type: Type.STRING },
              },
              required: ['word', 'status', 'tipAr'],
            },
          },
          coachSummaryAr: { type: Type.STRING },
        },
        required: [
          'pronunciationScore',
          'accentScore',
          'overallScore',
          'heardTranscript',
          'wordFeedback',
          'coachSummaryAr',
        ],
      },
    },
  });

  const raw = (response.text ?? '{}').trim();
  const parsed = JSON.parse(raw) as Partial<PronunciationEvaluation>;
  const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

  return {
    pronunciationScore: clamp(parsed.pronunciationScore),
    accentScore: clamp(parsed.accentScore),
    overallScore: clamp(parsed.overallScore),
    heardTranscript: parsed.heardTranscript || '',
    wordFeedback: Array.isArray(parsed.wordFeedback)
      ? parsed.wordFeedback.map((w) => ({
          word: String(w.word || ''),
          status:
            w.status === 'accurate' || w.status === 'needs_work' || w.status === 'missed'
              ? w.status
              : 'needs_work',
          tipAr: String(w.tipAr || ''),
        }))
      : [],
    coachSummaryAr:
      parsed.coachSummaryAr || 'استمر في التدريب والاستماع للجملة ببطء ثم تكرارها بصوت واضح.',
  };
}

