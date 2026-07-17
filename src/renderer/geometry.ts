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

export interface LayerGeometry {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  naturalWidth: number
  naturalHeight: number
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

export const constrainLayerGeometry = (
  layer: LayerGeometry,
  mediaWidth: number,
  mediaHeight: number,
): Pick<LayerGeometry, 'x' | 'y' | 'width' | 'height'> => {
  const ratio = layer.naturalWidth / layer.naturalHeight
  const radians = (layer.rotation * Math.PI) / 180
  const cosine = Math.abs(Math.cos(radians))
  const sine = Math.abs(Math.sin(radians))
  const rotatedWidthFactor = cosine + sine / ratio
  const rotatedHeightFactor = sine + cosine / ratio
  const maximumWidth = Math.min(
    mediaWidth / rotatedWidthFactor,
    mediaHeight / rotatedHeightFactor,
  )
  const minimumWidth = Math.min(Math.max(8, ratio * 8), maximumWidth)
  const width = clamp(layer.width, minimumWidth, maximumWidth)
  const height = width / ratio
  const boundsWidth = width * rotatedWidthFactor
  const boundsHeight = width * rotatedHeightFactor
  const offsetX = (boundsWidth - width) / 2
  const offsetY = (boundsHeight - height) / 2

  return {
    width,
    height,
    x: clamp(layer.x, offsetX, mediaWidth - width - offsetX),
    y: clamp(layer.y, offsetY, mediaHeight - height - offsetY),
  }
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
