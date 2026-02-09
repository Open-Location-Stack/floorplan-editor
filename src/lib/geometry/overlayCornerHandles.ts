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

  const center: Coordinates = [
    (draggedPoint[0] + fixedPoint[0]) / 2,
    (draggedPoint[1] + fixedPoint[1]) / 2,
  ];
  const draggedMeters = toLocalMeters(draggedPoint, center);
  const diagonalMagnitude = Math.hypot(draggedMeters.x, draggedMeters.y);
  if (diagonalMagnitude < MIN_DIAGONAL_METERS) {
    return corners;
  }

  const halfHeight = diagonalMagnitude / Math.sqrt(1 + ratio ** 2);
  const halfWidth = halfHeight * ratio;

  const signs = cornerSignsByKey[draggedCorner];
  const expectedAngle = Math.atan2(signs.sy * halfHeight, signs.sx * halfWidth);
  const actualAngle = Math.atan2(draggedMeters.y, draggedMeters.x);
  const rotation = actualAngle - expectedAngle;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  const widthVector = { x: cos * halfWidth, y: sin * halfWidth };
  const heightVector = { x: -sin * halfHeight, y: cos * halfHeight };

  const projectCorner = (sx: -1 | 1, sy: -1 | 1): Coordinates =>
    toCoordinates(
      sx * widthVector.x + sy * heightVector.x,
      sx * widthVector.y + sy * heightVector.y,
      center,
    );

  return {
    topLeft: projectCorner(-1, 1),
    topRight: projectCorner(1, 1),
    bottomRight: projectCorner(1, -1),
    bottomLeft: projectCorner(-1, -1),
  };
};
