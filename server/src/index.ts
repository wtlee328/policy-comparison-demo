import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { OpenAI } from 'openai';

dotenv.config({ path: '/Users/wtlee/Documents/GitHub/Satori/.env' });

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const PORT = 3001;
const MOCK_DATA_DIR = '/Users/wtlee/Documents/GitHub/Satori/docs/mock_specimen_data';
const EMBEDDINGS_FILE = path.join(__dirname, '../data/standard_embeddings.json');

// --- Pre-loaded Data ---

let standardEmbeddings: any = {};
if (fs.existsSync(EMBEDDINGS_FILE)) {
    standardEmbeddings = JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, 'utf-8'));
    console.log('Loaded pre-embedded standard policies.');
}

// --- Utilities ---

interface Clause {
    header: string;
    content: string;
    embedding?: number[];
}

const chunkPolicy = (markdown: string): Clause[] => {
    const lines = markdown.split('\n');
    const clauses: Clause[] = [];
    let currentHeader = 'Introduction';
    let currentContent: string[] = [];

    lines.forEach(line => {
        if (line.startsWith('## ') || line.startsWith('### ')) {
            if (currentContent.length > 0) {
                clauses.push({
                    header: currentHeader,
                    content: currentContent.join('\n').trim()
                });
            }
            currentHeader = line.replace(/^#{2,3} /, '');
            currentContent = [];
        } else {
            currentContent.push(line);
        }
    });

    if (currentContent.length > 0) {
        clauses.push({
            header: currentHeader,
            content: currentContent.join('\n').trim()
        });
    }

    return clauses.filter(c => c.content.length > 10);
};

const getEmbeddings = async (texts: string[]) => {
    const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: texts,
    });
    return response.data.map(d => d.embedding);
};

const cosineSimilarity = (vecA: number[], vecB: number[]) => {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

// --- Mock Data Service ---

const getPolicies = () => {
    const categories = ['IAPL', 'IFL', 'PEX'];
    const data: any = {};
    categories.forEach(cat => {
        const catDir = path.join(MOCK_DATA_DIR, cat);
        if (fs.existsSync(catDir)) {
            const files = fs.readdirSync(catDir);
            data[cat] = {
                proprietary: files.filter(f => f.startsWith('Proprietary')),
                standard: files.filter(f => f.startsWith('Standard'))
            };
        }
    });
    return data;
};

// --- Normalization ---

const normalizePolicy = async (rawText: string): Promise<{ type: string, content: string, metadata: any }> => {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {
                role: "system",
                content: `You are a forensic insurance policy analyst.
Task:
1. DETECT Policy Details:
   - "category": IAPL, IFL, PEX, D&O, Cyber, GL, Property, or Unknown.
   - "structure": Primary, Excess, Umbrella, Quota Share, or Unknown.
   - "variant": Proprietary (Carrier Specific) or Industry Standard (ISO/Advisory).
2. NORMALIZE the content:
   - Extract the main Insuring Agreements, Definitions, and Exclusions.
   - Separate Endorsements if present.
   - Remove boilerplate (headers, footers, page numbers).
3. FORMAT as clean Markdown:
   - Use ## for Main Sections (INSURING AGREEMENTS, DEFINITIONS, EXCLUSIONS)
   - Use ### for Clauses/Terms
   - Keep the actual legal text verbatim.

Output MUST be valid JSON:
{
  "category": "e.g. IAPL",
  "structure": "e.g. Primary",
  "variant": "e.g. Proprietary",
  "content": "The full normalized markdown text"
}`
            },
            { role: "user", content: rawText.substring(0, 15000) } // Cap input to avoid token limits
        ],
        response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    const fullType = `${result.structure || ''} ${result.category || ''}`.trim() || "Unknown Policy";

    return {
        type: fullType,
        content: result.content || "",
        metadata: {
            category: result.category,
            structure: result.structure,
            variant: result.variant
        }
    };
};

// --- Routes ---

app.get('/api/policies', (req, res) => {
    res.json(getPolicies());
});

app.get('/api/policy/:type/:file', (req, res) => {
    const { type, file } = req.params;
    const filePath = path.join(MOCK_DATA_DIR, type, file);
    if (fs.existsSync(filePath)) {
        res.send(fs.readFileSync(filePath, 'utf-8'));
    } else {
        res.status(404).send('Policy not found');
    }
});

