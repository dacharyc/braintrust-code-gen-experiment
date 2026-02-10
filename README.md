# MongoDB Code Generation Evaluation

Evaluates LLM effectiveness at generating MongoDB code by comparing three approaches:

1. **Baseline**: LLM with a realistic developer prompt (no extra help)
2. **With Documentation**: Same prompt + documentation content fetched from URL
3. **With Skill**: Same prompt + domain expertise from a skill file

Results are logged to [Braintrust](https://www.braintrust.dev) for tracking experiments over time.

## Setup

### Prerequisites

- Node.js v18+
- MongoDB Atlas cluster with `sample_mflix` dataset loaded
- Braintrust API key (for LLM access via AI Proxy and experiment tracking)

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file:

```bash
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
BRAINTRUST_API_KEY=...

# Optional: Configure which models to use (defaults shown)
GENERATION_MODEL=gpt-4o-mini
SCORING_MODEL=claude-sonnet-4-5-20250929
```

LLM calls are made through the [Braintrust AI Proxy](https://www.braintrust.dev/docs/guides/proxy), which provides unified access to multiple providers (OpenAI, Anthropic, Google, etc.) using your Braintrust API key. Configure provider API keys in your Braintrust organization settings.

## Usage

```bash
npm run compare
```

This runs all three evaluation approaches sequentially and logs results to Braintrust.

### Testing Different Models

Test different models by setting environment variables:

```bash
# Use Claude for generation
GENERATION_MODEL=claude-sonnet-4-5-20250929 npm run compare

# Use GPT-4o for generation, Gemini for scoring
GENERATION_MODEL=gpt-4o SCORING_MODEL=gemini-2.5-flash npm run compare
```

The generation and scoring models are intentionally separate to avoid self-evaluation bias.

## Project Structure

```
src/
├── index.ts                 # Re-exports harness components
├── harness/
│   └── index.ts             # Reusable evaluation infrastructure
├── evals/
│   └── search/
│       └── create-search-index.ts   # Atlas Search evaluation
├── scorers/
│   └── search-scorer.ts     # Atlas Search scorer
├── skills/
│   └── search.md            # Atlas Search expertise
├── utils/
│   ├── code-executor.ts     # VM execution & cleanup
│   ├── fetch-documentation.ts
│   └── read-skill-file.ts
└── examples/
    └── reference-implementations.ts
```

## Scoring

Generated code is scored on four dimensions:

| Dimension | Weight | What it measures |
|-----------|--------|------------------|
| Syntax | 25% | Valid JavaScript with proper imports |
| Semantic | 35% | Correct MongoDB APIs for the topic |
| Execution | 20% | Code runs without errors |
| Result | 20% | Produces expected output |

### Score Interpretation

| Score | Interpretation |
|-------|---------------|
| 0-25% | Poor - code is broken or missing key components |
| 26-50% | Fair - some correct elements but significant issues |
| 51-75% | Good - mostly correct with minor issues |
| 76-90% | Very Good - correct with minor improvements needed |
| 91-100% | Excellent - production-ready |

## Adding a New Evaluation

### 1. Create the Evaluation File

Create a new file in `src/evals/<topic>/`:

```typescript
// src/evals/aggregation/basic-pipeline.ts
import { runEvaluation, type TaskInput } from "../../harness/index.js";
import { aggregationScorer } from "../../scorers/aggregation-scorer.js";

const evalData: Array<{ input: TaskInput; expected: any }> = [
  {
    input: {
      prompt: "Write code to count documents by genre",
      docLink: "https://www.mongodb.com/docs/manual/aggregation/",
      skillFile: "src/skills/aggregation.md",
    },
    expected: {
      type: "aggregation",
      stages: ["$group", "$count"],
    },
  },
];

runEvaluation({
  projectName: "MongoDB Aggregation",
  evalData,
  scorer: aggregationScorer,
  cleanup: myCleanupFunction, // optional
}).catch(console.error);
```

### 2. Create a Skill File (Optional)

Add domain expertise in `src/skills/<topic>.md`:

```markdown
# Aggregation Best Practices

- Use $match early to filter documents
- Use $project to limit fields
- ...
```

### 3. Add a Script to package.json

```json
{
  "scripts": {
    "eval:aggregation": "npm run build && export $(xargs < .env) && node dist/evals/aggregation/basic-pipeline.js"
  }
}
```

## Creating a New Scorer

Use the `createScorer` factory from the harness:

```typescript
// src/scorers/aggregation-scorer.ts
import { createScorer, type ValidationContext } from "../harness/index.js";

async function validateAggregationSemantics(ctx: ValidationContext) {
  const { output, expected, checks, errors } = ctx;
  let score = 0;

  if (expected.type === "aggregation") {
    if (output.includes("aggregate")) {
      score += 0.15;
      checks.push("✓ Uses aggregate method");
    }
    // Add more semantic checks...
  }

  return { score };
}

async function validateAggregationResult(ctx: ValidationContext & { executionSucceeded: boolean }) {
  const { expected, checks, executionSucceeded } = ctx;

  if (executionSucceeded) {
    // Verify the aggregation produced expected results
    return { score: 0.2 };
  }

  return { score: 0 };
}

export const aggregationScorer = createScorer({
  name: "aggregation_scorer",
  validateSemantics: validateAggregationSemantics,
  validateResult: validateAggregationResult,
});
```

The `createScorer` factory handles:
- **Syntax validation** (25%): Checks for async/await, MongoDB imports
- **Execution** (20%): Runs the code in a VM sandbox

Your scorer provides:
- **Semantic validation** (35%): Topic-specific API checks
- **Result validation** (20%): Verify expected outcomes

## Limitations

### Sequential Execution

Evaluations run sequentially because:

- MongoDB Atlas Search indexes are created during code execution
- Indexes must be cleaned up between test runs
- M0 (free tier) Atlas clusters support a maximum of 3 search indexes

### Atlas Search Index Timing

Atlas Search indexes take time to become available after creation. The scorer handles this with polling and cleanup, but it adds latency to each test case
