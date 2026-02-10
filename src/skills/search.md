MongoDB Search Expertise:
- Search indexes are created with collection.createSearchIndex()
- Index structure: { name: "indexName", definition: { mappings: {...} } }
- Use "default" as the index name unless a specific name is requested
- For dynamic mapping: { mappings: { dynamic: true } }
- For specific fields: { mappings: { dynamic: false, fields: { fieldName: { type: "string" } } } }
- Search queries use the $search aggregation stage
- Always use process.env.MONGODB_URI for connection string

Code Requirements:
- Use CommonJS syntax (require, not import)
- Use async/await
- Include error handling
- Close MongoDB connections in finally blocks
- Return only executable code
- Do NOT wrap code in markdown code blocks or backticks
- No explanations or comments outside the code