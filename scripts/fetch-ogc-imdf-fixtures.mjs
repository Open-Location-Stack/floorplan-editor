import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import JSZip from "jszip";

const OUTPUT_DIR = "test-buildings";
const METADATA_FILE = "ogc-imdf-sources.json";

const SOURCES = [
  {
    id: "pdhoward-venue",
    repo: "pdhoward/imdf",
    commit: "2393db97ced4e00cb42d4f39714c6e14234a8a87",
    directory: "venue",
    outputZip: "ogc-imdf-pdhoward-venue.zip",
    classify: "canonical-valid",
    files: [
      "address.geojson",
      "amenity.geojson",
      "anchor.geojson",
      "building.geojson",
      "footprint.geojson",
      "level.geojson",
      "manifest.json",
      "occupant.geojson",
      "opening.geojson",
      "unit.geojson",
      "venue.geojson",
    ],
  },
  {
    id: "open-imdf-demo",
    repo: "CUSCRD/Open-IMDF",
    commit: "271801f84cbe6f222de04eb056a43cd048c44ce6",
    directory: "dev_demo_sample_data/data",
    outputZip: "ogc-imdf-open-imdf-demo.zip",
    classify: "canonical-valid",
    files: [
      "addresses.json",
      "amenities.json",
      "anchors.json",
      "buildings.json",
      "details.json",
      "fixtures.json",
      "footprints.json",
      "geofences.json",
      "kiosks.json",
      "levels.json",
      "manifests.json",
      "occupants.json",
      "openings.json",
      "relationships.json",
      "sections.json",
      "units.json",
      "venues.json",
    ],
  },
];

const OPEN_IMDF_NAME_MAP = {
  "manifests.json": "manifest.json",
  "addresses.json": "address.json",
  "amenities.json": "amenity.json",
  "anchors.json": "anchor.json",
  "buildings.json": "building.json",
  "details.json": "detail.json",
  "fixtures.json": "fixture.json",
  "footprints.json": "footprint.json",
  "geofences.json": "geofence.json",
  "kiosks.json": "kiosk.json",
  "levels.json": "level.json",
  "occupants.json": "occupant.json",
  "openings.json": "opening.json",
  "relationships.json": "relationship.json",
  "sections.json": "section.json",
  "units.json": "unit.json",
  "venues.json": "venue.json",
};

const isJsonFile = (name) => name.endsWith(".json") || name.endsWith(".geojson");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchBuffer = async (url) => {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "formation-floorplan-editor-fixture-fetcher",
        },
      });
      if (!response.ok) {
        throw new Error(`Request failed (${response.status}) for ${url}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < 4) {
        await sleep(500 * attempt);
      }
    }
  }
  const details = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Failed to download ${url}: ${details}`);
};

const renameTargetFile = (sourceId, originalName) => {
  if (sourceId === "open-imdf-demo") {
    return OPEN_IMDF_NAME_MAP[originalName] ?? originalName;
  }
  return originalName;
};

const fetchSourceFiles = async (source) => {
  const files = [];
  for (const sourceName of source.files) {
    if (!isJsonFile(sourceName)) {
      continue;
    }
    const url = `https://raw.githubusercontent.com/${source.repo}/${source.commit}/${source.directory}/${sourceName}`;
    const bytes = await fetchBuffer(url);
    files.push({
      sourceName,
      targetName: renameTargetFile(source.id, sourceName),
      bytes,
    });
  }
  files.sort((left, right) => left.targetName.localeCompare(right.targetName));
  return files;
};

const createFixtureArchive = async (source, files, outputRoot) => {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.targetName, file.bytes);
  }
  const archive = await zip.generateAsync({ type: "uint8array" });
  const outputPath = path.join(outputRoot, source.outputZip);
  await writeFile(outputPath, archive);
  return outputPath;
};

const main = async () => {
  const outputRoot = path.resolve(process.cwd(), OUTPUT_DIR);
  await mkdir(outputRoot, { recursive: true });

  const metadata = {
    generatedAt: new Date().toISOString(),
    generator: "scripts/fetch-ogc-imdf-fixtures.mjs",
    sources: [],
  };

  for (const source of SOURCES) {
    const files = await fetchSourceFiles(source);
    if (files.length === 0) {
      throw new Error(`No JSON fixtures found for source ${source.id}.`);
    }
    const archivePath = await createFixtureArchive(source, files, outputRoot);
    metadata.sources.push({
      id: source.id,
      classification: source.classify,
      repository: source.repo,
      commit: source.commit,
      directory: source.directory,
      sourceUrl: `https://github.com/${source.repo}/tree/${source.commit}/${source.directory}`,
      archive: path.relative(process.cwd(), archivePath),
      files: files.map((file) => ({
        sourceName: file.sourceName,
        archiveName: file.targetName,
      })),
    });
    console.log(`Created ${path.relative(process.cwd(), archivePath)} (${files.length} files).`);
  }

  const metadataPath = path.join(outputRoot, METADATA_FILE);
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(process.cwd(), metadataPath)}.`);
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
