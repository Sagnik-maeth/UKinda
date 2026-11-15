import { buildChunks, embed, generateVibe, ProfileInput } from "../src";

const [similarA, similarB, different] = await embed([
  "I love anime and late-night gaming sessions",
  "Big manga fan, I play games till 3am",
  "I wake up at 5 for the gym and protein shakes",
]);

const dot = (first: number[], second: number[]) =>
  first.reduce((sum, value, index) => sum + value * second[index], 0);
const norm = Math.sqrt(dot(similarA, similarA));
const similarScore = dot(similarA, similarB);
const differentScore = dot(similarA, different);

console.log("dim =", similarA.length, "| norm ≈", norm.toFixed(3));
console.log("similar pair  :", similarScore.toFixed(3));
console.log("different pair:", differentScore.toFixed(3));
if (similarA.length !== 768 || Math.abs(norm - 1) > 0.01 || similarScore <= differentScore) {
  throw new Error("Gemini embedding check failed: expected 768-dim unit vectors and higher similarity for the related pair");
}

const sample = ProfileInput.parse({
  year: 2,
  sliders: [2, 4, 5, 5, 2, 5],
  tags: ["anime", "PC gaming", "coding"],
  lookingFor: ["gaming squad"],
  availability: ["late night", "weekends"],
  weekend: "Gaming with friends, then watching anime late.",
  talkAbout: "One Piece theories and co-op games",
  lookingForText: "someone to play games with after class",
});
console.log("chunks:", buildChunks(sample));

const vibe = await generateVibe({
  tags: sample.tags,
  weekend: sample.weekend,
  talkAbout: sample.talkAbout,
  lookingFor: sample.lookingFor,
});
if (!vibe) throw new Error("Gemini vibe check failed; review the warning above and verify the configured model and quota");
console.log("vibe:", vibe);
