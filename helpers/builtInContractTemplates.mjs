const payment = {
  key: 'ПОРЯДОК_ОПЛАТЫ',
  label: 'Порядок оплаты',
  required: true,
  multiline: true,
  placeholder: 'Укажите суммы, сроки и способ оплаты',
}

export const BUILT_IN_CONTRACT_TEMPLATES = [
  {
    id: 'builtin-contract-artist-performance-v1',
    name: 'Выступление артиста или иллюзиониста',
    specialization: 'events',
    description: 'Программа выступления, требования к площадке и согласование переноса.',
    fields: [
      {
        key: 'ПРОГРАММА_ВЫСТУПЛЕНИЯ',
        label: 'Программа и продолжительность',
        required: true,
        multiline: true,
        placeholder: 'Например, сценическая программа 30 минут с участием зрителей',
      },
      {
        key: 'ТРЕБОВАНИЯ_К_ПЛОЩАДКЕ',
        label: 'Технические требования и подготовка',
        required: true,
        multiline: true,
        placeholder: 'Укажите время доступа, оборудование сторон и место для подготовки',
      },
      payment,
    ],
  },
  {
    id: 'builtin-contract-event-host-v1',
    name: 'Ведение мероприятия',
    specialization: 'events',
    description: 'Подготовка сценария, тайминг и границы ответственности ведущего.',
    fields: [
      {
        key: 'ТАЙМИНГ_ВЕДЕНИЯ',
        label: 'Программа и часы работы ведущего',
        required: true,
        multiline: true,
        placeholder: 'Укажите главные части программы и время начала и окончания',
      },
      {
        key: 'СОГЛАСОВАНИЕ_СЦЕНАРИЯ',
        label: 'Подготовка и согласование сценария',
        required: true,
        multiline: true,
        placeholder: 'Укажите, когда заказчик даёт вводные и утверждает сценарий',
      },
      payment,
    ],
  },
  {
    id: 'builtin-contract-private-photography-v1',
    name: 'Частная фотосъёмка',
    specialization: 'photo_video',
    description: 'Семейная, портретная или событийная съёмка с передачей обработанных фото.',
    fields: [
      {
        key: 'УСЛОВИЯ_СЪЕМКИ',
        label: 'Формат и продолжительность съёмки',
        required: true,
        multiline: true,
        placeholder: 'Укажите время работы, формат и нужные кадры',
      },
      {
        key: 'ПЕРЕДАЧА_ФОТОГРАФИЙ',
        label: 'Фотографии и срок передачи',
        required: true,
        multiline: true,
        placeholder: 'Укажите количество, обработку, формат, способ и срок передачи',
      },
      payment,
    ],
  },
  {
    id: 'builtin-contract-commercial-photography-v1',
    name: 'Коммерческая фотосъёмка',
    specialization: 'photo_video',
    description: 'Съёмка для бизнеса с согласованием задания и лицензией на использование фото.',
    fields: [
      {
        key: 'ЗАДАНИЕ_НА_СЪЕМКУ',
        label: 'Задание и требования к фотографиям',
        required: true,
        multiline: true,
        placeholder: 'Укажите объекты, референсы, число кадров, обработку и форматы файлов',
      },
      {
        key: 'ПЕРЕДАЧА_И_ПРАВКИ',
        label: 'Передача, проверка и правки',
        required: true,
        multiline: true,
        placeholder: 'Укажите сроки, способ передачи и число согласованных раундов правок',
      },
      {
        key: 'ОБЪЕМ_ЛИЦЕНЗИИ',
        label: 'Способы, территория и срок использования',
        required: true,
        multiline: true,
        placeholder: 'Например, копирование и публикация на сайте и в соцсетях бренда по всему миру на 1 год',
      },
      {
        key: 'ВОЗНАГРАЖДЕНИЕ_ЗА_ЛИЦЕНЗИЮ',
        label: 'Вознаграждение за лицензию в общей цене',
        required: true,
        placeholder: 'Например, 5 000 рублей',
      },
      payment,
    ],
  },
  {
    id: 'builtin-contract-repair-estimate-v1',
    name: 'Ремонтные работы по смете',
    specialization: 'repair_home',
    description: 'Объём работ, материалы, сроки, дополнительные работы и приёмка на объекте.',
    fields: [
      {
        key: 'СМЕТА_РАБОТ',
        label: 'Смета и объём работ',
        required: true,
        multiline: true,
        placeholder: 'Укажите объёмы и позиции сметы или название и дату подписанного приложения',
      },
      {
        key: 'МАТЕРИАЛЫ_И_ДОСТУП',
        label: 'Материалы и доступ на объект',
        required: true,
        multiline: true,
        placeholder: 'Укажите, кто закупает материалы, и как подрядчик получает доступ',
      },
      {
        key: 'СРОКИ_РАБОТ',
        label: 'Дата начала, окончания и этапы',
        required: true,
        multiline: true,
        placeholder: 'Укажите даты начала и завершения и промежуточные сроки, если они есть',
      },
      payment,
    ],
  },
  {
    id: 'builtin-contract-website-development-v1',
    name: 'Разработка сайта',
    specialization: 'digital_services',
    description: 'Техническое задание, этапы, приёмка, передача доступов и лицензия на сайт.',
    fields: [
      {
        key: 'ТЕХНИЧЕСКОЕ_ЗАДАНИЕ',
        label: 'Техническое задание и критерии приёмки',
        required: true,
        multiline: true,
        placeholder: 'Укажите страницы, функции и критерии проверки или данные подписанного ТЗ',
      },
      {
        key: 'ЭТАПЫ_РАЗРАБОТКИ',
        label: 'Этапы, сроки и правки',
        required: true,
        multiline: true,
        placeholder: 'Укажите сроки начала и сдачи, этапы и сроки проверки и правок',
      },
      {
        key: 'ПЕРЕДАЧА_САЙТА',
        label: 'Передача сайта и доступов',
        required: true,
        multiline: true,
        placeholder: 'Укажите, что передаётся, кто оформляет домен и хостинг и когда',
      },
      {
        key: 'ОБЪЕМ_ЛИЦЕНЗИИ',
        label: 'Способы, территория и срок использования',
        required: true,
        multiline: true,
        placeholder: 'Например, размещение на сайте заказчика, копирование и изменение по всему миру на 5 лет',
      },
      {
        key: 'ВОЗНАГРАЖДЕНИЕ_ЗА_ЛИЦЕНЗИЮ',
        label: 'Вознаграждение за лицензию в общей цене',
        required: true,
        placeholder: 'Например, 10 000 рублей',
      },
      payment,
    ],
  },
  {
    id: 'builtin-contract-general-services-v1',
    name: 'Оказание услуг',
    specialization: 'other',
    description: 'Общий договор с описанием услуг, сроками, порядком сдачи и оплаты.',
    fields: [
      {
        key: 'УСЛОВИЯ_ОКАЗАНИЯ',
        label: 'Состав, место и сроки оказания услуг',
        required: true,
        multiline: true,
        placeholder: 'Укажите объём, место или онлайн-формат, сроки и действия сторон',
      },
      {
        key: 'ПОРЯДОК_СДАЧИ',
        label: 'Подтверждение оказания услуг',
        required: true,
        multiline: true,
        placeholder: 'Укажите, что передаёт исполнитель и как стороны подтверждают завершение',
      },
      payment,
    ],
  },
].map((template) => ({
  ...template,
  documentType: 'contract',
  version: 1,
}))

export const getBuiltInContractTemplateMetadata = (id) =>
  BUILT_IN_CONTRACT_TEMPLATES.find((template) => template.id === id) ?? null

export const getRecommendedBuiltInContractTemplates = (preset) => {
  if (!preset) return []

  const matching = BUILT_IN_CONTRACT_TEMPLATES.filter(
    (template) => template.specialization === preset
  )
  return matching.length
    ? matching
    : BUILT_IN_CONTRACT_TEMPLATES.filter((template) => template.specialization === 'other')
}
