# MongoDB Code Generation Evaluation

Evaluates LLM effectiveness at generating MongoDB Atlas Search code by comparing three approaches:

1. **Baseline**: LLM with a realistic developer prompt (no extra help)
2. **With Documentation**: Same prompt + actual documentation content fetched from URL
3. **With Skill**: Same prompt + custom MongoDB expertise in the system prompt

Results are logged to [Braintrust](https://www.braintrust.dev) for tracking experiments over time.

## Setup

### Prerequisites

- Node.js v18+
- MongoDB Atlas cluster with `sample_mflix` dataset loaded
- Braintrust API key (used for both LLM access via AI Proxy and experiment tracking)

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

**Note**: LLM calls are made through the [Braintrust AI Proxy](https://www.braintrust.dev/docs/guides/proxy), which provides unified access to multiple providers (OpenAI, Anthropic, Google, etc.) using your Braintrust API key. Configure provider API keys in your Braintrust organization settings.

## Usage

```bash
npm run compare
```

This runs all three evaluation approaches sequentially and logs results to Braintrust.

### Testing Different Models

You can easily test different models by setting environment variables:

```bash
# Use Claude for generation
GENERATION_MODEL=claude-sonnet-4-5-20250929 npm run compare

# Use GPT-4o for generation, Gemini for scoring
GENERATION_MODEL=gpt-4o SCORING_MODEL=gemini-2.5-flash npm run compare
```

The generation and scoring models are intentionally separate to avoid self-evaluation bias in LLM-as-judge scenarios.

## Project Structure

```
src/
├── compare-approaches.ts    # Main evaluation script
├── index.ts                 # Entry point
├── scorers/
│   └── mongodb-code-scorer.ts   # Multi-dimensional scoring
├── utils/
│   └── code-executor.ts         # VM execution & cleanup
└── examples/
    └── reference-implementations.ts  # Reference code
```

## Scoring

Generated code is scored on four dimensions:

| Dimension | Weight | What it measures |
|-----------|--------|------------------|
| Syntax | 25% | Valid JavaScript with proper imports |
| Semantic | 35% | Correct MongoDB APIs (`createSearchIndex`, etc.) |
| Execution | 20% | Code runs without errors |
| Result | 20% | Produces expected output |

### Score Interpretation

| Score | Interpretation |
|-------|---------------|
| 0.00 - 0.25 | Poor - code is broken or missing key components |
| 0.26 - 0.50 | Fair - some correct elements but significant issues |
| 0.51 - 0.75 | Good - mostly correct with minor issues |
| 0.76 - 0.90 | Very Good - correct with minor improvements needed |
| 0.91 - 1.00 | Excellent - production-ready |

## Limitations

### Sequential Execution

Evaluations run sequentially (not in parallel) because:

- MongoDB Atlas Search indexes are created during code execution
- Indexes must be cleaned up between test runs
- M0 (free tier) Atlas clusters support a maximum of 3 search indexes

This means evaluation time scales linearly with the number of test cases.

### Atlas Search Index Timing

Atlas Search indexes take time to become available after creation. The scorer handles this with polling and cleanup, but it adds latency to each test case.

## Adding Test Cases

Edit `evalData` in `src/compare-approaches.ts`:

```typescript
const evalData = [
  {
    input: {
      prompt: "Your prompt here",
      docLink: "https://www.mongodb.com/docs/atlas/atlas-search/...",
    },
    expected: {
      type: "createSearchIndex",
      database: "sample_mflix",
      collection: "movies",
      // ... expected properties
    },
  },
];
```

Note: The `input` object is passed to the task function by Braintrust. The `prompt` and `docLink` fields are accessed as `input.prompt` and `input.docLink` within the task functions.

## Customizing Prompts

The system prompts are defined in `src/compare-approaches.ts`:

- `BASELINE_SYSTEM_PROMPT`: Generic coding assistant
- `MONGODB_SKILL_PROMPT`: MongoDB expert with Atlas Search knowledge

Modify these to test different prompt strategies.

