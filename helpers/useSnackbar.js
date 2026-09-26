import { faTimes } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useSnackbar as notistackUseSnackbar } from 'notistack'
import { useCallback, useMemo } from 'react'

const variants = ['default', 'error', 'success', 'warning', 'info']

const useSnackbar = () => {
  const { enqueueSnackbar, closeSnackbar } = notistackUseSnackbar()
  const makeHandler = useCallback(
    (variant) =>
      (text, props = {}) => {
        const key = enqueueSnackbar(text, {
          open: true,
          variant,
          // onClick: () => {
          //   closeSnackbar(key)
          // },
          className: 'flex flex-nowrap',
          // autoHideDuration,
          action: (
            <button
              type="button"
              aria-label="Закрыть уведомление"
              title="Закрыть уведомление"
              className="flex h-8 min-w-8 cursor-pointer items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => closeSnackbar(key)}
            >
              <FontAwesomeIcon icon={faTimes} className="h-5 w-5" />
            </button>
          ),
          ...props,
        })
      },
    [closeSnackbar, enqueueSnackbar]
  )

  return useMemo(() => {
    const result = {}
    variants.forEach((variant) => {
      result[variant] = makeHandler(variant)
    })
    return result
  }, [makeHandler])
}

export default useSnackbar
