export type Swatch = { name: string; hex: string };
export type Product = {
  kind: "Makeup" | "Clothing" | "Shoes" | "Bag" | "Jewelry";
  name: string;
  house: string;
  initial: string;
  price: string;
  note: string;
};

export type Look = {
  id: string;
  number: string; // "I", "II", "III"
  name: string;
  occasion: string;
  harmony: number;
  palette: string[]; // 5 hex
  blurb: string;
  why: string;
  products: Product[];
};

export const palette: Swatch[] = [
  { name: "Sand", hex: "#F1E4D2" },
  { name: "Blush", hex: "#E8CFC3" },
  { name: "Taupe", hex: "#D8C7B4" },
  { name: "Champagne", hex: "#C7A66A" },
  { name: "Caramel", hex: "#8A6240" },
  { name: "Espresso", hex: "#3A2118" },
];

export const analysisTags: { k: string; v: string }[] = [
  { k: "Undertone", v: "Warm ivory" },
  { k: "Season", v: "Soft autumn" },
  { k: "Contrast", v: "Low–medium" },
  { k: "Face", v: "Oval, soft angles" },
  { k: "Metal", v: "Brushed gold" },
  { k: "Finish", v: "Matte over gloss" },
];

export const looks: Look[] = [
  {
    id: "golden-hour",
    number: "I",
    name: "Golden Hour",
    occasion: "Daytime",
    harmony: 96,
    palette: ["#F1E4D2", "#E8CFC3", "#D8C7B4", "#C7A66A", "#8A6240"],
    blurb: "Sun-washed neutrals carried by a single, considered gold.",
    why: "Your warm ivory undertone glows against soft sand and a single champagne note — nothing crowds your face.",
    products: [
      { kind: "Makeup", name: "Skin Tint No. 4", house: "Maison Rouge", initial: "R", price: "$58", note: "A dewy second skin, warm-leaning." },
      { kind: "Clothing", name: "Wool Crepe Blazer", house: "Atelier Solène", initial: "S", price: "$1,290", note: "The shoulder line you were drawn to." },
      { kind: "Shoes", name: "Leather Mule, Caramel", house: "Polo & Co.", initial: "P", price: "$420", note: "Quiet height. Walks like a flat." },
      { kind: "Bag", name: "Soft Hobo, Sand", house: "Maison Rouge", initial: "R", price: "$890", note: "A pour of leather, no hardware." },
      { kind: "Jewelry", name: "Brushed Cuff", house: "Orfèvre", initial: "O", price: "$320", note: "Brushed gold flatters more than polish." },
    ],
  },
  {
    id: "ivory-hour",
    number: "II",
    name: "Ivory Hour",
    occasion: "Work",
    harmony: 93,
    palette: ["#FFFDF9", "#F1E4D2", "#D8C7B4", "#8A6240", "#3A2118"],
    blurb: "Cream over taupe with an espresso anchor.",
    why: "An ivory base lengthens the line; the espresso shoe holds it down without harsh contrast on your face.",
    products: [
      { kind: "Makeup", name: "Lip Balm, Petal", house: "Maison Rouge", initial: "R", price: "$36", note: "A nude that warms, never chalks." },
      { kind: "Clothing", name: "Silk Shell, Ivory", house: "Atelier Solène", initial: "S", price: "$540", note: "The exact ivory for your undertone." },
      { kind: "Shoes", name: "Espresso Loafer", house: "Polo & Co.", initial: "P", price: "$520", note: "Slim toe, low vamp." },
      { kind: "Bag", name: "Top Handle, Taupe", house: "Maison Rouge", initial: "R", price: "$1,150", note: "Holds the day quietly." },
      { kind: "Jewelry", name: "Hoop, Brushed Gold", house: "Orfèvre", initial: "O", price: "$280", note: "Skims the jaw, not the shoulder." },
    ],
  },
  {
    id: "espresso-evening",
    number: "III",
    name: "Espresso Evening",
    occasion: "Evening",
    harmony: 91,
    palette: ["#3A2118", "#8A6240", "#C7A66A", "#E8CFC3", "#FFFDF9"],
    blurb: "Deep espresso warmed by a champagne ribbon.",
    why: "Evening light needs warmth, not contrast. Espresso reads softer on you than black.",
    products: [
      { kind: "Makeup", name: "Cream Blush, Rosé Brûlé", house: "Maison Rouge", initial: "R", price: "$48", note: "A glow that survives candlelight." },
      { kind: "Clothing", name: "Espresso Slip Dress", house: "Atelier Solène", initial: "S", price: "$980", note: "Bias-cut. Moves like water." },
      { kind: "Shoes", name: "Champagne Sandal", house: "Polo & Co.", initial: "P", price: "$640", note: "A thin gold strap, nothing more." },
      { kind: "Bag", name: "Mini Clutch, Ivory", house: "Maison Rouge", initial: "R", price: "$720", note: "A bright stop against the espresso." },
      { kind: "Jewelry", name: "Drop Earring", house: "Orfèvre", initial: "O", price: "$410", note: "Length to echo the slip." },
    ],
  },
];

export function getLook(id: string): Look | undefined {
  return looks.find((l) => l.id === id);
}
