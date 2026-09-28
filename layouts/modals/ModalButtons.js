import isObject from '@helpers/isObject'
import Button from '@components/Button'
import AppButton from '@components/AppButton'
import Divider from '@components/Divider'
import LoadingSpinner from '@components/LoadingSpinner'

const ModalButtons = ({
  confirmName = 'Подтвердить',
  confirmName2 = 'Действие',
  declineName = 'Отмена',
  neutralName,
  closeButtonName = 'Закрыть',
  onConfirmClick,
  onConfirm2Click,
  onDeclineClick,
  onNeutralClick,
  // showConfirm = true,
  // showConfirm2,
  // showDecline,
  disableConfirm = false,
  disableDecline = false,
  confirmPending = false,
  confirmPendingName,
  children,
  closeButtonShow,
  declineButtonShow,
  closeModal,
  bottomLeftButton,
  bottomLeftComponent,
  declineButtonBgClassName = 'bg-danger',
}) => {
  if (
    !onConfirmClick &&
    !onConfirm2Click &&
    !onDeclineClick &&
    !onNeutralClick &&
    !closeButtonShow
  )
    return null

  return (
    <>
      <Divider light thin />
      <div className="tablet:px-3 tablet:pt-1 flex flex-wrap justify-between px-2 [&_button]:min-w-20">
        {children}
        <div className="tablet:gap-x-2 flex flex-1 flex-wrap justify-end gap-1">
          {isObject(bottomLeftButton) ? (
            <div className="flex-1">{<Button {...bottomLeftButton} />}</div>
          ) : null}
          {isObject(bottomLeftComponent) ? (
            <div className="flex-1">{bottomLeftComponent}</div>
          ) : null}
          {onConfirm2Click && (
            <AppButton
              variant="primary"
              size="md"
              className="modal-action-button rounded"
              onClick={onConfirm2Click}
              disabled={disableConfirm || confirmPending}
              aria-busy={confirmPending}
            >
              {confirmName2}
            </AppButton>
          )}
          {onConfirmClick && (
            <AppButton
              variant="primary"
              size="md"
              className="modal-action-button rounded"
              onClick={onConfirmClick}
              disabled={disableConfirm || confirmPending}
              aria-busy={confirmPending}
            >
              {confirmPending ? (
                <span className="flex items-center justify-center gap-1.5">
                  <span className="relative w-[30px] shrink-0 self-stretch">
                    <LoadingSpinner
                      size="xxs"
                      heightClassName="h-auto"
                      className="absolute left-0 top-1/2 max-h-none -translate-y-1/2"
                    />
                  </span>
                  <span>{confirmPendingName || confirmName}</span>
                </span>
              ) : (
                confirmName
              )}
            </AppButton>
          )}
          {declineButtonShow &&
          (onConfirmClick || onConfirm2Click || onDeclineClick) ? (
            <AppButton
              variant={
                declineButtonBgClassName === 'bg-danger'
                  ? 'danger'
                  : 'secondary'
              }
              size="md"
              className="modal-action-button rounded"
              onClick={
                typeof onDeclineClick === 'function'
                  ? onDeclineClick
                  : closeModal
              }
              disabled={disableDecline}
            >
              {declineName}
            </AppButton>
          ) : (
            closeButtonShow && (
              <AppButton
                variant="secondary"
                size="md"
                className="modal-action-button rounded"
                onClick={closeModal}
              >
                {closeButtonName}
              </AppButton>
            )
          )}
          {onNeutralClick && (
            <AppButton
              variant="secondary"
              size="md"
              className="modal-action-button rounded"
              onClick={onNeutralClick}
              disabled={confirmPending}
            >
              {neutralName}
            </AppButton>
          )}
        </div>
      </div>
    </>
  )
}

export default ModalButtons
