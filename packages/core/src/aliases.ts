const ADJECTIVES = ["Curious", "Sleepy", "Chaotic", "Cosmic", "Witty", "Gentle", "Midnight", "Sunny", "Lowkey", "Electric"];
const ANIMALS: [string, string][] = [
  ["Otter", "🦦"], ["Panda", "🐼"], ["Fox", "🦊"], ["Owl", "🦉"], ["Koala", "🐨"],
  ["Penguin", "🐧"], ["Tiger", "🐯"], ["Dolphin", "🐬"], ["Sloth", "🦥"], ["Raccoon", "🦝"],
];

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function randomAlias() {
  const [animal, avatarEmoji] = pick(ANIMALS);
  return { alias: `${pick(ADJECTIVES)} ${animal}`, avatarEmoji };
}
