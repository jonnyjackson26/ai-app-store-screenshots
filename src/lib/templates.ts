export interface LocalTemplate {
  id: string;
  json: string;
  thumbnailUrl: string;
}

export const DEFAULT_TEMPLATE_ID = "default";

export const defaultTemplate: LocalTemplate = {
  id: DEFAULT_TEMPLATE_ID,
  json: `/templates/${DEFAULT_TEMPLATE_ID}/${DEFAULT_TEMPLATE_ID}.json`,
  thumbnailUrl: `/templates/${DEFAULT_TEMPLATE_ID}/${DEFAULT_TEMPLATE_ID}.png`,
};
