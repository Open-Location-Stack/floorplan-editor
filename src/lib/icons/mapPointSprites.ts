import anchorIcon from "lucide-static/icons/anchor.svg?raw";
import doorClosedIcon from "lucide-static/icons/door-closed.svg?raw";
import doorOpenIcon from "lucide-static/icons/door-open.svg?raw";
import infoIcon from "lucide-static/icons/info.svg?raw";
import linkIcon from "lucide-static/icons/link.svg?raw";
import logInIcon from "lucide-static/icons/log-in.svg?raw";
import logOutIcon from "lucide-static/icons/log-out.svg?raw";
import mapPinIcon from "lucide-static/icons/map-pin.svg?raw";
import monitorIcon from "lucide-static/icons/monitor.svg?raw";
import moveUpRightIcon from "lucide-static/icons/move-up-right.svg?raw";
import moveVerticalIcon from "lucide-static/icons/move-vertical.svg?raw";
import navigationIcon from "lucide-static/icons/navigation.svg?raw";
import refreshCwIcon from "lucide-static/icons/refresh-cw.svg?raw";
import sparklesIcon from "lucide-static/icons/sparkles.svg?raw";
import userRoundIcon from "lucide-static/icons/user-round.svg?raw";
import wavesLadderIcon from "lucide-static/icons/waves-ladder.svg?raw";
import wrenchIcon from "lucide-static/icons/wrench.svg?raw";
import type { MapPointIconId } from "./iconRegistry";

type PointSpriteSpec = {
  id: MapPointIconId;
  color: string;
  svg: string;
};

const POINT_ICON_SIZE = 32;

export const MAP_POINT_ICON_SPECS: PointSpriteSpec[] = [
  { id: "point-icon-nav", color: "#166534", svg: navigationIcon },
  { id: "point-icon-nav-entrance", color: "#0f766e", svg: logInIcon },
  { id: "point-icon-nav-door", color: "#0ea5a4", svg: doorClosedIcon },
  { id: "point-icon-nav-stairs", color: "#0284c7", svg: wavesLadderIcon },
  { id: "point-icon-nav-elevator", color: "#0891b2", svg: moveVerticalIcon },
  { id: "point-icon-nav-escalator", color: "#0369a1", svg: moveUpRightIcon },
  { id: "point-icon-nav-revolving-door", color: "#155e75", svg: refreshCwIcon },
  { id: "point-icon-nav-exit", color: "#047857", svg: logOutIcon },
  { id: "point-icon-connector", color: "#6b7280", svg: linkIcon },
  { id: "point-icon-amenity", color: "#0ea5e9", svg: sparklesIcon },
  { id: "point-icon-anchor", color: "#2563eb", svg: anchorIcon },
  { id: "point-icon-detail", color: "#4f46e5", svg: infoIcon },
  { id: "point-icon-fixture", color: "#7c3aed", svg: wrenchIcon },
  { id: "point-icon-kiosk", color: "#d946ef", svg: monitorIcon },
  { id: "point-icon-occupant", color: "#ea580c", svg: userRoundIcon },
  { id: "point-icon-opening", color: "#16a34a", svg: doorOpenIcon },
  { id: "point-icon-opening-entrance", color: "#0f766e", svg: logInIcon },
  { id: "point-icon-opening-door", color: "#0ea5a4", svg: doorOpenIcon },
  { id: "point-icon-opening-elevator", color: "#0891b2", svg: moveVerticalIcon },
  { id: "point-icon-opening-stairs", color: "#0284c7", svg: wavesLadderIcon },
  { id: "point-icon-opening-escalator", color: "#0369a1", svg: moveUpRightIcon },
  { id: "point-icon-opening-exit", color: "#047857", svg: logOutIcon },
  { id: "point-icon-relationship", color: "#6b7280", svg: linkIcon },
  { id: "point-icon-default", color: "#111827", svg: mapPinIcon },
];

const hexToRgb = (hex: string): [number, number, number] => {
  const value = hex.startsWith("#") ? hex.slice(1) : hex;
  const normalized =
    value.length === 3
      ? value
          .split("")
          .map((entry) => `${entry}${entry}`)
          .join("")
      : value;
  const parsed = Number.parseInt(normalized, 16);
  const red = (parsed >> 16) & 0xff;
  const green = (parsed >> 8) & 0xff;
  const blue = parsed & 0xff;
  return [red, green, blue];
};

const createFallbackImageData = (colorHex: string) => {
  const data = new Uint8Array(POINT_ICON_SIZE * POINT_ICON_SIZE * 4);
  const color = hexToRgb(colorHex);
  for (let y = 6; y < POINT_ICON_SIZE - 6; y += 1) {
    for (let x = 6; x < POINT_ICON_SIZE - 6; x += 1) {
      const offset = (y * POINT_ICON_SIZE + x) * 4;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = 255;
    }
  }
  return {
    width: POINT_ICON_SIZE,
    height: POINT_ICON_SIZE,
    data,
  };
};

