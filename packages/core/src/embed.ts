type FeatureExtractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: true },
) => Promise<{ tolist(): number[][] }>;

type EmbedGlobal = typeof globalThis & {
  __campusExtractor?: Promise<FeatureExtractor>;
};

async function localEmbed(texts: string[]): Promise<number[][]> {
  const global = globalThis as EmbedGlobal;
  if (!global.__campusExtractor) {
    const { pipeline } = await import("@huggingface/transformers");
    global.__campusExtractor = pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
    ) as Promise<FeatureExtractor>;
  }
  const extractor = await global.__campusExtractor;
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  const vectors = output.tolist();
  validateVectors(vectors, texts.length);
  return vectors;
}

async function openaiEmbed(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for the OpenAI embedding provider");
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts, dimensions: 384 }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI embedding request failed (${response.status}): ${await response.text()}`);
  }
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("data" in result) || !Array.isArray(result.data)) {
    throw new Error("OpenAI embedding response has an invalid shape");
  }
  const vectors = result.data.map((item: { embedding: number[] }) => item.embedding);
  validateVectors(vectors, texts.length);
  return vectors;
}

function validateVectors(vectors: number[][], expectedCount: number) {
  if (
    vectors.length !== expectedCount ||
    vectors.some((vector) => vector.length !== 384 || vector.some((value) => !Number.isFinite(value)))
  ) {
    throw new Error("Embedding provider returned an invalid vector shape");
  }
}

export async function embed(texts: string[]) {
  if (texts.length === 0) return [];
  return process.env.EMBEDDING_PROVIDER === "openai"
    ? openaiEmbed(texts)
    : localEmbed(texts);
}
