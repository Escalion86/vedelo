/* eslint-disable react-hooks/exhaustive-deps */
import fieldHelp from '@helpers/fieldHelp.json'
import ErrorsList from '@components/ErrorsList'
import FormWrapper from '@components/FormWrapper'
import Input from '@components/Input'
import InputDuration from '@components/InputDuration'
import InputImages from '@components/InputImages'
import Select from '@components/Select'
import Textarea from '@components/Textarea'
import AddIconButton from '@components/AddIconButton'
import { DEFAULT_SERVICE } from '@helpers/constants'
import compareArrays from '@helpers/compareArrays'
import useErrors from '@helpers/useErrors'
import { modalsFuncAtom } from '@state/atoms'
import itemsFuncAtom from '@state/atoms/itemsFuncAtom'
import serviceGroupsAtom from '@state/atoms/serviceGroupsAtom'
import serviceSelector from '@state/selectors/serviceSelector'
import { useAtomValue } from 'jotai'
import { useEffect, useRef, useState } from 'react'

const serviceFunc = (serviceId, clone = false, onSuccess) => {
  const ServiceModal = ({
    closeModal,
    setOnConfirmFunc,
    setOnDeclineFunc,
    setOnShowOnCloseConfirmDialog,
    setDisableConfirm,
    setDisableDecline,
  }) => {
    const service = useAtomValue(serviceSelector(serviceId))
    const serviceGroups = useAtomValue(serviceGroupsAtom)
    const setService = useAtomValue(itemsFuncAtom).service.set
    const modalsFunc = useAtomValue(modalsFuncAtom)

    const [title, setTitle] = useState(service?.title ?? DEFAULT_SERVICE.title)
    const [description, setDescription] = useState(
      service?.description ?? DEFAULT_SERVICE.description
    )
    const [images, setImages] = useState(
      service?.images ?? DEFAULT_SERVICE.images
    )
    const [duration, setDuration] = useState(
      service?.duration ?? DEFAULT_SERVICE.duration ?? 0
    )
    const [price, setPrice] = useState(
      service?.price ?? DEFAULT_SERVICE.price ?? 0
    )
    const [groupId, setGroupId] = useState(
      service?.groupId ?? DEFAULT_SERVICE.groupId ?? ''
    )

    const [errors, checkErrors, , removeError] = useErrors()

    const groupOptions = [
      { value: '', label: 'Без группы' },
      ...serviceGroups
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((g) => ({ value: g._id, label: g.title })),
    ]

    const onClickConfirm = async () => {
      if (
        !checkErrors({
          title,
        })
      ) {
        closeModal()
        const result = await setService(
          {
            _id: service?._id,
            title,
            description,
            images,
            duration,
            price,
            groupId: groupId || null,
          },
          clone
        )
        if (typeof onSuccess === 'function' && result?._id) {
          onSuccess(result)
        }
      }
    }

    const onClickConfirmRef = useRef(onClickConfirm)

    useEffect(() => {
      onClickConfirmRef.current = onClickConfirm
    }, [onClickConfirm])

    useEffect(() => {
      const isFormChanged =
        service?.title !== title ||
        service?.description !== description ||
        service?.duration !== duration ||
        service?.price !== price ||
        service?.groupId !== (groupId || null) ||
        !compareArrays(service?.images, images)

      setOnConfirmFunc(
        isFormChanged ? () => onClickConfirmRef.current() : undefined
      )
      setOnShowOnCloseConfirmDialog(isFormChanged)
      setDisableConfirm(!isFormChanged)
    }, [title, duration, description, price, groupId])

    return (
      <>
        <FormWrapper>
          <InputImages
            label="Изображение"
            images={images}
            onChange={setImages}
            directory="services"
            maxImages={1}
          />
          <Input
            label="Название"
            type="text"
            value={title}
            onChange={(value) => {
              removeError('title')
              setTitle(value)
            }}
            error={errors.title}
            required
          />
          <div className="flex items-end mt-4 gap-x-1">
            {/* <div className="flex-1"> */}
            <Select
              label="Группа"
              help={fieldHelp['service.group']}
              value={groupId || ''}
              onChange={setGroupId}
              options={groupOptions}
              fullWidth
              noMargin
            />
            {/* </div> */}
            <AddIconButton
              onClick={() =>
                modalsFunc?.serviceGroup?.add((newGroup) => {
                  if (newGroup?._id) setGroupId(newGroup._id)
                })
              }
              title="Добавить группу"
              size="md"
            />
          </div>
          <Textarea
            label="Описание"
            help={fieldHelp['service.description']}
            value={description}
            onChange={(value) => {
              removeError('description')
              setDescription(value)
            }}
            error={errors.description}
            rows={4}
          />
          <InputDuration
            label="Продолжительность"
            help={fieldHelp['service.duration']}
            value={duration}
            onChange={(value) => {
              removeError('duration')
              setDuration(value)
            }}
            min={0}
          />
          <Input
            label="Цена"
            help={fieldHelp['service.price']}
            type="number"
            value={price}
            onChange={(value) => {
              removeError('price')
              setPrice(value)
            }}
            min={0}
            step={100}
            postfix="₽"
          />
        </FormWrapper>
        <ErrorsList errors={errors} />
      </>
    )
  }

  return {
    title: `${serviceId && !clone ? 'Редактирование' : 'Создание'} услуги`,
    confirmButtonName: serviceId && !clone ? 'Применить' : 'Создать',
    Children: ServiceModal,
  }
}

export default serviceFunc
