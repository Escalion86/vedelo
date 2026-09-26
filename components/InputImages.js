import { faHome } from '@fortawesome/free-solid-svg-icons/faHome'
import { faPlus } from '@fortawesome/free-solid-svg-icons/faPlus'
import { faTrash } from '@fortawesome/free-solid-svg-icons/faTrash'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import arrayMove from '@helpers/arrayMove'
import { sendImage } from '@helpers/cloudinary'
import { modalsFuncAtom } from '@state/atoms'
import cn from 'classnames'
import { m } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import Zoom from 'react-medium-image-zoom'
import { useAtomValue } from 'jotai'
import InputWrapper from './InputWrapper'
import LoadingSpinner from './LoadingSpinner'
import Image from 'next/image'

const InputImages = ({
  images = [],
  onChange = () => {},
  required = false,
  label = null,
  directory,
  maxImages = 10,
  labelClassName,
  className,
  aspect,
  error,
  fullWidth,
  readOnly = false,
  noMargin,
  smallMargin,
  paddingY = true,
  paddingX,
  noBorder,
  onLoading,
  onLoaded,
  imageFolder = '',
}) => {
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const [isAddingImage, setAddingImage] = useState(false)
  const hiddenFileInput = useRef(null)
  const addImageClick = () => {
    hiddenFileInput.current.click()
  }

  const onAddImage = async (newImage) => {
    if (newImage) {
      var img = document.createElement('img')

      img.onload = async () => {
        if (img.width < 100 || img.height < 100) modalsFunc.minimalSize()
        else {
          modalsFunc.cropImage(newImage, img, aspect, (newImage) => {
            setAddingImage(true)
            if (typeof onLoading === 'function') onLoading()
            sendImage(
              newImage,
              (imagesUrls) => onChange([...images, ...imagesUrls]),
              directory,
              null,
              imageFolder
            ).finally(() => setAddingImage(false))
          })
        }
      }

      var reader = new FileReader()
      reader.onloadend = function (ended) {
        img.src = ended.target.result
      }
      reader.readAsDataURL(newImage)
    } else {
      onChange(images)
    }
  }

  useEffect(() => {
    if (typeof onLoaded === 'function') onLoaded()
  }, [images, onLoaded])

  return (
    <InputWrapper
      label={label}
      labelClassName={labelClassName}
      value={images}
      className={cn('flex-1', className)}
      required={required}
      error={error}
      fullWidth={fullWidth}
      noBorder={readOnly || noBorder}
      noMargin={noMargin}
      smallMargin={smallMargin}
      paddingY={paddingY}
      paddingX={paddingX}
    >
      <div className="flex w-full flex-wrap gap-1 p-0.5">
        {images.length > 0 &&
          images.map((image, index) => (
            <m.div
              key={image}
              className="group relative h-20 w-20 overflow-hidden border border-gray-300"
              layout
              transition={{ duration: 0.2, type: 'just' }}
              onClick={(e) => e.stopPropagation()}
            >
              <Zoom zoomMargin={20}>
                <Image
                  className="h-20 w-20 object-cover"
                  src={image}
                  alt="item_image"
                  width="0"
                  height="0"
                  sizes="100vw"
                />
              </Zoom>

              {!readOnly && (
                <div className="laptop:-top-5 laptop:group-hover:top-0 laptop:-right-5 laptop:group-hover:right-0 absolute right-0 top-0 flex h-7 w-7 transform cursor-pointer justify-end rounded-bl-full bg-white p-1 duration-200 hover:scale-125">
                  <FontAwesomeIcon
                    className="h-4 text-red-700"
                    icon={faTrash}
                    onClick={() => {
                      onChange(images.filter((image, i) => i !== index))
                    }}
                  />
                </div>
              )}
              {!readOnly && images.length > 1 && (
                <div
                  className={cn(
                    'absolute flex h-7 w-7 transform rounded-br-full bg-white p-1 duration-200',
                    index === 0
                      ? 'left-0 top-0'
                      : 'laptop:-top-5 laptop:group-hover:top-0 laptop:-left-5 laptop:group-hover:left-0 left-0 top-0 cursor-pointer hover:scale-125'
                  )}
                >
                  <FontAwesomeIcon
                    className={cn(
                      'h-4',
                      index === 0 ? 'text-success' : 'text-orange-700'
                    )}
                    icon={faHome}
                    onClick={() => {
                      if (index !== 0) onChange(arrayMove(images, index, 0))
                    }}
                  />
                </div>
              )}
            </m.div>
          ))}
        {!readOnly && !isAddingImage && images.length < maxImages && (
          <div
            onClick={addImageClick}
            className="group flex h-20 w-20 cursor-pointer items-center justify-center rounded-xl border-2 border-gray-500 bg-white"
          >
            <div className="min-h-12 transparent flex h-12 w-12 min-w-12 items-center justify-center duration-200 group-hover:scale-125 ">
              <FontAwesomeIcon className="text-gray-700" icon={faPlus} />
              <input
                type="file"
                ref={hiddenFileInput}
                onChange={(e) => onAddImage(e.target.files[0])}
                onClick={(e) => {
                  e.target.value = null
                }}
                style={{ display: 'none' }}
                accept="image/jpeg,image/png"
              />
            </div>
          </div>
        )}
        {isAddingImage && (
          <LoadingSpinner
            heightClassName="h-20"
            className="w-20 border border-gray-300 bg-general bg-opacity-20"
          />
        )}
      </div>
    </InputWrapper>
  )
}

export default InputImages
