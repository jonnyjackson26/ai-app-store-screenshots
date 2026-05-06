export interface LocalTemplate {
  id: string;
  name: string;
  width: number;
  height: number;
  json: string;
  thumbnailUrl: string;
}

export const localTemplates: LocalTemplate[] = [
  {
    id: "flash_sale",
    name: "Flash Sale",
    width: 900,
    height: 1200,
    json: "/flash_sale.json",
    thumbnailUrl: "/flash_sale.png",
  },
  {
    id: "travel",
    name: "Travel",
    width: 900,
    height: 1200,
    json: "/travel.json",
    thumbnailUrl: "/travel.png",
  },
  {
    id: "car_sale",
    name: "Car Sale",
    width: 900,
    height: 1200,
    json: "/car_sale.json",
    thumbnailUrl: "/car_sale.png",
  },
  {
    id: "coming_soon",
    name: "Coming Soon",
    width: 900,
    height: 1200,
    json: "/coming_soon.json",
    thumbnailUrl: "/coming_soon.png",
  },
];
