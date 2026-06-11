export type Shade = { name: string; hex: string };

export const SHADES: Record<"lip" | "blush" | "eye", Shade[]> = {
  lip: [
    { name: "Bare Fig", hex: "#C08A77" },
    { name: "Petal Veil", hex: "#CE8E83" },
    { name: "Terracotta", hex: "#C2502E" },
    { name: "Sienna", hex: "#A8432A" },
    { name: "Rosewood", hex: "#9E4A44" },
    { name: "Brick", hex: "#8E3B26" },
    { name: "Espresso", hex: "#7E2F1B" },
    { name: "Noir Cherry", hex: "#6B2230" },
  ],
  blush: [
    { name: "Shell", hex: "#E8B49E" },
    { name: "Apricot", hex: "#E58A6B" },
    { name: "Peach Glow", hex: "#E0703F" },
    { name: "Dusty Rose", hex: "#C97B6E" },
    { name: "Terra", hex: "#B25E3F" },
    { name: "Umber", hex: "#A6512F" },
  ],
  eye: [
    { name: "Champagne", hex: "#C9A87A" },
    { name: "Fawn", hex: "#B08F66" },
    { name: "Bronze", hex: "#B5722F" },
    { name: "Caramel", hex: "#8A6240" },
    { name: "Umber", hex: "#6B4226" },
    { name: "Espresso", hex: "#4A2A1A" },
  ],
};

export type LookGrade = {
  id: string;
  number: string;
  title: string;
  filter: string;
  bloom: number;
  wash: string; // gradient
  washBlend: "overlay" | "soft-light";
  defaults: { lip: string; blush: string; eye: string };
};

export const LOOK_GRADES: LookGrade[] = [
  {
    id: "golden-hour",
    number: "I",
    title: "Golden Hour",
    filter: "saturate(1.42) contrast(1.10) brightness(1.07) sepia(0.32)",
    bloom: 0.32,
    wash: "radial-gradient(ellipse at 50% 45%, rgba(220,160,90,0.28), rgba(120,60,20,0.05) 70%)",
    washBlend: "soft-light",
    defaults: { lip: "#C2502E", blush: "#E0703F", eye: "#B5722F" },
  },
  {
    id: "ivory-hour",
    number: "II",
    title: "Ivory Hour",
    filter: "brightness(1.13) saturate(0.86) contrast(0.97) sepia(0.07)",
    bloom: 0.5,
    wash: "radial-gradient(ellipse at 50% 40%, rgba(255,250,235,0.32), rgba(200,180,150,0.06) 70%)",
    washBlend: "soft-light",
    defaults: { lip: "#CE8E83", blush: "#E8B49E", eye: "#C9A87A" },
  },
  {
    id: "espresso-evening",
    number: "III",
    title: "Espresso Evening",
    filter: "brightness(0.97) contrast(1.22) saturate(1.16) sepia(0.18) hue-rotate(-6deg)",
    bloom: 0.2,
    wash: "radial-gradient(ellipse at 50% 50%, rgba(120,60,40,0.32), rgba(20,10,5,0.18) 75%)",
    washBlend: "overlay",
    defaults: { lip: "#6B2230", blush: "#B25E3F", eye: "#4A2A1A" },
  },
];
