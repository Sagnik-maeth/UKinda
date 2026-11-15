import { embed } from "../src/embed";

const [vector] = await embed(["hello campus"]);
console.log("model ready, dim =", vector.length);
