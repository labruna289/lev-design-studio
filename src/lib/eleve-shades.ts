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

/* ============================================================
   NYX-style product catalog (used by the live AR mirror).
   categories → products → finishes → shades.
   ============================================================ */

export type Finish =
  | "matte" | "satin" | "cream" | "glossy" | "shimmer"
  | "metallic" | "sheer" | "dewy" | "powder" | "pearl";

export type Category = "face" | "eyes" | "lips";

export type MakeupProduct = {
  id: string;
  name: string;
  category: Category;
  paint: string;            // painter key in makeup-canvas
  finishes: Finish[];       // first = default
  shades: Shade[];
  styles?: string[];        // placement variants (eyeshadow / eyeliner)
  layer: number;            // render order (lower = earlier / underneath)
  defaultIntensity: number;
};

const P = (name: string, hex: string): Shade => ({ name, hex });

export const CATALOG: Record<Category, MakeupProduct[]> = {
  face: [
    {
      id: "skin-tint", name: "Skin Tint", category: "face", paint: "skinTint",
      finishes: ["dewy", "satin", "matte"], layer: 0, defaultIntensity: 0.5,
      shades: [
        P("Fair", "#F0D2BE"), P("Light", "#E8C0A4"), P("Medium", "#D2A074"),
        P("Tan", "#B97E50"), P("Deep", "#8A5836"), P("Espresso", "#5E3A24"),
      ],
    },
    {
      id: "sun-stick", name: "Bronzer", category: "face", paint: "bronzer",
      finishes: ["matte", "shimmer"], layer: 1, defaultIntensity: 0.55,
      shades: [
        P("Light", "#C49C70"), P("Medium", "#B07C4E"), P("Deep", "#8A5A34"),
        P("Cool", "#9A7050"), P("Warm", "#B5702E"), P("Sunkissed", "#C77C3A"),
      ],
    },
    {
      id: "wonder-contour", name: "Contour", category: "face", paint: "contour",
      finishes: ["matte"], layer: 2, defaultIntensity: 0.5,
      shades: [
        P("Fair", "#B79A86"), P("Light", "#A98A72"), P("Light-Med", "#9C7C64"),
        P("Med", "#8E6E58"), P("Med-Tan", "#7E614C"), P("Tan", "#6E5340"),
        P("Deep", "#5A4232"), P("Rich", "#4A3528"),
      ],
    },
    {
      id: "sweet-cheeks", name: "Blush", category: "face", paint: "blush",
      finishes: ["dewy", "powder", "shimmer"], layer: 3, defaultIntensity: 0.7,
      shades: [
        P("Shell", "#E8B49E"), P("Apricot", "#E58A6B"), P("Peach Glow", "#E0703F"),
        P("Dusty Rose", "#C97B6E"), P("Berry", "#B25670"), P("Terra", "#B25E3F"),
        P("Umber", "#A6512F"),
      ],
    },
    {
      id: "jumbo-glow", name: "Highlighter", category: "face", paint: "highlighter",
      finishes: ["pearl", "shimmer", "metallic"], layer: 6, defaultIntensity: 0.55,
      shades: [
        P("Pearl", "#FBF1E2"), P("Champagne", "#F4DEBC"),
        P("Rose Gold", "#F0C9AE"), P("Gold", "#EFCB86"),
      ],
    },
  ],
  eyes: [
    {
      id: "micro-brow", name: "Brows", category: "eyes", paint: "brows",
      finishes: ["satin", "matte"], layer: 3.5, defaultIntensity: 0.55,
      shades: [
        P("Taupe", "#8A7156"), P("Blonde", "#A88A64"), P("Soft Brown", "#6E5640"),
        P("Brown", "#5A4230"), P("Auburn", "#5E3826"), P("Brunette", "#4A3424"),
        P("Espresso", "#3A2A1E"), P("Black", "#241A14"), P("Ash", "#6A5C50"),
        P("Caramel", "#7E5E3E"), P("Cool", "#5E4E40"), P("Warm", "#6E4E32"),
      ],
    },
    {
      id: "ultimate-shadow", name: "Eyeshadow", category: "eyes", paint: "eyeshadow",
      finishes: ["satin", "matte", "shimmer", "metallic"], layer: 4, defaultIntensity: 0.7,
      styles: ["lid", "halo", "smoky", "outerV", "fullCrease"],
      shades: [
        P("Champagne", "#C9A87A"), P("Fawn", "#B08F66"), P("Bronze", "#B5722F"),
        P("Caramel", "#8A6240"), P("Umber", "#6B4226"), P("Espresso", "#4A2A1A"),
        P("Taupe", "#9A8472"), P("Mauve", "#A8807E"), P("Rose", "#B47A6E"),
        P("Plum", "#6E4452"), P("Slate", "#6A6E78"), P("Forest", "#4E5A44"),
        P("Navy", "#3C4258"), P("Gold", "#C79A3C"), P("Copper", "#A85A32"),
        P("Charcoal", "#2E2A28"),
      ],
    },
    {
      id: "epic-ink", name: "Eyeliner", category: "eyes", paint: "eyeliner",
      finishes: ["matte", "metallic"], layer: 5, defaultIntensity: 0.9,
      styles: ["thin", "winged", "tightline", "graphic"],
      shades: [
        P("Black", "#14100E"), P("Brown", "#3A2820"), P("Bronze", "#7A5A2E"),
        P("Espresso", "#2A1C14"), P("Plum", "#3E2230"), P("Navy", "#1E2438"),
        P("Forest", "#1E2A1E"), P("Teal", "#14403E"), P("Burgundy", "#3A1820"),
        P("Grey", "#4A4642"), P("White", "#F2EAD8"), P("Gold", "#B5862E"),
        P("Cobalt", "#1A3A6E"), P("Emerald", "#145038"), P("Copper", "#8A4A22"),
      ],
    },
    {
      id: "epic-lash", name: "Mascara", category: "eyes", paint: "mascara",
      finishes: ["matte", "glossy"], layer: 5.5, defaultIntensity: 0.85,
      shades: [
        P("Black", "#0A0A0A"), P("Brown", "#2A1C14"),
        P("Blue", "#16223E"), P("Plum", "#2E1626"),
      ],
    },
  ],
  lips: [
    {
      id: "line-loud", name: "Lip Liner", category: "lips", paint: "lipLiner",
      finishes: ["matte", "satin"], layer: 7, defaultIntensity: 0.7,
      shades: [
        P("Nude", "#A8765E"), P("Spice", "#9A4A30"), P("Mauve", "#8E5A52"),
        P("Rosewood", "#7E3A36"), P("Brick", "#6E2C1C"), P("Cocoa", "#5A3424"),
        P("Berry", "#6E2438"), P("Terracotta", "#A8482A"), P("Plum", "#5A2E3E"),
        P("Cool Brown", "#6A4434"), P("Deep Red", "#5E2018"), P("Pink", "#A85E62"),
      ],
    },
    {
      id: "shine-loud", name: "Lipstick", category: "lips", paint: "lipstick",
      finishes: ["satin", "matte", "cream", "glossy"], layer: 8, defaultIntensity: 0.85,
      shades: [
        P("Bare Fig", "#C08A77"), P("Petal Veil", "#CE8E83"), P("Terracotta", "#C2502E"),
        P("Sienna", "#A8432A"), P("Rosewood", "#9E4A44"), P("Brick", "#8E3B26"),
        P("Espresso", "#7E2F1B"), P("Noir Cherry", "#6B2230"), P("Mauve Pink", "#B56F75"),
        P("Coral", "#D85A47"), P("Berry", "#8E2E48"), P("Nude Beige", "#B98268"),
      ],
    },
    {
      id: "butter-gloss", name: "Lip Gloss", category: "lips", paint: "lipGloss",
      finishes: ["glossy", "sheer", "shimmer"], layer: 9, defaultIntensity: 0.8,
      shades: [
        P("Clear", "#FFFFFF"), P("Sugar Glass", "#E9C9C4"), P("Praline", "#C98F7A"),
        P("Crème Brûlée", "#C77A5E"), P("Madeleine", "#D88A6E"), P("Tiramisu", "#A85E4A"),
        P("Cherry", "#B23A44"), P("Berry", "#9A3A5A"), P("Fortune Cookie", "#D0A088"),
        P("Marshmallow", "#E7B9B4"),
      ],
    },
  ],
};

