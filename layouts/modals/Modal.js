import Tooltip from '@components/Tooltip'
import { faTimes } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import ModalButtons from '@layouts/modals/ModalButtons'
import modalsAtom from '@state/atoms/modalsAtom'
import { modalsFuncAtom } from '@state/atoms'
import cn from 'classnames'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useCallback, useRef, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'

const Modal = ({
  Children,
  childrenProps,
  id,
  // onClose = () => {},
  // onDelete = null,
  // twoCols = false,
  // noPropsToChildren = false,
  // editMode = null,
  // setEditMode = null,
  title,
  text,
  subModalText = null,
  // modals = null,
  onClose,
  onConfirm,
  onConfirm2,
  onDecline,
  confirmButtonName,
  confirmButtonPendingName,
  confirmButtonName2,
  declineButtonName,
  neutralButtonName,
  closeButtonName,
  // showConfirm,
  // showConfirm2,
  // showDecline,
  closeButtonShow = true,
  declineButtonShow = true,
  onlyCloseButtonShow,
  TopLeftComponent,
  bottomLeftButtonProps,
  bottomLeftComponent,
  declineButtonBgClassName,
  crossShow = true,
  crossActsAsDecline = true,
  waitForConfirm = false,
  contentClassName,
}) => {
  // const [rendered, setRendered] = useState(false)
  // const [preventCloseFunc, setPreventCloseFunc] = useState(null)
  const [titleState, setTitleState] = useState(title)
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const [disableConfirm, setDisableConfirm] = useState(false)
  const [disableDecline, setDisableDecline] = useState(false)
  const [confirmPending, setConfirmPending] = useState(false)
  const [confirmButtonNameState, setConfirmButtonNameState] =
    useState(confirmButtonName)
  const [confirmButtonName2State, setConfirmButtonName2State] =
    useState(confirmButtonName2)
  const [onShowOnCloseConfirmDialog, setOnShowOnCloseConfirmDialog] =
    useState(false)
  const [onConfirmFunc, setOnConfirmFunc] = useState(null)
  const [onConfirm2Func, setOnConfirm2Func] = useState(null)
  const [onDeclineFunc, setOnDeclineFunc] = useState(null)
  const [onCloseButtonFunc, setOnCloseButtonFunc] = useState(null)
  const setModals = useSetAtom(modalsAtom)
  const [close, setClose] = useState(false)
  const [ComponentInFooter, setComponentInFooter] = useState(null)
  const [closeButtonShowState, setCloseButtonShowState] =
    useState(closeButtonShow)
  const [declineButtonShowState, setDeclineButtonShowState] =
    useState(declineButtonShow)
  const [onlyCloseButtonShowState, setOnlyCloseButtonShowState] =
    useState(onlyCloseButtonShow)
  const [TopLeftComponentState, setTopLeftComponentState] =
    useState(TopLeftComponent)
  const [bottomLeftButton, setBottomLeftButton] = useState(
    bottomLeftButtonProps
  )
  const [bottomLeftComponentState, setBottomLeftComponent] =
    useState(bottomLeftComponent)
  const contentRef = useRef(null)
  const confirmLockRef = useRef(false)

  const setOnConfirmFuncSafe = useCallback(
    (value) => {
      setOnConfirmFunc(typeof value === 'function' ? () => value : value)
    },
    [setOnConfirmFunc]
  )

  const setOnConfirm2FuncSafe = useCallback(
    (value) => {
      setOnConfirm2Func(typeof value === 'function' ? () => value : value)
    },
    [setOnConfirm2Func]
  )

  const setOnDeclineFuncSafe = useCallback(
    (value) => {
      setOnDeclineFunc(typeof value === 'function' ? () => value : value)
    },
    [setOnDeclineFunc]
  )

  const setOnCloseButtonFuncSafe = useCallback(
    (value) => {
      setOnCloseButtonFunc(typeof value === 'function' ? () => value : value)
    },
    [setOnCloseButtonFunc]
  )

  const closeModal = useCallback(() => {
    onClose && typeof onClose === 'function' && onClose()
    setClose(true)
    setTimeout(
      () => setModals((modals) => modals.filter((modal) => modal.id !== id)),
      200
    )
  }, [id, onClose, setModals])

  const router = useRouter()

  const refreshPage = useCallback(() => {
    router.refresh()
  }, [router])

  const resetHorizontalScroll = useCallback(() => {
    const contentNode = contentRef.current
    if (contentNode) contentNode.scrollLeft = 0
    const parentNode = contentNode?.parentElement
    if (parentNode) parentNode.scrollLeft = 0
    if (typeof window !== 'undefined') {
      window.scrollTo(
        window.scrollX > 0 ? 0 : window.pageXOffset,
        window.scrollY
      )
    }
  }, [])

  const handleContentFocusCapture = useCallback(
    (event) => {
      const target = event?.target
      const tagName = target?.tagName?.toLowerCase?.()
      if (!['input', 'textarea', 'select'].includes(tagName)) return

      requestAnimationFrame(() => {
        resetHorizontalScroll()
      })
      setTimeout(() => {
        resetHorizontalScroll()
      }, 80)
    },
    [resetHorizontalScroll]
  )

  // const onConfirmClick = () => {
  //   if (onConfirmFunc) return onConfirmFunc(refreshPage)
  //   onConfirm && typeof onConfirm === 'function' && onConfirm(refreshPage)
  //   closeModal()
  // }

  const confirmHandler =
    typeof onConfirmFunc === 'function'
      ? onConfirmFunc
      : typeof onConfirm === 'function'
        ? onConfirm
        : null

  const runConfirm = useCallback(
    async (
      handler,
      { closeImmediately = false, closeAfterSuccess = false } = {}
    ) => {
      if (confirmLockRef.current) return

      confirmLockRef.current = true
      setConfirmPending(true)
      try {
        const result = handler(refreshPage)
        if (closeImmediately) closeModal()
        await result
        if (closeAfterSuccess) closeModal()
      } finally {
        confirmLockRef.current = false
        setConfirmPending(false)
      }
    },
    [closeModal, refreshPage]
  )

  const onConfirmClick = confirmHandler
    ? () =>
        runConfirm(confirmHandler, {
          closeImmediately:
            !waitForConfirm && typeof onConfirmFunc !== 'function',
          closeAfterSuccess: waitForConfirm,
        })
    : undefined

  const confirm2Handler =
    typeof onConfirm2Func === 'function'
      ? onConfirm2Func
      : typeof onConfirm2 === 'function'
        ? onConfirm2
        : null

  const onConfirm2Click = confirm2Handler
    ? () =>
        runConfirm(confirm2Handler, {
          closeImmediately: typeof onConfirm2Func !== 'function',
        })
    : undefined

  const onCloseButtonClick =
    typeof onCloseButtonFunc === 'function'
      ? () => onCloseButtonFunc(refreshPage)
      : closeModal

  // const onConfirm2Click = () => {
  //   if (onConfirm2Func) return onConfirm2Func(refreshPage)
  //   onConfirm2 && typeof onConfirm2 === 'function' && onConfirm2(refreshPage)
  //   closeModal()
  // }

  const onDeclineClick =
    onShowOnCloseConfirmDialog ||
    typeof onDeclineFunc === 'function' ||
    typeof onDecline === 'function'
      ? () => {
          const decline =
            typeof onDeclineFunc === 'function'
              ? () => onDeclineFunc()
              : typeof onDecline === 'function'
                ? () => {
                    onDecline(refreshPage)
                    closeModal()
                  }
                : undefined

          if (onShowOnCloseConfirmDialog) {
            modalsFunc.confirm({
              onConfirm: () => {
                if (typeof decline === 'function') decline()
                else closeModal()
                // setOnShowOnCloseConfirmDialog(false)
              },
            })
          } else {
            decline()
          }
        }
      : undefined

  const onCrossClick = crossActsAsDecline
    ? onDeclineClick || onCloseButtonClick
    : onCloseButtonClick

  // const closeFunc = () => {
  //   setRendered(false)
  //   setTimeout(() => {
  //     onClose()
  //   }, 200)
  // }
  // const onCloseWithDelay = () => {
  //   if (formChanged && modals) {
  //     modals.openConfirmModal(
  //       'Отмена изменений',
  //       'Вы уверены что хотите закрыть окно без сохранения изменений?',
  //       closeFunc
  //     )
  //   } else closeFunc()
  // }

  // useEffect(() => {
  //   setTimeout(() => {
  //     setRendered(true)
  //   }, 10)
  // }, [])

  return (
    <motion.div
      className={
        cn(
          'bg-opacity-80 tablet:items-center fixed inset-0 z-50 flex w-full justify-center overflow-y-auto bg-gray-800 duration-200',
          subModalText ? 'tablet:pb-5 tablet:pt-10 py-0' : 'tablet:py-5 py-0'
        )
        //  + (rendered ? ' opacity-100' : ' opacity-0')
      }
      initial={{ opacity: 0 }}
      animate={{ opacity: close ? 0 : 1 }}
      transition={{ duration: 0.1 }}
      onMouseDown={
        crossShow && !confirmPending
          ? onDeclineClick || onCloseButtonClick
          : undefined
      }
    >
      <motion.div
        className={
          cn(
            'laptop:w-9/12 border-primary tablet:my-auto tablet:h-auto tablet:min-h-0 tablet:max-h-[calc(100dvh-2.5rem)] tablet:w-[95%] tablet:min-w-156 tablet:rounded-lg tablet:pb-2 tablet:overflow-visible relative flex h-[100dvh] min-h-[100dvh] w-full min-w-0 flex-col overflow-hidden border-l bg-white pb-1 duration-300',
            titleState ? 'pt-3' : 'pt-12'
          )
          // + (rendered ? '' : ' scale-50')
        }
        initial={{ opacity: 0 }}
        animate={{ opacity: close ? 0 : 1 }}
        transition={{ duration: 0.1 }}
        // onClick={(e) => e?.stopPropagation()}
        onMouseDown={(e) => e?.stopPropagation()}
      >
        {subModalText && (
          <div className="absolute -top-9 left-0 flex w-full justify-center">
            <div className="rounded-md bg-white px-2 py-0.5">
              {subModalText}
            </div>
          </div>
        )}
        {TopLeftComponentState && (
          <div className="absolute top-2 left-2 [&_.card-buttons-compact-trigger]:rounded-full">
            {TopLeftComponentState}
          </div>
        )}
        {crossShow && (
          <Tooltip title="Закрыть">
            <div className="absolute top-2 right-2">
              <FontAwesomeIcon
                className={cn(
                  'h-8 w-8 transform text-black duration-200',
                  confirmPending
                    ? 'cursor-not-allowed opacity-40'
                    : 'cursor-pointer hover:scale-110'
                )}
                icon={faTimes}
                // size="1x"
                onClick={confirmPending ? undefined : onCrossClick}
              />
            </div>
          </Tooltip>
        )}
        {titleState && (
          <div className="mx-12 mb-3 text-center text-lg leading-6 font-bold whitespace-pre-line">
            {titleState}
          </div>
        )}
        {text && <div className="tablet:px-3 mb-3 px-2 leading-4">{text}</div>}
        {/* {editMode && onDelete && (
          <FontAwesomeIcon
            className="absolute w-5 h-5 text-red-700 duration-200 transform cursor-pointer top-4 left-4 hover:scale-110"
            icon={faTrash}
            size="1x"
            onClick={() => {
              onDelete(closeModal)
            }}
          />
        )} */}
        {/* {!editMode && editMode !== null && (
          <FontAwesomeIcon
            className="absolute w-5 h-5 duration-200 transform cursor-pointer text-primary top-4 left-4 hover:scale-110"
            icon={faPencilAlt}
            size="1x"
            onClick={
              setEditMode
                ? () => {
                    setEditMode(true)
                  }
                : null
            }
          />
        )} */}
        {/* {noPropsToChildren
          ? children
          : cloneElement(children, { onClose: closeModal, setBeforeCloseFunc })} */}
        <div
          ref={contentRef}
          className={cn(
            'tablet:px-3 flex-1 overflow-x-hidden overflow-y-auto px-2',
            contentClassName
          )}
          onFocusCapture={handleContentFocusCapture}
        >
          {Children && (
            <Children
              {...childrenProps}
              closeModal={closeModal}
              setOnConfirmFunc={setOnConfirmFuncSafe}
              setOnConfirm2Func={setOnConfirm2FuncSafe}
              setOnDeclineFunc={setOnDeclineFuncSafe}
              setOnCloseButtonFunc={setOnCloseButtonFuncSafe}
              setOnShowOnCloseConfirmDialog={setOnShowOnCloseConfirmDialog}
              setDisableConfirm={setDisableConfirm}
              setDisableDecline={setDisableDecline}
              setComponentInFooter={setComponentInFooter}
              setOnlyCloseButtonShow={setOnlyCloseButtonShowState}
              setTopLeftComponent={setTopLeftComponentState}
              setBottomLeftButtonProps={setBottomLeftButton}
              setBottomLeftComponent={setBottomLeftComponent}
              setCloseButtonShow={setCloseButtonShowState}
              setDeclineButtonShow={setDeclineButtonShowState}
              setConfirmButtonName={setConfirmButtonNameState}
              setConfirmButtonName2={setConfirmButtonName2State}
              setTitle={setTitleState}
            />
          )}
        </div>

        {(confirmHandler ||
          confirm2Handler ||
          // showConfirm ||
          closeButtonShowState ||
          // showDecline ||
          ComponentInFooter ||
          onlyCloseButtonShowState ||
          bottomLeftButton ||
          bottomLeftComponentState) && (
          <ModalButtons
            closeButtonShow={
              onlyCloseButtonShowState ||
              (!onDeclineClick && closeButtonShowState)
            }
            declineButtonShow={declineButtonShowState}
            confirmName={confirmButtonNameState}
            confirmName2={confirmButtonName2State}
            declineName={declineButtonName}
            neutralName={neutralButtonName}
            closeButtonName={closeButtonName}
            onConfirmClick={!onlyCloseButtonShowState && onConfirmClick}
            onConfirm2Click={!onlyCloseButtonShowState && onConfirm2Click}
            onDeclineClick={!onlyCloseButtonShowState && onDeclineClick}
            onNeutralClick={
              !onlyCloseButtonShowState && neutralButtonName
                ? onCloseButtonClick
                : undefined
            }
            // showConfirm={!onlyCloseButtonShow && showConfirm}
            // showConfirm2={!onlyCloseButtonShow && showConfirm2}
            // showDecline={!onlyCloseButtonShowState && showDecline}
            disableConfirm={disableConfirm}
            disableDecline={disableDecline || confirmPending}
            confirmPending={confirmPending}
            confirmPendingName={confirmButtonPendingName}
            closeModal={onCloseButtonClick}
            bottomLeftButton={bottomLeftButton}
            bottomLeftComponent={bottomLeftComponentState}
            declineButtonBgClassName={declineButtonBgClassName}
          >
            {ComponentInFooter}
          </ModalButtons>
        )}
      </motion.div>
    </motion.div>
  )
}

export default Modal
