import { ai, EMBED_DIM, MODELS, withRetry } from "./gemini";

function normalize(vector: number[]) {
  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Error("Gemini returned a non-finite embedding value");
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) throw new Error("Gemini returned a zero-length embedding");
  return vector.map((value) => value / norm);
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const response = await withRetry(() => ai().models.embedContent({
    model: MODELS.embed,
    contents: texts,
    config: {
      taskType: "SEMANTIC_SIMILARITY",
      outputDimensionality: EMBED_DIM,
    },
  }));
  const embeddings = response.embeddings ?? [];
  if (embeddings.length !== texts.length) {
    throw new Error(`Gemini returned ${embeddings.length} embeddings for ${texts.length} texts`);
  }
  return embeddings.map((embedding, index) => {
    const values = embedding.values;
    if (!values || values.length !== EMBED_DIM) {
      throw new Error(`Gemini returned an invalid embedding at index ${index}`);
    }
    return normalize(values);
  });
}
