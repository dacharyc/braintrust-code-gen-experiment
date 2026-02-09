/**
 * Reference implementations for MongoDB Atlas Search operations
 * These are examples of correct code that LLMs should generate
 */

import { MongoClient } from "mongodb";

// Example 1: Create a basic search index with dynamic mapping
export async function createBasicSearchIndex() {
  const uri = process.env.MONGODB_URI || "";
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const database = client.db("sample_mflix");
    const collection = database.collection("movies");

    const indexName = "default";
    const indexDefinition = {
      mappings: {
        dynamic: true
      }
    };

    const result = await collection.createSearchIndex({
      name: indexName,
      definition: indexDefinition
    });

    console.log(`Search index created: ${result}`);
    return result;
  } finally {
    await client.close();
  }
}

// Example 2: Create a search index with specific field mappings
export async function createFieldSpecificSearchIndex() {
  const uri = process.env.MONGODB_URI || "";
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const database = client.db("sample_mflix");
    const collection = database.collection("movies");

    const indexName = "title_plot_index";
    const indexDefinition = {
      mappings: {
        dynamic: false,
        fields: {
          title: {
            type: "string"
          },
          plot: {
            type: "string"
          }
        }
      }
    };

    const result = await collection.createSearchIndex({
      name: indexName,
      definition: indexDefinition
    });

    console.log(`Search index created: ${result}`);
    return result;
  } finally {
    await client.close();
  }
}

// Example 3: Basic text search query
export async function basicTextSearch() {
  const uri = process.env.MONGODB_URI || "";
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const database = client.db("sample_mflix");
    const collection = database.collection("movies");

    const pipeline = [
      {
        $search: {
          text: {
            query: "baseball",
            path: "plot"
          }
        }
      },
      {
        $limit: 5
      },
      {
        $project: {
          _id: 0,
          title: 1,
          plot: 1
        }
      }
    ];

    const results = await collection.aggregate(pipeline).toArray();
    console.log(`Found ${results.length} results`);
    return results;
  } finally {
    await client.close();
  }
}

// Example 4: Compound search query with must and mustNot
export async function compoundSearchQuery() {
  const uri = process.env.MONGODB_URI || "";
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const database = client.db("sample_mflix");
    const collection = database.collection("movies");

    const pipeline = [
      {
        $search: {
          compound: {
            must: [
              {
                text: {
                  query: "baseball",
                  path: "plot"
                }
              }
            ],
            mustNot: [
              {
                text: {
                  query: ["Comedy", "Romance"],
                  path: "genres"
                }
              }
            ]
          }
        }
      },
      {
        $limit: 3
      },
      {
        $project: {
          _id: 0,
          title: 1,
          plot: 1,
          genres: 1
        }
      }
    ];

    const results = await collection.aggregate(pipeline).toArray();
    console.log(`Found ${results.length} results`);
    return results;
  } finally {
    await client.close();
  }
}

// Example 5: Search query with sorting
export async function searchQueryWithSort() {
  const uri = process.env.MONGODB_URI || "";
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const database = client.db("sample_mflix");
    const collection = database.collection("movies");

    const pipeline = [
      {
        $search: {
          compound: {
            must: [
              {
                text: {
                  query: "baseball",
                  path: "plot"
                }
              }
            ],
            mustNot: [
              {
                text: {
                  query: ["Comedy", "Romance"],
                  path: "genres"
                }
              }
            ]
          },
          sort: {
            released: -1
          }
        }
      },
      {
        $limit: 3
      },
      {
        $project: {
          _id: 0,
          title: 1,
          plot: 1,
          genres: 1,
          released: 1
        }
      }
    ];

    const results = await collection.aggregate(pipeline).toArray();
    console.log(`Found ${results.length} results`);
    return results;
  } finally {
    await client.close();
  }
}