const parsePoints = (rawPoints: string): Array<[number, number]> => {
  const numbers = rawPoints
    .trim()
    .split(/[\s,]+/)
    .map((entry) => Number.parseFloat(entry))
    .filter((entry) => Number.isFinite(entry));
  const points: Array<[number, number]> = [];
  for (let index = 0; index < numbers.length - 1; index += 2) {
    const x = numbers[index];
    const y = numbers[index + 1];
    if (typeof x === "number" && typeof y === "number") {
      points.push([x, y]);
    }
  }
  return points;
};

const tintSvg = (svg: string, color: string): string =>
  svg
    .replace(/stroke="(currentColor|#000|black)"/g, `stroke="${color}"`)
    .replace(/stroke="#000000"/g, `stroke="${color}"`);

export const createPointIconImage = (spec: PointSpriteSpec) => {
  if (typeof document === "undefined" || typeof DOMParser === "undefined") {
    return createFallbackImageData(spec.color);
  }

  const canvas = document.createElement("canvas");
  canvas.width = POINT_ICON_SIZE;
  canvas.height = POINT_ICON_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof Path2D === "undefined") {
    return createFallbackImageData(spec.color);
  }

  const svgDoc = new DOMParser().parseFromString(tintSvg(spec.svg, spec.color), "image/svg+xml");
  const svgElement = svgDoc.documentElement;
  const viewBox = svgElement.getAttribute("viewBox")?.split(/\s+/).map(Number.parseFloat) ?? [];
  const viewBoxWidth =
    viewBox.length === 4 && Number.isFinite(viewBox[2]) ? (viewBox[2] ?? 24) : 24;
  const viewBoxHeight =
    viewBox.length === 4 && Number.isFinite(viewBox[3]) ? (viewBox[3] ?? 24) : 24;

  ctx.clearRect(0, 0, POINT_ICON_SIZE, POINT_ICON_SIZE);
  ctx.save();
  ctx.scale(POINT_ICON_SIZE / viewBoxWidth, POINT_ICON_SIZE / viewBoxHeight);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = spec.color;
  ctx.fillStyle = spec.color;

  for (const shape of svgElement.querySelectorAll("path,circle,line,polyline,polygon,rect")) {
    const strokeWidth = Number.parseFloat(shape.getAttribute("stroke-width") ?? "2");
    ctx.lineWidth = Number.isFinite(strokeWidth) ? strokeWidth : 2;

    if (shape.tagName === "path") {
      const d = shape.getAttribute("d");
      if (d) {
        const path = new Path2D(d);
        if (shape.getAttribute("fill") && shape.getAttribute("fill") !== "none") {
          ctx.fill(path);
        }
        if (shape.getAttribute("stroke") !== "none") {
          ctx.stroke(path);
        }
      }
      continue;
    }

    if (shape.tagName === "circle") {
      const cx = Number.parseFloat(shape.getAttribute("cx") ?? "0");
      const cy = Number.parseFloat(shape.getAttribute("cy") ?? "0");
      const r = Number.parseFloat(shape.getAttribute("r") ?? "0");
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      if (shape.getAttribute("fill") && shape.getAttribute("fill") !== "none") {
        ctx.fill();
      }
      if (shape.getAttribute("stroke") !== "none") {
        ctx.stroke();
      }
      continue;
    }

    if (shape.tagName === "line") {
      const x1 = Number.parseFloat(shape.getAttribute("x1") ?? "0");
      const y1 = Number.parseFloat(shape.getAttribute("y1") ?? "0");
      const x2 = Number.parseFloat(shape.getAttribute("x2") ?? "0");
      const y2 = Number.parseFloat(shape.getAttribute("y2") ?? "0");
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      continue;
    }

    if (shape.tagName === "polyline" || shape.tagName === "polygon") {
      const points = parsePoints(shape.getAttribute("points") ?? "");
      const first = points[0];
      if (!first) {
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(first[0], first[1]);
      for (let index = 1; index < points.length; index += 1) {
        const point = points[index];
        if (!point) {
          continue;
        }
        ctx.lineTo(point[0], point[1]);
      }
      if (shape.tagName === "polygon") {
        ctx.closePath();
      }
      if (shape.getAttribute("fill") && shape.getAttribute("fill") !== "none") {
        ctx.fill();
      }
      if (shape.getAttribute("stroke") !== "none") {
        ctx.stroke();
      }
      continue;
    }

    if (shape.tagName === "rect") {
      const x = Number.parseFloat(shape.getAttribute("x") ?? "0");
      const y = Number.parseFloat(shape.getAttribute("y") ?? "0");
      const width = Number.parseFloat(shape.getAttribute("width") ?? "0");
      const height = Number.parseFloat(shape.getAttribute("height") ?? "0");
      if (shape.getAttribute("fill") && shape.getAttribute("fill") !== "none") {
        ctx.fillRect(x, y, width, height);
      }
      if (shape.getAttribute("stroke") !== "none") {
        ctx.strokeRect(x, y, width, height);
      }
    }
  }

  ctx.restore();
  const imageData = ctx.getImageData(0, 0, POINT_ICON_SIZE, POINT_ICON_SIZE);
  return {
    width: POINT_ICON_SIZE,
    height: POINT_ICON_SIZE,
    data: new Uint8Array(imageData.data),
  };
};
