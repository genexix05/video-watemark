import type { SVGProps } from 'react'

export type IconName =
  | 'add'
  | 'back'
  | 'chevronDown'
  | 'chevronUp'
  | 'clock'
  | 'eye'
  | 'eyeOff'
  | 'image'
  | 'layers'
  | 'pause'
  | 'play'
  | 'rotate'
  | 'trash'
  | 'upload'
  | 'video'

const paths: Record<IconName, React.ReactNode> = {
  add: <><path d="M12 5v14M5 12h14" /></>,
  back: <><path d="m15 18-6-6 6-6" /></>,
  chevronDown: <><path d="m8 10 4 4 4-4" /></>,
  chevronUp: <><path d="m8 14 4-4 4 4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
  eyeOff: <><path d="m3 3 18 18M10.6 6.2A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2.1 2.8M6.3 7.3C3.8 9.1 2.5 12 2.5 12s3.5 6 9.5 6a9 9 0 0 0 3-.5" /><path d="M10.2 10.2a2.5 2.5 0 0 0 3.6 3.6" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m3 16 5-5 4 4 2-2 7 7" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
  pause: <><path d="M9 7v10M15 7v10" /></>,
  play: <><path d="m9 7 8 5-8 5V7Z" /></>,
  rotate: <><path d="M20 11a8 8 0 1 0-2.3 6.7M20 5v6h-6" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></>,
  upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5M5 14v5h14v-5" /></>,
  video: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></>,
}

export function Icon({
  name,
  ...props
}: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      viewBox="0 0 24 24"
      width="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      {...props}
    >
      {paths[name]}
    </svg>
  )
}
