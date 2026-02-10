import type { Coordinates, OverlayCorners } from "../types";

type CornerKey = keyof OverlayCorners;

const EARTH_RADIUS_METERS = 6_378_137;
const DEG_TO_RAD = Math.PI / 180;
const MIN_DIAGONAL_METERS = 0.25;

const cornerSignsByKey: Record<CornerKey, { sx: -1 | 1; sy: -1 | 1 }> = {
  topLeft: { sx: -1, sy: 1 },
  topRight: { sx: 1, sy: 1 },
  bottomRight: { sx: 1, sy: -1 },
  bottomLeft: { sx: -1, sy: -1 },
};

const oppositeCornerByKey: Record<CornerKey, CornerKey> = {
  topLeft: "bottomRight",
  topRight: "bottomLeft",
  bottomRight: "topLeft",
  bottomLeft: "topRight",
};

const overlayCenter = (corners: OverlayCorners): Coordinates => {
  const points = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  const sum = points.reduce<[number, number]>(
    (acc, value) => [acc[0] + value[0], acc[1] + value[1]],
    [0, 0],
  );
  return [sum[0] / 4, sum[1] / 4];
};

const metersPerLongitude = (latitude: number): number =>
  EARTH_RADIUS_METERS * Math.cos(latitude * DEG_TO_RAD) * DEG_TO_RAD;

const toLocalMeters = (point: Coordinates, center: Coordinates): { x: number; y: number } => ({
  x: (point[0] - center[0]) * metersPerLongitude(center[1]),
  y: (point[1] - center[1]) * EARTH_RADIUS_METERS * DEG_TO_RAD,
});

const toCoordinates = (xMeters: number, yMeters: number, center: Coordinates): Coordinates => [
  center[0] + xMeters / metersPerLongitude(center[1]),
  center[1] + yMeters / (EARTH_RADIUS_METERS * DEG_TO_RAD),
];

const unitVector = (x: number, y: number): { x: number; y: number } | undefined => {
  const length = Math.hypot(x, y);
  if (length < 1e-9) {
    return undefined;
  }

  return {
    x: x / length,
    y: y / length,
  };
};

const distance = (left: { x: number; y: number }, right: { x: number; y: number }): number => {
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  return Math.hypot(dx, dy);
};

const aspectRatio = (corners: OverlayCorners): number => {
  const center = overlayCenter(corners);
  const width = distance(
    toLocalMeters(corners.topLeft, center),
    toLocalMeters(corners.topRight, center),
  );
  const height = distance(
    toLocalMeters(corners.topLeft, center),
    toLocalMeters(corners.bottomLeft, center),
  );
  if (width <= 0 || height <= 0) {
    return 1;
  }

  return width / height;
};

export const transformOverlayFromDraggedCorner = (
  corners: OverlayCorners,
  draggedCorner: CornerKey,
  draggedPoint: Coordinates,
): OverlayCorners => {
  const oppositeCorner = oppositeCornerByKey[draggedCorner];
  const fixedPoint = corners[oppositeCorner];
  const ratio = Math.max(0.05, Math.min(20, aspectRatio(corners)));

  const topLeftMeters = toLocalMeters(corners.topLeft, fixedPoint);
  const topRightMeters = toLocalMeters(corners.topRight, fixedPoint);
  const bottomLeftMeters = toLocalMeters(corners.bottomLeft, fixedPoint);
  const widthDirection = unitVector(
    topRightMeters.x - topLeftMeters.x,
    topRightMeters.y - topLeftMeters.y,
  );
  const heightDirection = unitVector(
    topLeftMeters.x - bottomLeftMeters.x,
    topLeftMeters.y - bottomLeftMeters.y,
  );
  if (!widthDirection || !heightDirection) {
    return corners;
  }

  const draggedMeters = toLocalMeters(draggedPoint, fixedPoint);
  const signs = cornerSignsByKey[draggedCorner];
  const alignedWidth =
    draggedMeters.x * signs.sx * widthDirection.x + draggedMeters.y * signs.sx * widthDirection.y;
  const alignedHeight =
    draggedMeters.x * signs.sy * heightDirection.x + draggedMeters.y * signs.sy * heightDirection.y;
  if (alignedWidth <= 0 && alignedHeight <= 0) {
    return corners;
  }

  const diagonalMagnitude = Math.hypot(alignedWidth, alignedHeight);
  if (diagonalMagnitude < MIN_DIAGONAL_METERS) {
    return corners;
  }

  const height = diagonalMagnitude / Math.sqrt(1 + ratio ** 2);
  const width = height * ratio;
  const halfHeight = height / 2;
  const halfWidth = width / 2;

  const centerMeters = {
    x: signs.sx * widthDirection.x * halfWidth + signs.sy * heightDirection.x * halfHeight,
    y: signs.sx * widthDirection.y * halfWidth + signs.sy * heightDirection.y * halfHeight,
  };

  const widthVector = { x: widthDirection.x * halfWidth, y: widthDirection.y * halfWidth };
  const heightVector = { x: heightDirection.x * halfHeight, y: heightDirection.y * halfHeight };

  const projectCorner = (sx: -1 | 1, sy: -1 | 1): Coordinates => {
    const x = centerMeters.x + sx * widthVector.x + sy * heightVector.x;
    const y = centerMeters.y + sx * widthVector.y + sy * heightVector.y;
    return toCoordinates(x, y, fixedPoint);
  };

  return {
    topLeft: projectCorner(-1, 1),
    topRight: projectCorner(1, 1),
    bottomRight: projectCorner(1, -1),
    bottomLeft: projectCorner(-1, -1),
  };
};
