import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import FormWrapper from '@components/FormWrapper'
import AppButton from '@components/AppButton'
import Input from '@components/Input'
import LabeledContainer from '@components/LabeledContainer'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import { postData } from '@helpers/CRUD'
import getPersonFullName from '@helpers/getPersonFullName'

const artistRequisitesEditorFunc = () => {
  const ArtistRequisitesEditorModal = ({
    closeModal,
    setOnConfirmFunc,
    setOnShowOnCloseConfirmDialog,
    setDisableConfirm,
  }) => {
    const loggedUser = useAtomValue(loggedUserAtom)
    const [siteSettings, setSiteSettings] = useAtom(siteSettingsAtom)
    const custom = useMemo(
      () => siteSettings?.custom ?? {},
      [siteSettings?.custom]
    )

    const [artistFullName, setArtistFullName] = useState(
      custom?.contractArtistFullName ?? getPersonFullName(loggedUser)
    )
    const [artistName, setArtistName] = useState(
      custom?.contractArtistName ?? getPersonFullName(loggedUser)
    )
    const [artistOgrnip, setArtistOgrnip] = useState(
      custom?.contractArtistOgrnip ?? ''
    )
    const [artistStatus, setArtistStatus] = useState(
      custom?.contractArtistStatus === 'self_employed'
        ? 'self_employed'
        : 'individual_entrepreneur'
    )
    const [artistInn, setArtistInn] = useState(custom?.contractArtistInn ?? '')
    const [artistBankName, setArtistBankName] = useState(
      custom?.contractArtistBankName ?? ''
    )
    const [artistBik, setArtistBik] = useState(custom?.contractArtistBik ?? '')
    const [artistCheckingAccount, setArtistCheckingAccount] = useState(
      custom?.contractArtistCheckingAccount ?? ''
    )
    const [artistCorrespondentAccount, setArtistCorrespondentAccount] =
      useState(custom?.contractArtistCorrespondentAccount ?? '')
    const [artistLegalAddress, setArtistLegalAddress] = useState(
      custom?.contractArtistLegalAddress ?? ''
    )

    const currentArtistFullName = custom?.contractArtistFullName ?? ''
    const currentArtistName = custom?.contractArtistName ?? ''
    const currentArtistOgrnip = custom?.contractArtistOgrnip ?? ''
    const currentArtistStatus =
      custom?.contractArtistStatus === 'self_employed'
        ? 'self_employed'
        : 'individual_entrepreneur'
    const currentArtistInn = custom?.contractArtistInn ?? ''
    const currentArtistBankName = custom?.contractArtistBankName ?? ''
    const currentArtistBik = custom?.contractArtistBik ?? ''
    const currentArtistCheckingAccount =
      custom?.contractArtistCheckingAccount ?? ''
    const currentArtistCorrespondentAccount =
      custom?.contractArtistCorrespondentAccount ?? ''
    const currentArtistLegalAddress = custom?.contractArtistLegalAddress ?? ''

    const isChanged = useMemo(
      () =>
        (artistFullName ?? '') !== currentArtistFullName ||
        (artistName ?? '') !== currentArtistName ||
        (artistOgrnip ?? '') !== currentArtistOgrnip ||
        (artistStatus ?? 'individual_entrepreneur') !== currentArtistStatus ||
        (artistInn ?? '') !== currentArtistInn ||
        (artistBankName ?? '') !== currentArtistBankName ||
        (artistBik ?? '') !== currentArtistBik ||
        (artistCheckingAccount ?? '') !== currentArtistCheckingAccount ||
        (artistCorrespondentAccount ?? '') !==
          currentArtistCorrespondentAccount ||
        (artistLegalAddress ?? '') !== currentArtistLegalAddress,
      [
        artistFullName,
        artistName,
        artistOgrnip,
        artistStatus,
        artistInn,
        artistBankName,
        artistBik,
        artistCheckingAccount,
        artistCorrespondentAccount,
        artistLegalAddress,
        currentArtistFullName,
        currentArtistName,
        currentArtistOgrnip,
        currentArtistStatus,
        currentArtistInn,
        currentArtistBankName,
        currentArtistBik,
        currentArtistCheckingAccount,
        currentArtistCorrespondentAccount,
        currentArtistLegalAddress,
      ]
    )

    useEffect(() => {
      if (isChanged) return
      setArtistFullName(currentArtistFullName)
      setArtistName(currentArtistName)
      setArtistOgrnip(currentArtistOgrnip)
      setArtistStatus(currentArtistStatus)
      setArtistInn(currentArtistInn)
      setArtistBankName(currentArtistBankName)
      setArtistBik(currentArtistBik)
      setArtistCheckingAccount(currentArtistCheckingAccount)
      setArtistCorrespondentAccount(currentArtistCorrespondentAccount)
      setArtistLegalAddress(currentArtistLegalAddress)
    }, [
      currentArtistFullName,
      currentArtistName,
      currentArtistOgrnip,
      currentArtistStatus,
      currentArtistInn,
      currentArtistBankName,
      currentArtistBik,
      currentArtistCheckingAccount,
      currentArtistCorrespondentAccount,
      currentArtistLegalAddress,
      isChanged,
    ])

    const handleSave = useCallback(async () => {
      await postData(
        '/api/site',
        {
          custom: {
            ...(custom ?? {}),
            contractArtistFullName: artistFullName.trim(),
            contractArtistName: artistName.trim(),
            contractArtistOgrnip: artistOgrnip.trim(),
            contractArtistStatus: artistStatus,
            contractArtistInn: artistInn.trim(),
            contractArtistBankName: artistBankName.trim(),
            contractArtistBik: artistBik.trim(),
            contractArtistCheckingAccount: artistCheckingAccount.trim(),
            contractArtistCorrespondentAccount:
              artistCorrespondentAccount.trim(),
            contractArtistLegalAddress: artistLegalAddress.trim(),
          },
        },
        (data) => setSiteSettings(data),
        null,
        false,
        loggedUser?._id
      )
      closeModal()
    }, [
      artistFullName,
      artistName,
      artistOgrnip,
      artistStatus,
      artistInn,
      artistBankName,
      artistBik,
      artistCheckingAccount,
      artistCorrespondentAccount,
      artistLegalAddress,
      closeModal,
      custom,
      loggedUser?._id,
      setSiteSettings,
    ])

    useEffect(() => {
      setDisableConfirm(!isChanged)
      setOnShowOnCloseConfirmDialog(isChanged)
      setOnConfirmFunc(isChanged ? handleSave : undefined)
    }, [
      handleSave,
      isChanged,
      setDisableConfirm,
      setOnConfirmFunc,
      setOnShowOnCloseConfirmDialog,
    ])

    return (
      <FormWrapper className="flex h-full flex-col gap-2">
        <div className="mt-2 grid grid-cols-1 gap-3 tablet:grid-cols-2">
          <Input
            label="ФИО артиста (для документов)"
            value={artistFullName}
            onChange={setArtistFullName}
            noMargin
          />
          <Input
            label="Наименование артиста"
            value={artistName}
            onChange={setArtistName}
            noMargin
          />
          <LabeledContainer label="Юр. статус артиста" noMargin>
            <div className="flex flex-wrap items-center gap-2">
              <AppButton
                variant={
                  artistStatus === 'individual_entrepreneur'
                    ? 'primary'
                    : 'secondary'
                }
                size="sm"
                className="cursor-pointer rounded"
                onClick={() => setArtistStatus('individual_entrepreneur')}
              >
                Индивидуальный предприниматель
              </AppButton>
              <AppButton
                variant={
                  artistStatus === 'self_employed' ? 'primary' : 'secondary'
                }
                size="sm"
                className="cursor-pointer rounded"
                onClick={() => setArtistStatus('self_employed')}
              >
                Самозанятый
              </AppButton>
            </div>
          </LabeledContainer>
          <Input
            label="ОГРНИП артиста"
            value={artistOgrnip}
            onChange={setArtistOgrnip}
            noMargin
            className={artistStatus === 'self_employed' ? 'hidden' : ''}
          />
          <Input
            label="ИНН артиста"
            value={artistInn}
            onChange={setArtistInn}
            noMargin
          />
          <Input
            label="Банк артиста"
            value={artistBankName}
            onChange={setArtistBankName}
            noMargin
          />
          <Input
            label="БИК артиста"
            value={artistBik}
            onChange={setArtistBik}
            noMargin
          />
          <Input
            label="Расчетный счет артиста"
            value={artistCheckingAccount}
            onChange={setArtistCheckingAccount}
            noMargin
          />
          <Input
            label="Корр. счет артиста"
            value={artistCorrespondentAccount}
            onChange={setArtistCorrespondentAccount}
            noMargin
          />
          <Input
            label="Юр. адрес артиста"
            value={artistLegalAddress}
            onChange={setArtistLegalAddress}
            noMargin
          />
        </div>
      </FormWrapper>
    )
  }

  return {
    title: 'Редактировать реквизиты артиста',
    confirmButtonName: 'Сохранить',
    Children: ArtistRequisitesEditorModal,
  }
}

export default artistRequisitesEditorFunc
