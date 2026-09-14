import cn from 'classnames'
import Image from 'next/image'

export const LoadingSpinner = ({
  className,
  size = 'md',
  text = null,
  heightClassName = 'h-full',
}) => {
  const widthHeight =
    size === 'xxs'
      ? 24
      : size === 'xs'
      ? 30
      : size === 'sm'
      ? 40
      : size === 'md'
      ? 50
      : size === 'lg'
      ? 100
      : 60
  return (
    <div
      className={cn(
        'flex max-h-full flex-col items-center justify-center',
        heightClassName,
        className
      )}
    >
      <div
        className="relative flex flex-col items-center justify-center overflow-hidden"
        style={{
          height: widthHeight * 1.25,
          maxHeight: widthHeight * 1.25,
          width: widthHeight * 1.25,
          maxWidth: widthHeight * 1.25,
        }}
      >
        <div
          style={{
            height: widthHeight * 1.25,
            maxHeight: widthHeight * 1.25,
            width: widthHeight * 1.25,
            maxWidth: widthHeight * 1.25,
          }}
          className="aspect-1 border-general absolute bottom-auto left-auto right-auto top-auto h-[95%] animate-spin rounded-full border-l-2"
        />
        <div className="flex h-full items-center justify-center animate-pulse">
          <Image
            className="aspect-1 h-[70%] max-h-[80%] w-[70%] object-contain"
            style={{ maxHeight: widthHeight, maxWidth: widthHeight }}
            src="/brand/vedelo-mark.svg"
            alt="Логотип"
            width={widthHeight}
            height={widthHeight}
            priority
          />
        </div>
      </div>
      {text && <div className="animate-pulse text-lg font-bold">{text}</div>}
    </div>
  )
}

export default LoadingSpinner
