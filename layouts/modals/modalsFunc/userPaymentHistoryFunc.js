import FormWrapper from '@components/FormWrapper'
import UserName from '@components/UserName'
import BillingHistoryContent from '@layouts/content/BillingHistoryContent'
import userSelector from '@state/selectors/userSelector'
import { useEffect } from 'react'
import { useAtomValue } from 'jotai'

const userPaymentHistoryFunc = (userId) => {
  const UserPaymentHistoryModal = ({ closeModal }) => {
    const user = useAtomValue(userSelector(userId))

    useEffect(() => {
      if (!user) closeModal()
    }, [closeModal, user])

    if (!user) return null

    return (
      <FormWrapper flex className="flex-col gap-3">
        <UserName user={user} className="text-lg font-bold" />
        <BillingHistoryContent
          userId={user._id}
          accountUser={user}
          embedded
        />
      </FormWrapper>
    )
  }

  return {
    title: 'Баланс и платежи',
    declineButtonName: 'Закрыть',
    closeButtonShow: true,
    Children: UserPaymentHistoryModal,
  }
}

export default userPaymentHistoryFunc
