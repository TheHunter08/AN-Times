import { colors } from '../design-system/colors'

export interface LoaderProps {
  size?: number
}

export function Loader({ size = 18 }: LoaderProps) {
  return (
    <>
      <div
        style={{
          width: size, height: size,
          border: `2px solid rgba(255,255,255,.15)`,
          borderTopColor: colors.primary.base,
          borderRadius: '50%',
          animation: 'uiv2Spin .6s linear infinite',
        }}
      />
      <style>{`@keyframes uiv2Spin { to { transform: rotate(360deg) } }`}</style>
    </>
  )
}

export function Skeleton({ width = '100%', height = 14 }: { width?: string | number; height?: number }) {
  return (
    <div
      style={{
        width, height,
        borderRadius: 8,
        background: `linear-gradient(90deg, ${colors.bg[600]} 25%, ${colors.bg[500]} 50%, ${colors.bg[600]} 75%)`,
        backgroundSize: '200% 100%',
        animation: 'uiv2Shimmer 1.5s ease infinite',
      }}
    >
      <style>{`@keyframes uiv2Shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
    </div>
  )
}
