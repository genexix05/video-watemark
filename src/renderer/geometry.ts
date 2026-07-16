export interface Point {
  x: number
  y: number
}

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface SnapResult {
  x: number
  y: number
  guides: { horizontal: boolean; vertical: boolean }
}

export const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum)

export const clientToMediaPoint = (
  client: Point,
  stage: Rect,
  mediaWidth: number,
  mediaHeight: number,
): Point => ({
  x: ((client.x - stage.left) / stage.width) * mediaWidth,
  y: ((client.y - stage.top) / stage.height) * mediaHeight,
})

export const proportionalSize = (
  initialWidth: number,
  naturalWidth: number,
  naturalHeight: number,
  deltaX: number,
  deltaY: number,
  minimumWidth: number,
  maximumWidth: number,
): { width: number; height: number } => {
  const ratio = naturalWidth / naturalHeight
  const proposedWidth =
    Math.abs(deltaX) > Math.abs(deltaY * ratio)
      ? initialWidth + deltaX
      : initialWidth + deltaY * ratio
  const width = clamp(proposedWidth, minimumWidth, maximumWidth)
  return { width, height: width / ratio }
}

const snapAxis = (
  position: number,
  size: number,
  containerSize: number,
  threshold: number,
): { value: number; center: boolean } => {
  const candidates = [
    { distance: Math.abs(position), value: 0, center: false },
    {
      distance: Math.abs(position + size - containerSize),
      value: containerSize - size,
      center: false,
    },
    {
      distance: Math.abs(position + size / 2 - containerSize / 2),
      value: (containerSize - size) / 2,
      center: true,
    },
  ].sort((a, b) => a.distance - b.distance)
  const nearest = candidates[0]
  return nearest.distance <= threshold
    ? { value: nearest.value, center: nearest.center }
    : { value: position, center: false }
}

export const snapLayerPosition = (
  x: number,
  y: number,
  width: number,
  height: number,
  mediaWidth: number,
  mediaHeight: number,
  threshold: number,
): SnapResult => {
  const horizontal = snapAxis(y, height, mediaHeight, threshold)
  const vertical = snapAxis(x, width, mediaWidth, threshold)
  return {
    x: vertical.value,
    y: horizontal.value,
    guides: {
      horizontal: horizontal.center,
      vertical: vertical.center,
    },
  }
}
