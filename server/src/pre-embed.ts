import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { OpenAI } from 'openai';

dotenv.config({ path: '/Users/wtlee/Documents/GitHub/Satori/.env' });

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const MOCK_DATA_DIR = '/Users/wtlee/Documents/GitHub/Satori/docs/mock_specimen_data';
const OUTPUT_FILE = '/Users/wtlee/Documents/GitHub/Satori/policy-comparison-demo/server/data/standard_embeddings.json';

interface Clause {
    header: string;
    content: string;
    embedding: number[];
}

interface StandardPolicyEmbeddings {
    [filePath: string]: Clause[];
}

const chunkPolicy = (markdown: string) => {
    const lines = markdown.split('\n');
    const clauses: { header: string; content: string }[] = [];
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

const preEmbed = async () => {
    const categories = ['IAPL', 'IFL', 'PEX'];
    const results: StandardPolicyEmbeddings = {};

    for (const cat of categories) {
        const catDir = path.join(MOCK_DATA_DIR, cat);
        if (fs.existsSync(catDir)) {
            const files = fs.readdirSync(catDir).filter(f => f.startsWith('Standard'));
            for (const file of files) {
                const filePath = path.join(cat, file);
                console.log(`Processing ${filePath}...`);
                const content = fs.readFileSync(path.join(catDir, file), 'utf-8');
                const chunks = chunkPolicy(content);

                const response = await openai.embeddings.create({
                    model: "text-embedding-3-small",
                    input: chunks.map(c => `${c.header}: ${c.content}`),
                });

                results[filePath] = chunks.map((c, i) => ({
                    header: c.header,
                    content: c.content,
                    embedding: response.data[i].embedding
                }));
            }
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    console.log(`\nSuccessfully saved pre-embedded standards to ${OUTPUT_FILE}`);
};

preEmbed().catch(console.error);
