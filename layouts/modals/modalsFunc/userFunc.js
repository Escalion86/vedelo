/* eslint-disable react-hooks/exhaustive-deps */
import CardButtons from '@components/CardButtons'
import ErrorsList from '@components/ErrorsList'
import FormWrapper from '@components/FormWrapper'
import Input from '@components/Input'
import InputImages from '@components/InputImages'
import PhoneInput from '@components/PhoneInput'
import UserRolePicker from '@components/ValuePicker/UserRolePicker'
import getPersonFullName from '@helpers/getPersonFullName'
import { buildSingleNamePatch } from '@helpers/personName.mjs'
import compareArrays from '@helpers/compareArrays'
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
import loggedUserActiveRoleSelector from '@state/selectors/loggedUserActiveRoleSelector'
import userSelector from '@state/selectors/userSelector'
import { useEffect, useRef, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'

const normalizePhone = (value) =>
  value ? String(value).replace(/[^\d]/g, '') : ''

const userFunc = (userId, clone = false) => {
  const UserModal = ({
    closeModal,
    setOnConfirmFunc,
    setOnDeclineFunc,
    setOnShowOnCloseConfirmDialog,
    setDisableConfirm,
    setDisableDecline,
    setTopLeftComponent,
  }) => {
    const [loggedUser, setLoggedUser] = useAtom(loggedUserAtom)

    const loggedUserActiveRole = useAtomValue(loggedUserActiveRoleSelector)
    const isLoggedUserDev = loggedUserActiveRole?.dev
    const canSetRole = loggedUserActiveRole?.users?.setRole

    const user = useAtomValue(userSelector(userId))
    const setUser = useAtomValue(itemsFuncAtom).user.set
    const users = useAtomValue(usersAtom)

    const [fullName, setFullName] = useState(getPersonFullName(user ?? DEFAULT_USER))
    const [password, setPassword] = useState(
      user?.password ?? DEFAULT_USER.password
    )
    // const [about, setAbout] = useState(user?.about ?? DEFAULT_USER.about)
    // const [interests, setInterests] = useState(user?.interests ?? DEFAULT_USER.interests)
    // const [profession, setProfession] = useState(user?.profession ?? DEFAULT_USER.profession)
    // const [orientation, setOrientation] = useState(user?.orientation ?? DEFAULT_USER.orientation)
    const [email, setEmail] = useState(user?.email ?? DEFAULT_USER.email)
    const [phone, setPhone] = useState(user?.phone ?? DEFAULT_USER.phone)
    const [whatsapp, setWhatsapp] = useState(
      user?.whatsapp ?? DEFAULT_USER.whatsapp
    )
    const [telegram, setTelegram] = useState(
      user?.telegram ?? DEFAULT_USER.telegram
    )
    const [instagram, setInstagram] = useState(
      user?.instagram ?? DEFAULT_USER.instagram
    )
    const [vk, setVk] = useState(user?.vk ?? DEFAULT_USER.vk)
    const [images, setImages] = useState(user?.images ?? DEFAULT_USER.images)
    const [role, setRole] = useState(user?.role ?? DEFAULT_USER.role)


    const [errors, checkErrors, addError, removeError, clearErrors] =
      useErrors()

    // const router = useRouter()

    // const refreshPage = () => {
    //   router.replace(router.asPath)
    // }

    const onClickConfirm = async () => {
      if (!fullName.trim()) {
        addError({ firstName: 'Укажите ФИО' })
        return
      }
      // Если создаем нового пользователя в ручную, то сначала проверим - нет ли уже такого номера телефона в системе
      if (!userId && phone) {
        const normalizedPhone = normalizePhone(phone)
        const existedUser = users.find(
          (user) => normalizePhone(user.phone) === normalizedPhone
        )
        if (existedUser) {
          addError({
            phone: 'Пользователь с таким номером телефона уже существует',
          })
          return
        }
      }
      if (!userId && !password) {
        addError({ password: 'Введите пароль' })
        return
      }
      if (
        !checkErrors({
          phone,
          whatsapp,
          email,
        })
      ) {
        closeModal()
        const result = await setUser(
          {
            _id: user?._id,
            ...buildSingleNamePatch(fullName),
            // about,
            // interests,
            // profession,
            // orientation,
            password: userId ? undefined : password,
            email,
            phone,
            whatsapp,
            telegram,
            instagram,
            vk,
            images,
            role,
          },
          clone
        )

        if (user?._id && loggedUser?._id === result?._id) {
          setLoggedUser(result)
        }
        // if (user && !clone) {
        //   await putData(
        //     `/api/users/${user._id}`,
        //     {
        //       name,
        //       secondName,
        //       thirdName,
        //       about,
        //       interests,
        //       profession,
        //       orientation,
        //       gender,
        //       phone,
        //       whatsapp,
        //       viber,
        //       telegram,
        //       instagram,
        //       vk,
        //       image,
        //       birthday,
        //     },
        //     refreshPage
        //   )
        // } else {
        //   await postData(
        //     `/api/users`,
        //     {
        //       name,
        //       secondName,
        //       thirdName,
        //       about,
        //       interests,
        //       profession,
        //       orientation,
        //       gender,
        //       phone,
        //       whatsapp,
        //       viber,
        //       telegram,
        //       instagram,
        //       vk,
        //       image,
        //       birthday,
        //     },
        //     refreshPage
        //   )
        // }
      }
    }

    const onClickConfirmRef = useRef(onClickConfirm)

    useEffect(() => {
      onClickConfirmRef.current = onClickConfirm
    }, [onClickConfirm])

    useEffect(() => {
      const isFormChanged =
        getPersonFullName(user ?? DEFAULT_USER) !== fullName ||
        (!userId && user?.password !== password) ||
        // user?.about !== about ||
        // user?.interests !== interests ||
        // user?.profession !== profession ||
        // user?.orientation !== orientation ||
        user?.email !== email ||
        user?.phone !== phone ||
        user?.whatsapp !== whatsapp ||
        user?.telegram !== telegram ||
        user?.instagram !== instagram ||
        user?.vk !== vk ||
        !compareArrays(user?.images, images) ||
        user?.role !== role

      setOnConfirmFunc(
        isFormChanged ? () => onClickConfirmRef.current() : undefined
      )
      setOnShowOnCloseConfirmDialog(isFormChanged)
      setDisableConfirm(!isFormChanged)
    }, [
      fullName,
      password,
      // about,
      // interests,
      // profession,
      // orientation,
      email,
      phone,
      whatsapp,
      telegram,
      instagram,
      vk,
      images,
      role,
    ])

    useEffect(() => {
      if (setTopLeftComponent)
        setTopLeftComponent(() => (
          <CardButtons
            item={user}
            typeOfItem="user"
            forForm
            alwaysCompact
            noEditButton
            onDelete={closeModal}
            dropDownPlacement="right"
          />
        ))
    }, [setTopLeftComponent])

    return (
      <FormWrapper>
        {/* <InputImage
          label="Фотография"
          directory="users"
          image={image}
          onChange={setImage}
        /> */}
        <InputImages
          label="Фотографии"
          directory="users"
          images={images}
          onChange={(images) => {
            removeError('images')
            setImages(images)
          }}
          // required
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
        {!userId && (
          <Input
            label="Пароль"
            type="password"
            value={password}
            onChange={(value) => {
              removeError('password')
              setPassword(value)
            }}
            error={errors.password}
            autoComplete="one-time-code"
          />
        )}
        <FormWrapper twoColumns>
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
        </FormWrapper>
        <FormWrapper twoColumns>
          <Input
            prefix="@"
            label="Telegram"
            value={telegram}
            onChange={setTelegram}
            copyPasteButtons
            normalizePastedValue={normalizeTelegramInput}
          />
        </FormWrapper>
        <FormWrapper twoColumns>
          <Input
            prefix="@"
            label="Instagram"
            value={instagram}
            onChange={setInstagram}
            copyPasteButtons
            normalizePastedValue={normalizeInstagramInput}
          />
          <Input
            prefix="@"
            label="Vk"
            value={vk}
            onChange={setVk}
            copyPasteButtons
            normalizePastedValue={normalizeVkInput}
          />
        </FormWrapper>
        <Input
          label="Email"
          value={email}
          onChange={setEmail}
          error={errors.email}
          copyPasteButtons
          normalizePastedValue={normalizeEmailInput}
        />
        {canSetRole && (
          <UserRolePicker
            roleId={role}
            onChange={setRole}
            error={errors.role}
            noDev={!isLoggedUserDev}
          />
        )}
        <ErrorsList errors={errors} />
      </FormWrapper>
    )
  }

  return {
    headerActionsPlacement: 'right',
    title: `${userId && !clone ? 'Редактирование' : 'Создание'} пользователя`,
    confirmButtonName: userId && !clone ? 'Применить' : 'Создать',
    Children: UserModal,
  }
}

export default userFunc

