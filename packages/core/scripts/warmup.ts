import { embed } from "../src/embed";

const [vector] = await embed(["hello campus"]);
const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
console.log("Gemini ready, dim =", vector.length, "| norm ≈", norm.toFixed(3));
