# MongoDB Code Generation Evaluation

A framework for evaluating LLM effectiveness at generating MongoDB code by comparing three approaches:

1. **Baseline**: LLM with a realistic developer prompt (no extra help)
2. **With Documentation**: Same prompt + documentation content fetched from URL
3. **With Skill**: Same prompt + domain expertise from skill files

Results are logged to [Braintrust](https://www.braintrust.dev) for tracking experiments over time.

## Key Features

- **YAML-based eval cases**: Declarative test definitions with validation schemas
- **Modular scoring system**: Pluggable scorers organized by category (syntax, semantic, execution, result)
- **Automated cleanup**: Handles MongoDB resource cleanup between test runs
- **VM-based code execution**: Safely executes generated code in a sandboxed environment
- **Braintrust integration**: Automatic experiment tracking and comparison

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
├── index.ts                 # Main exports for the framework
├── harness/
│   └── index.ts             # Evaluation harness (task functions, scoring orchestration)
├── evals/
│   └── search/
│       └── create-search-index.ts   # Atlas Search evaluation runner
├── scorers/
│   ├── index.ts             # Scorer registry and exports
│   ├── types.ts             # Scorer type definitions
│   ├── syntax/              # Syntax validation scorers
│   │   ├── isValidJS.ts
│   │   └── hasAsyncAwait.ts
│   ├── semantic/            # Pattern matching scorers
│   │   ├── mustContain.ts
│   │   └── mustNotContain.ts
│   ├── execution/           # Code execution scorers
│   │   └── succeeds.ts
│   └── result/              # MongoDB state validation scorers
│       └── searchIndexExists.ts
├── schemas/
│   └── evalCase.ts          # Zod schemas for YAML validation
├── skills/
│   └── search.md            # Atlas Search expertise
├── utils/
│   ├── code-executor.ts     # VM-based code execution
│   ├── cleanup.ts           # MongoDB resource cleanup
│   ├── fetch-documentation.ts
│   ├── read-skill-file.ts
│   ├── loadEvalCases.ts     # YAML loader with validation
│   └── averageScores.ts     # Score aggregation
└── examples/
    └── reference-implementations.ts

evalCases/
└── search/
    └── index-creation.yml   # YAML-based eval case definitions
```

## Scoring System

The framework uses a modular scoring system with four categories. Each scorer checks if its expected field exists in the eval case and returns a score (1 for pass, 0 for fail, or null if not applicable).

### Score Categories

| Category | Scorers | What it measures |
|----------|---------|------------------|
| **Syntax** | `isValidJS`, `hasAsyncAwait` | Valid JavaScript syntax and async patterns |
| **Semantic** | `mustContain`, `mustNotContain` | Correct MongoDB APIs and patterns |
| **Execution** | `succeeds` | Code runs without errors in VM sandbox |
| **Result** | `searchIndexExists` | Produces expected MongoDB state changes |

### Score Aggregation

Scores are aggregated hierarchically:
1. **Individual assertions**: Each scorer produces named scores (e.g., `Syntax_IsValidJS`)
2. **Category compounds**: Average of all assertions in each category (e.g., `Syntax`)
3. **Overall compound**: Average of all category compounds (`CompoundCodeGenScore`)

All scores are sent to Braintrust for tracking and comparison across experiments.

## Adding New Eval Cases

The framework uses a YAML-based approach for defining eval cases. To add new test cases to the existing evaluation:

### Add to Existing YAML File

Simply add a new entry to `evalCases/search/index-creation.yml`:

```yaml
# evalCases/search/index-creation.yml
- name: Create search index with dynamic mapping
  tags: [search, index, dynamic-mapping]
  # ... existing eval case ...

- name: Create search index with static field mappings
  tags: [search, index, static-mapping]

  input:
    prompt: "Write Node.js code to create a search index on the movies collection that allows searching on title, plot, and genres fields"
    docLink: https://www.mongodb.com/docs/atlas/atlas-search/manage-indexes.md
    skillFiles:
      - /path/to/skills/ai-search/SKILL.md

  expected:
    syntax:
      isValidJS: true
      hasAsyncAwait: true

    semantic:
      mustContain:
        - pattern: ".createSearchIndex("
          name: UsesCreateSearchIndex
        - pattern: "mappings"
          name: HasMappings
      mustNotContain:
        - pattern: ".createIndex("
          name: NotCreateIndex

    execution:
      shouldSucceed: true

    result:
      searchIndexExists:
        database: sample_mflix
        collection: movies
        indexName: default

  cleanup:
    dropSearchIndex:
      database: sample_mflix
      collection: movies
      indexName: default
```

Then run `npm run compare` - the new eval case will automatically be included.

### Create a New YAML File (Optional)

For better organization, you can create separate YAML files and load them together:

```yaml
# evalCases/search/static-mappings.yml
- name: Create search index with static field mappings
  tags: [search, index, static-mapping]
  # ... eval case definition ...
```

Update the evaluation runner to load multiple files:

```typescript
// src/evals/search/create-search-index.ts
import { loadEvalCasesFromFile } from "../../utils/loadEvalCases.js";

const evalCases = [
  ...loadEvalCasesFromFile("evalCases/search/index-creation.yml"),
  ...loadEvalCasesFromFile("evalCases/search/static-mappings.yml"),
];

runEvaluation({
  projectName: "Code Gen Experiment",
  evalCases,
}).catch(console.error);
```

## Creating a New Braintrust Project

If you want to create a **separate Braintrust project** for a different MongoDB topic (e.g., "MongoDB Aggregation" instead of "MongoDB Search"), follow these steps:

### 1. Create YAML Eval Cases

```yaml
# evalCases/aggregation/basic-pipeline.yml
- name: Count documents by genre
  tags: [aggregation, grouping]

  input:
    prompt: "Write Node.js code to count documents by genre in the movies collection"
    docLink: https://www.mongodb.com/docs/manual/aggregation/
    skillFiles:
      - src/skills/aggregation.md

  expected:
    syntax:
      isValidJS: true
      hasAsyncAwait: true

    semantic:
      mustContain:
        - pattern: ".aggregate("
          name: UsesAggregate
        - pattern: "$group"
          name: UsesGroup

    execution:
      shouldSucceed: true

  cleanup:
    # Define cleanup actions if needed
```

### 2. Create an Evaluation Runner

```typescript
// src/evals/aggregation/basic-pipeline.ts
import { runEvaluation } from "../../harness/index.js";
import { loadEvalCasesFromFile } from "../../utils/loadEvalCases.js";

const evalCases = loadEvalCasesFromFile("evalCases/aggregation/basic-pipeline.yml");

runEvaluation({
  projectName: "MongoDB Aggregation",  // New Braintrust project
  evalCases,
}).catch(console.error);
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

Scorers are modular functions that evaluate specific aspects of generated code. Each scorer follows a consistent pattern:

### Scorer Structure

```typescript
// src/scorers/result/myCustomScorer.ts
import type { CodeGenScorer, ScoreResult } from "../types.js";

/**
 * Checks if the generated code produces the expected result.
 */
export const myCustomScorer: CodeGenScorer = async (context): Promise<ScoreResult> => {
  const { output, expected, executionResult } = context;

  // Check if this assertion applies
  if (!expected.result?.myCustomCheck) {
    return { name: "Result_MyCustomCheck", score: null };
  }

  // Perform validation
  if (executionResult?.success) {
    // Check the execution output
    const isValid = validateOutput(executionResult.output);
    return {
      name: "Result_MyCustomCheck",
      score: isValid ? 1 : 0,
      metadata: { /* optional debugging info */ }
    };
  }

  return { name: "Result_MyCustomCheck", score: 0 };
};
```

### Scorer Categories

Place your scorer in the appropriate directory:
- **`syntax/`**: Code structure validation (parsing, syntax checks)
- **`semantic/`**: Pattern matching and API usage
- **`execution/`**: Runtime behavior validation
- **`result/`**: MongoDB state verification

### Registering a Scorer

1. Export your scorer from its category's `index.ts`
2. Add it to `src/scorers/index.ts`:

```typescript
// Export the scorer
export { myCustomScorer } from "./result/myCustomScorer.js";

// Add to allScorers array
export const allScorers: CodeGenScorer[] = [
  // ... existing scorers
  myCustomScorer,
];
```

### Extending the Schema

If your scorer needs new expected fields, update `src/schemas/evalCase.ts`:

```typescript
const ResultExpectedSchema = z.object({
  searchIndexExists: SearchIndexExistsSchema,
  myCustomCheck: z.object({
    // Define your expected structure
    expectedValue: z.string(),
  }).optional(),
}).optional();
```

## Architecture Highlights

### YAML-Based Eval Cases

Eval cases are defined declaratively in YAML files and validated with Zod schemas. This approach:
- Separates test definitions from code
- Enables non-developers to contribute test cases
- Provides strong type safety through schema validation
- Makes it easy to version control and review test cases

### Modular Scorer System

Scorers are organized by category and can be added/removed independently:
- Each scorer checks if its expected field exists before running
- Scorers return `null` if they don't apply to a given eval case
- Multiple scorers can run for a single eval case
- Scores are automatically aggregated into category and compound scores

### VM-Based Code Execution

Generated code runs in a sandboxed VM context:
- Prevents access to the file system and network (except MongoDB)
- Provides a controlled environment with only allowed modules
- Captures execution time and errors
- Automatically cleans up MongoDB connections

### Cleanup System

The framework handles MongoDB resource cleanup automatically:
- Runs cleanup before and after each evaluation approach
- Supports multiple cleanup actions (e.g., `dropSearchIndex`)
- Prevents resource conflicts between test runs
- Essential for M0 (free tier) clusters with resource limits

## Current Implementation Status

### Available Scorers

- **Syntax**: `isValidJS`, `hasAsyncAwait`
- **Semantic**: `mustContain`, `mustNotContain`
- **Execution**: `succeeds`
- **Result**: `searchIndexExists`

### Current Eval Cases

- Atlas Search: Index creation with dynamic mapping

## Limitations

### Sequential Execution

Evaluations run sequentially (not in parallel) because:
- MongoDB Atlas Search indexes are created during code execution
- Indexes must be cleaned up between test runs to avoid conflicts
- M0 (free tier) Atlas clusters support a maximum of 3 search indexes

### Atlas Search Index Timing

Atlas Search indexes take time to become available after creation. The `searchIndexExists` scorer handles this with polling, but it adds latency to each test case.

### Sandbox Restrictions

The VM sandbox only allows specific modules (`mongodb`). Generated code that requires other dependencies will fail execution.
