import ErrorsList from '@components/ErrorsList'
import FormWrapper from '@components/FormWrapper'
import Input from '@components/Input'
import InputImages from '@components/InputImages'
import PhoneInput from '@components/PhoneInput'
import compareArrays from '@helpers/compareArrays'
import getPersonFullName from '@helpers/getPersonFullName'
import { buildSingleNamePatch } from '@helpers/personName.mjs'
import { DEFAULT_USER } from '@helpers/constants'
import {
  normalizeEmailInput,
  normalizeInstagramInput,
  normalizeTelegramInput,
  normalizeVkInput,
} from '@helpers/socialInput'
import useErrors from '@helpers/useErrors'
import itemsFuncAtom from '@state/atoms/itemsFuncAtom'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import usersAtom from '@state/atoms/usersAtom'
import { useAtom, useAtomValue } from 'jotai'
import { useMemo, useState } from 'react'
import { modalsFuncAtom } from '@state/atoms'

const normalizePhone = (value) =>
  value ? String(value).replace(/[^\d]/g, '') : ''

const ProfileContent = () => {
  const [loggedUser, setLoggedUser] = useAtom(loggedUserAtom)
  const users = useAtomValue(usersAtom)
  const setUser = useAtomValue(itemsFuncAtom).user.set
  const modalsFunc = useAtomValue(modalsFuncAtom)

  const [fullName, setFullName] = useState(getPersonFullName(DEFAULT_USER))

  const [email, setEmail] = useState(DEFAULT_USER.email)
  const [phone, setPhone] = useState(DEFAULT_USER.phone)
  const [whatsapp, setWhatsapp] = useState(DEFAULT_USER.whatsapp)
  const [telegram, setTelegram] = useState(DEFAULT_USER.telegram)
  const [instagram, setInstagram] = useState(DEFAULT_USER.instagram)
  const [vk, setVk] = useState(DEFAULT_USER.vk)
  const [images, setImages] = useState(DEFAULT_USER.images)
  const [isSaving, setIsSaving] = useState(false)

  const [errors, checkErrors, addError, removeError, clearErrors] = useErrors()

  const [previousUser, setPreviousUser] = useState(null)
  if (loggedUser && loggedUser !== previousUser) {
    setPreviousUser(loggedUser)
    setFullName(getPersonFullName(loggedUser))
    setEmail(loggedUser.email ?? DEFAULT_USER.email)
    setPhone(loggedUser.phone ?? DEFAULT_USER.phone)
    setWhatsapp(loggedUser.whatsapp ?? DEFAULT_USER.whatsapp)
    setTelegram(loggedUser.telegram ?? DEFAULT_USER.telegram)
    setInstagram(loggedUser.instagram ?? DEFAULT_USER.instagram)
    setVk(loggedUser.vk ?? DEFAULT_USER.vk)
    setImages(loggedUser.images ?? DEFAULT_USER.images)
    clearErrors()
  }

  const isFormChanged = useMemo(() => {
    if (!loggedUser) return false
    return (
      getPersonFullName(loggedUser) !== fullName ||
      loggedUser.email !== email ||
      loggedUser.phone !== phone ||
      loggedUser.whatsapp !== whatsapp ||
      loggedUser.telegram !== telegram ||
      loggedUser.instagram !== instagram ||
      loggedUser.vk !== vk ||
      !compareArrays(loggedUser.images, images)
    )
  }, [
    loggedUser,
    fullName,
    email,
    phone,
    whatsapp,
    telegram,
    instagram,
    vk,
    images,
  ])

  const handleSave = async () => {
    if (!loggedUser || isSaving) return
    if (!fullName.trim()) {
      addError({ firstName: 'Укажите ФИО' })
      return
    }
    const normalizedPhone = normalizePhone(phone)
    if (normalizedPhone) {
      const existedUser = users.find(
        (user) =>
          user._id !== loggedUser._id &&
          normalizePhone(user.phone) === normalizedPhone
      )
      if (existedUser) {
        addError({
          phone: 'Пользователь с таким номером телефона уже существует',
        })
        return
      }
    }

    if (
      checkErrors({
        phone,
        whatsapp,
        email,
      })
    )
      return

    setIsSaving(true)
    const result = await setUser({
      _id: loggedUser._id,
      ...buildSingleNamePatch(fullName),
      email,
      phone,
      whatsapp,
      telegram,
      instagram,
      vk,
      images,
    })
    if (result?._id) setLoggedUser(result)
    setIsSaving(false)
  }

  if (!loggedUser) {
    return (
      <div className="px-2 text-sm text-gray-600">
        Данные пользователя не найдены.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-2 pb-6">
      <div className="profile-sticky-bar sticky top-0 z-10 -mx-2 border-b border-gray-200 px-2 py-2 backdrop-blur">
        <div className="flex justify-end">
          <button
            type="button"
            className="modal-action-button bg-general px-6 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
            disabled={!isFormChanged || isSaving}
            onClick={handleSave}
          >
            {isSaving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
      <FormWrapper className="w-full">
        <InputImages
          label="Фотографии"
          directory="users"
          images={images}
          onChange={(nextImages) => {
            removeError('images')
            setImages(nextImages)
          }}
          error={errors.images}
        />
        <Input
          label="ФИО"
          value={fullName}
          onChange={(value) => {
            removeError('firstName')
            setFullName(value)
          }}
          error={errors.firstName}
          showErrorText
          required
          fullWidth
          autoComplete="name"
        />
        <FormWrapper grid>
          <PhoneInput
            label="Телефон"
            value={phone}
            onChange={setPhone}
            error={errors.phone}
            copyPasteButtons
          />
          <PhoneInput
            label="Whatsapp"
            value={whatsapp}
            onChange={setWhatsapp}
            error={errors.whatsapp}
            copyPasteButtons
          />
          <Input
            prefix="t.me/"
            label="Telegram (никнейм)"
            value={telegram}
            onChange={setTelegram}
            copyPasteButtons
            normalizePastedValue={normalizeTelegramInput}
          />
          <Input
            prefix="instagram.com/"
            label="Instagram"
            value={instagram}
            onChange={setInstagram}
            copyPasteButtons
            normalizePastedValue={normalizeInstagramInput}
          />
          <Input
            prefix="vk.com/"
            label="Vk"
            value={vk}
            onChange={setVk}
            copyPasteButtons
            normalizePastedValue={normalizeVkInput}
          />
          <Input
            label="Email"
            value={email}
            onChange={setEmail}
            error={errors.email}
            copyPasteButtons
            normalizePastedValue={normalizeEmailInput}
          />
        </FormWrapper>
        <ErrorsList errors={errors} />
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            className="h-9 cursor-pointer rounded border border-gray-300 px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            onClick={() => modalsFunc.user?.changePassword?.()}
          >
            Сменить пароль
          </button>
        </div>
      </FormWrapper>
    </div>
  )
}

export default ProfileContent
