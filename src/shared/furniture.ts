// Curated furniture catalog for the CEO suite. Sizes are in tiles.
export type FurnitureDef = {
  type: string;
  name: string;
  w: number;
  h: number;
  solid: boolean;
  wall?: boolean;      // must be placed on the top (wall) row of the room
  layer: "floor" | "object";
  variants: number;
  category: "Desks & seating" | "Decor" | "Storage" | "Lighting" | "Wall";
};

export const FURNITURE: FurnitureDef[] = [
  { type: "desk", name: "Work desk", w: 3, h: 1, solid: true, layer: "object", variants: 2, category: "Desks & seating" },
  { type: "chair", name: "Office chair", w: 1, h: 1, solid: false, layer: "object", variants: 3, category: "Desks & seating" },
  { type: "couch", name: "Lounge couch", w: 3, h: 1, solid: true, layer: "object", variants: 3, category: "Desks & seating" },
  { type: "armchair", name: "Armchair", w: 1, h: 1, solid: true, layer: "object", variants: 3, category: "Desks & seating" },
  { type: "coffee_table", name: "Coffee table", w: 2, h: 1, solid: true, layer: "object", variants: 1, category: "Desks & seating" },
  { type: "plant", name: "Potted plant", w: 1, h: 1, solid: true, layer: "object", variants: 1, category: "Decor" },
  { type: "tall_plant", name: "Fiddle-leaf fig", w: 1, h: 1, solid: true, layer: "object", variants: 1, category: "Decor" },
  { type: "rug", name: "Area rug", w: 4, h: 2, solid: false, layer: "floor", variants: 3, category: "Decor" },
  { type: "rug_round", name: "Round rug", w: 2, h: 2, solid: false, layer: "floor", variants: 3, category: "Decor" },
  { type: "globe", name: "Desk globe", w: 1, h: 1, solid: true, layer: "object", variants: 1, category: "Decor" },
  { type: "aquarium", name: "Aquarium", w: 2, h: 1, solid: true, layer: "object", variants: 1, category: "Decor" },
  { type: "bookshelf", name: "Bookshelf", w: 2, h: 2, solid: true, layer: "object", variants: 1, category: "Storage" },
  { type: "trophy_case", name: "Trophy case", w: 2, h: 2, solid: true, layer: "object", variants: 1, category: "Storage" },
  { type: "floor_lamp", name: "Floor lamp", w: 1, h: 1, solid: true, layer: "object", variants: 2, category: "Lighting" },
  { type: "painting", name: "Framed painting", w: 2, h: 1, solid: true, wall: true, layer: "object", variants: 3, category: "Wall" },
  { type: "logo_wall", name: "Company logo sign", w: 2, h: 1, solid: true, wall: true, layer: "object", variants: 1, category: "Wall" },
  { type: "clock", name: "Wall clock", w: 1, h: 1, solid: true, wall: true, layer: "object", variants: 1, category: "Wall" },
  { type: "window", name: "Window", w: 2, h: 1, solid: true, wall: true, layer: "object", variants: 1, category: "Wall" },
];

export const furnitureDef = (t: string) => FURNITURE.find((f) => f.type === t);

export const DEFAULT_CEO_LAYOUT = [
  { itemType: "rug", x: 29, y: 7, variant: 0 },
  { itemType: "couch", x: 27, y: 9, variant: 0 },
  { itemType: "armchair", x: 26, y: 7, variant: 0 },
  { itemType: "coffee_table", x: 27, y: 7, variant: 0 },
  { itemType: "bookshelf", x: 26, y: 2, variant: 0 },
  { itemType: "tall_plant", x: 39, y: 4, variant: 0 },
  { itemType: "floor_lamp", x: 39, y: 9, variant: 0 },
  { itemType: "painting", x: 33, y: 1, variant: 1 },
  { itemType: "window", x: 30, y: 1, variant: 0 },
  { itemType: "globe", x: 35, y: 4, variant: 0 },
];
