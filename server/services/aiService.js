import { GoogleGenAI } from '@google/genai';

/**
 * Calculates a local keyword & skill match ratio to support hybrid scoring.
 */
const calculateKeywordScore = (resumeText, jobDescription, jobTitle) => {
    const combinedJobText = `${jobTitle} ${jobDescription}`.toLowerCase();
    
    // Extract potential skill words (alphanumeric, plus common tech terms like C++, Node.js)
    const keywords = combinedJobText
        .split(/[\s,./()|:;\-]+/)
        .map(w => w.trim())
        .filter(w => w.length > 2 && !['the', 'and', 'for', 'with', 'that', 'this', 'you', 'are', 'will', 'have', 'from', 'been', 'about', 'must', 'work', 'experience', 'looking'].includes(w));

    const uniqueJobKeywords = Array.from(new Set(keywords));
    if (uniqueJobKeywords.length === 0) return 70;

    const lowerResume = resumeText.toLowerCase();
    let matches = 0;
    
    uniqueJobKeywords.forEach(kw => {
        if (lowerResume.includes(kw)) {
            matches++;
        }
    });

    const matchRatio = matches / uniqueJobKeywords.length;
    // Map ratio to 0-100 scale
    return Math.min(100, Math.max(20, Math.round(matchRatio * 100)));
};

/**
 * Sends prompt to Gemini LLM and returns response text.
 */
const callGeminiLLM = async (promptText) => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
    if (!apiKey) {
        throw new Error('AI API Key (GEMINI_API_KEY or AI_API_KEY) is missing in environment variables.');
    }

    const ai = new GoogleGenAI({ apiKey });
    const modelsToTry = [
        'gemini-2.5-flash-lite',
        'gemini-2.5-flash',
        'gemini-flash-latest',
        'gemini-3.5-flash-lite',
        'gemini-3.8-flash'
    ];

    let lastError = null;

    for (const model of modelsToTry) {
        try {
            const response = await ai.models.generateContent({
                model,
                contents: promptText,
                config: {
                    responseMimeType: 'application/json'
                }
            });
            if (response.text) {
                return response.text;
            }
        } catch (err) {
            console.warn(`Model ${model} unavailable (${err.message?.slice(0, 80)}), trying next model...`);
            lastError = err;
        }
    }

    // Direct REST API Fallback
    try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: { response_mime_type: 'application/json' }
            })
        });

        if (res.ok) {
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return text;
        }
    } catch (e) {
        console.warn('REST fallback error:', e.message);
    }

    throw lastError || new Error('All Gemini model candidates failed to respond.');
};

/**
 * Analyzes candidate resume against job description using Gemini AI + Hybrid Scoring.
 * Returns structured JSON matching exact prompt criteria.
 */