export const ALL_PRODUCTS: MakeupProduct[] = [
  ...CATALOG.face, ...CATALOG.eyes, ...CATALOG.lips,
];
export const PRODUCTS_BY_ID: Record<string, MakeupProduct> =
  Object.fromEntries(ALL_PRODUCTS.map((p) => [p.id, p]));

export type LiveProductState = {
  shadeHex: string;
  finish: Finish;
  intensity: number;
  enabled: boolean;
  style?: string;
};

/* A curated default "look" preloaded when the live mirror opens —
   a soft warm everyday face that shows off several products. */
export const DEFAULT_LIVE_LOOK: Record<string, LiveProductState> = {
  "shine-loud":   { shadeHex: "#C2502E", finish: "satin",  intensity: 0.85, enabled: true },
  "sweet-cheeks": { shadeHex: "#E58A6B", finish: "dewy",   intensity: 0.6,  enabled: true },
  "ultimate-shadow": { shadeHex: "#B08F66", finish: "satin", intensity: 0.65, enabled: true, style: "lid" },
  "micro-brow":   { shadeHex: "#6E5640", finish: "satin",  intensity: 0.5,  enabled: true },
  "epic-lash":    { shadeHex: "#0A0A0A", finish: "matte",  intensity: 0.8,  enabled: true },
  "jumbo-glow":   { shadeHex: "#F4DEBC", finish: "pearl",  intensity: 0.5,  enabled: true },
};

