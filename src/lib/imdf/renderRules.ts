import { getImdfSchemaRule, isSupportedImdfType } from "./schema";

const defaultSortOrder = 50;

export const sortOrderForFeatureType = (type: string | undefined): number => {
  if (!type || !isSupportedImdfType(type)) {
    return defaultSortOrder;
  }

  return getImdfSchemaRule(type).sortOrder;
};