export const analyzeResumeAgainstJob = async (resumeText, jobDescription, jobTitle = '', level = '', category = '') => {
    try {
        const prompt = `
You are an expert HR AI assistant and recruiter evaluator.
Analyze the following CANDIDATE RESUME against the JOB POSTING requirements.

JOB TITLE: ${jobTitle}
CATEGORY: ${category}
LEVEL: ${level}

JOB DESCRIPTION:
${jobDescription}

CANDIDATE RESUME:
${resumeText || 'No resume text provided.'}

Perform an in-depth analysis and return ONLY a valid JSON object with the following structure:
{
  "matchScore": number (between 0 and 100 based on semantic relevance and technical alignment),
  "matchedSkills": [array of string skills present in both job and resume],
  "missingSkills": [array of string skills required/preferred in job but absent from resume],
  "experienceMatch": "Excellent" | "Good" | "Moderate" | "Low",
  "educationMatch": "Excellent" | "Good" | "Moderate" | "Low",
  "relevantExperience": [array of short strings highlighting relevant roles or internships],
  "relevantProjects": [array of short strings highlighting relevant candidate projects],
  "summary": "Concise summary (2-3 sentences) evaluating the fit of the candidate for the role.",
  "potentialGaps": [array of strings highlighting candidate skill gaps, experience shortfalls, or missing criteria],
  "interviewFocus": [array of specific technical topics or skills the recruiter should probe in the interview]
}
`;

        const responseText = await callGeminiLLM(prompt);

        if (!responseText) {
            throw new Error('Empty response from AI model');
        }

        // Clean any code fences if present
        let cleanedJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        let aiData = JSON.parse(cleanedJson);

        // HYBRID SCORING SYSTEM (Section 9 requirement):
        // Blend AI semantic matchScore (60% weight) with local keyword match score (40% weight)
        const localKeywordScore = calculateKeywordScore(resumeText, jobDescription, jobTitle);
        const semanticScore = typeof aiData.matchScore === 'number' ? aiData.matchScore : 70;
        
        const hybridScore = Math.round((semanticScore * 0.6) + (localKeywordScore * 0.4));
        aiData.matchScore = Math.min(99, Math.max(15, hybridScore));

        // Standardize output defaults
        return {
            status: 'completed',
            matchScore: aiData.matchScore,
            matchedSkills: Array.isArray(aiData.matchedSkills) ? aiData.matchedSkills : [],
            missingSkills: Array.isArray(aiData.missingSkills) ? aiData.missingSkills : [],
            experienceMatch: aiData.experienceMatch || 'Moderate',
            educationMatch: aiData.educationMatch || 'Moderate',
            relevantExperience: Array.isArray(aiData.relevantExperience) ? aiData.relevantExperience : [],
            relevantProjects: Array.isArray(aiData.relevantProjects) ? aiData.relevantProjects : [],
            summary: aiData.summary || 'Candidate resume reviewed against job description.',
            potentialGaps: Array.isArray(aiData.potentialGaps) ? aiData.potentialGaps : [],
            interviewFocus: Array.isArray(aiData.interviewFocus) ? aiData.interviewFocus : [],
            analyzedAt: new Date()
        };
    } catch (error) {
        console.error('AI Matching Service Error:', error.message);
        // Fallback result on AI failure so system continues gracefully
        return {
            status: 'failed',
            matchScore: 0,
            matchedSkills: [],
            missingSkills: [],
            experienceMatch: 'N/A',
            educationMatch: 'N/A',
            relevantExperience: [],
            relevantProjects: [],
            summary: `AI analysis could not be completed: ${error.message}`,
            potentialGaps: ['AI service temporarily unavailable'],
            interviewFocus: [],
            analyzedAt: new Date()
        };
    }
};

/**
 * OPTIONAL FEATURE: Generates candidate-specific interview questions.
 */
export const generateInterviewQuestions = async (resumeText, jobDescription, jobTitle = '') => {
    try {
        const prompt = `
You are a senior technical interviewer.
Generate 5 targeted, highly customized interview questions for a candidate applying for the job of "${jobTitle}".

JOB DESCRIPTION:
${jobDescription}

CANDIDATE RESUME:
${resumeText || 'No resume text available.'}

Return ONLY a valid JSON array of objects with the following format:
[
  {
    "question": "Question text here",
    "category": "Technical" | "Project" | "Resume" | "Role",
    "context": "Short explanation of why this question is asked based on their resume or job requirement"
  }
]
`;

        const responseText = await callGeminiLLM(prompt);
        let cleanedJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const questions = JSON.parse(cleanedJson);
        return Array.isArray(questions) ? questions : [];
    } catch (error) {
        console.error('Error generating interview questions:', error.message);
        return [
            {
                question: "Can you walk us through your most relevant project experience for this role?",
                category: "Project",
                context: "Default baseline question."
            },
            {
                question: "What technical challenges did you face in your previous projects and how did you resolve them?",
                category: "Technical",
                context: "Default baseline question."
            }
        ];
    }
};