app.post('/api/compare', async (req, res) => {
    const { proprietaryForm, industryStandardForm, selectedType, standardFileName, customMode } = req.body;

    if (!proprietaryForm || !industryStandardForm) {
        return res.status(400).json({ error: 'Missing policy data' });
    }

    try {
        let finalPropForm = proprietaryForm;
        let finalStdForm = industryStandardForm;
        let detectedType = selectedType;
        let detectedMetadata = {};

        // Custom Mode Normalization
        if (customMode) {
            console.log("Normalizing Custom Policies...");
            const [normProp, normStd] = await Promise.all([
                normalizePolicy(proprietaryForm),
                normalizePolicy(industryStandardForm)
            ]);
            finalPropForm = normProp.content;
            finalStdForm = normStd.content;

            // Construct a detailed type string
            detectedType = `${normProp.type} (${normProp.metadata.variant}) vs ${normStd.metadata.variant}`;
            detectedMetadata = { prop: normProp.metadata, std: normStd.metadata };

            console.log(`Normalization Complete. Analysis Context: ${detectedType}`);
        }

        const propClauses = chunkPolicy(finalPropForm);
        const propEmbeds = await getEmbeddings(propClauses.map(c => `${c.header}: ${c.content}`));

        let stdClausesWithEmbeds: Clause[] = [];

        if (customMode) {
            // In custom mode, we always generate embeddings on the fly for the standard form
            console.log(`Generating on-the-fly embeddings for Custom Standard Policy`);
            const stdClauses = chunkPolicy(finalStdForm);
            const stdEmbeds = await getEmbeddings(stdClauses.map(c => `${c.header}: ${c.content}`));
            stdClausesWithEmbeds = stdClauses.map((c, i) => ({ ...c, embedding: stdEmbeds[i] }));
        } else {
            // Mock Mode logic for Pre-embedded
            const standardPathKey = `${selectedType}/${standardFileName}`;
            if (standardEmbeddings[standardPathKey]) {
                console.log(`Using pre-embedded data for ${standardPathKey}`);
                stdClausesWithEmbeds = standardEmbeddings[standardPathKey];
            } else {
                console.log(`Generating on-the-fly embeddings for ${standardPathKey}`);
                const stdClauses = chunkPolicy(finalStdForm);
                const stdEmbeds = await getEmbeddings(stdClauses.map(c => `${c.header}: ${c.content}`));
                stdClausesWithEmbeds = stdClauses.map((c, i) => ({ ...c, embedding: stdEmbeds[i] }));
            }
        }

        const matchedPairs = propClauses.map((pClause, i) => {
            let bestMatch = stdClausesWithEmbeds[0];
            let highestSimilarity = -1;

            stdClausesWithEmbeds.forEach((sClause) => {
                if (sClause.embedding) {
                    const sim = cosineSimilarity(propEmbeds[i], sClause.embedding);
                    if (sim > highestSimilarity) {
                        highestSimilarity = sim;
                        bestMatch = sClause;
                    }
                }
            });

            return {
                proprietary: pClause,
                standard: bestMatch,
                score: highestSimilarity
            };
        });

        const promptContext = matchedPairs.map((pair, i) => `
Pair ${i + 1}:
PROPRIETARY: ${pair.proprietary.header} - ${pair.proprietary.content}
STANDARD: ${pair.standard.header} - ${pair.standard.content}
Similarity: ${pair.score.toFixed(2)}
`).join('\n\n');

        const response = await openai.chat.completions.create({
            model: "gpt-5-mini",
            messages: [
                {
                    role: "system",
                    content: `You are a forensic insurance policy analyst. You MUST output valid JSON with ARRAYS.
Policy Type being analyzed: ${detectedType}

### CRITICAL RULES:
1. "insuring_agreements", "definitions", and "exclusions" MUST be ARRAYS (use [] brackets).
2. Each array item MUST be an object with: "topic", "prop", "std", "gap".
3. "prop" and "std" MUST be ARRAYS of strings (use [] brackets).
4. "gap" MUST be a single string.
5. If you cannot find data, return an empty array: []
6. NEVER return a string where an array is expected.

### TASK:
Compare the Proprietary vs. Standard forms.
Focus on: ${detectedType} specific nuances.
1. Extract key "topic" cards for: Insuring Agreements, Definitions, Exclusions.
2. "prop": List specific coverages/exclusions in Proprietary form (Array of strings).
3. "std": List specific coverages/exclusions in Standard form (Array of strings).
4. "gap": One sentence verdict on the difference. (Start with "Broader", "Narrower", "Silent", or "Equivalent").

### RESPONSE FORMAT (JSON ONLY):
{
  "summary": "High-level executive summary of the comparison...",
  "market_position": "Strong / Competitive / Weak",
  "insuring_agreements": [ { "topic": "...", "prop": ["..."], "std": ["..."], "gap": "..." } ],
  "definitions": [ { "topic": "...", "prop": ["..."], "std": ["..."], "gap": "..." } ],
  "exclusions": [ { "topic": "...", "prop": ["..."], "std": ["..."], "gap": "..." } ]
}`
                },
                { role: "user", content: promptContext }
            ],
            response_format: { type: "json_object" }
        });

        const comparisonResult = JSON.parse(response.choices[0].message.content || '{}');

        // Fallback safety to ensure arrays
        const ensureTopicArray = (val: any, sectionName: string): any[] => {
            if (Array.isArray(val)) return val;
            if (typeof val === 'string' && val.trim()) {
                // Convert string to a single topic card
                return [{
                    topic: `${sectionName} Overview`,
                    prop: [val.substring(0, 200)],
                    std: ["See analysis"],
                    gap: "Full comparison requires structured data."
                }];
            }
            return [];
        };

        const sanitizedResult = {
            summary: comparisonResult.summary || "No summary generated.",
            market_position: comparisonResult.market_position || "Unknown",
            detected_type: detectedType, // Pass back to frontend
            insuring_agreements: ensureTopicArray(comparisonResult.insuring_agreements, "Insuring Agreements"),
            definitions: ensureTopicArray(comparisonResult.definitions, "Definitions"),
            exclusions: ensureTopicArray(comparisonResult.exclusions, "Exclusions")
        };

        res.json(sanitizedResult);
        console.log("Comparison Complete.");

    } catch (error) {
        console.error("Error running comparison:", error);
        res.status(500).json({ error: 'Comparison failed' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
