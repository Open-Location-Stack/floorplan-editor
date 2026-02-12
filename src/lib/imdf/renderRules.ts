import { getImdfSchemaRule, isKnownImdfType } from "./schema";

const defaultSortOrder = 50;

export const sortOrderForFeatureType = (type: string | undefined): number => {
  if (!type || !isKnownImdfType(type)) {
    return defaultSortOrder;
  }

  return getImdfSchemaRule(type).sortOrder;
};
