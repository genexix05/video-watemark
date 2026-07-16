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