/* Curated full-face looks (NYX-style one-tap). */
export const LIVE_LOOKS: { id: string; title: string; products: Record<string, LiveProductState> }[] = [
  {
    id: "angel-face", title: "Angel Face",
    products: {
      "shine-loud": { shadeHex: "#CE8E83", finish: "glossy", intensity: 0.8, enabled: true },
      "sweet-cheeks": { shadeHex: "#E8B49E", finish: "dewy", intensity: 0.55, enabled: true },
      "ultimate-shadow": { shadeHex: "#C9A87A", finish: "shimmer", intensity: 0.6, enabled: true, style: "lid" },
      "jumbo-glow": { shadeHex: "#FBF1E2", finish: "shimmer", intensity: 0.6, enabled: true },
      "micro-brow": { shadeHex: "#8A7156", finish: "satin", intensity: 0.45, enabled: true },
    },
  },
  {
    id: "ego-glare", title: "Ego Glare",
    products: {
      "shine-loud": { shadeHex: "#6B2230", finish: "matte", intensity: 0.9, enabled: true },
      "ultimate-shadow": { shadeHex: "#4A2A1A", finish: "metallic", intensity: 0.8, enabled: true, style: "smoky" },
      "epic-ink": { shadeHex: "#14100E", finish: "matte", intensity: 0.95, enabled: true, style: "winged" },
      "epic-lash": { shadeHex: "#0A0A0A", finish: "matte", intensity: 0.9, enabled: true },
      "wonder-contour": { shadeHex: "#7E614C", finish: "matte", intensity: 0.5, enabled: true },
    },
  },
  {
    id: "salty-siren", title: "Salty Siren",
    products: {
      "shine-loud": { shadeHex: "#D85A47", finish: "glossy", intensity: 0.85, enabled: true },
      "sweet-cheeks": { shadeHex: "#E0703F", finish: "shimmer", intensity: 0.6, enabled: true },
      "sun-stick": { shadeHex: "#B5702E", finish: "shimmer", intensity: 0.6, enabled: true },
      "ultimate-shadow": { shadeHex: "#B5722F", finish: "shimmer", intensity: 0.65, enabled: true, style: "halo" },
      "jumbo-glow": { shadeHex: "#EFCB86", finish: "metallic", intensity: 0.6, enabled: true },
    },
  },
];
