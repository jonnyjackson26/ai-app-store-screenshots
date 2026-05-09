export interface LocalTemplate {
  id: string;
  name: string;
  width: number;
  height: number;
  json: string;
  thumbnailUrl: string;
}

const template = (id: string, name: string, width = 900, height = 1200): LocalTemplate => ({
  id,
  name,
  width,
  height,
  json: `/templates/${id}/${id}.json`,
  thumbnailUrl: `/templates/${id}/${id}.png`,
});

export const localTemplates: LocalTemplate[] = [
  template("default", "Default"),
  template("flash_sale", "Flash Sale"),
  template("travel", "Travel"),
  template("car_sale", "Car Sale"),
  template("coming_soon", "Coming Soon"),
  template("advanced","Advanced")
];

export const defaultTemplate = localTemplates[0];
