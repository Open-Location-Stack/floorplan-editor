export const IMDF_CANONICAL_COLLECTION_EXTENSION = ".json";
export const IMDF_LEGACY_COLLECTION_EXTENSION = ".geojson";

export const imdfCollectionFileName = (type: string): string =>
  `${type}${IMDF_CANONICAL_COLLECTION_EXTENSION}`;

export const imdfLegacyCollectionFileName = (type: string): string =>
  `${type}${IMDF_LEGACY_COLLECTION_EXTENSION}`;

export const imdfCollectionFileNameAliases = (type: string): [string, string] => [
  imdfCollectionFileName(type),
  imdfLegacyCollectionFileName(type),
];

export const IMDF_EXTENSION_COLLECTION_TYPES = ["formation_image", "formation_centroid"] as const;

export type ImdfExtensionCollectionType = (typeof IMDF_EXTENSION_COLLECTION_TYPES)[number];

export const imdfExtensionCollectionFileName = (type: ImdfExtensionCollectionType): string =>
  `${type}${IMDF_CANONICAL_COLLECTION_EXTENSION}`;

export const imdfLegacyExtensionCollectionFileName = (type: ImdfExtensionCollectionType): string =>
  `${type}${IMDF_LEGACY_COLLECTION_EXTENSION}`;

export const imdfExtensionCollectionFileNameAliases = (
  type: ImdfExtensionCollectionType,
): [string, string] => [
  imdfExtensionCollectionFileName(type),
  imdfLegacyExtensionCollectionFileName(type),
];

export const resolveAliasFilename = (
  files: Record<string, unknown>,
  aliases: readonly string[],
): string | undefined => aliases.find((name) => name in files);
