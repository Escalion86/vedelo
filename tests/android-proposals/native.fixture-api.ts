import { buildProposalPreview } from '../../server/proposalPreview.mjs'
const html =
  '<p>Исходный текст</p><img src="https://cloud.escalion.ru/uploads/a.png"><video src="https://cloud.escalion.ru/uploads/a.mp4" controls></video>'
const template = {
  _id: 't',
  name: 'Шаблон клиента',
  status: 'active',
  blocks: [
    {
      id: 'intro',
      type: 'intro',
      title: 'Вступление',
      contentHtml: html,
      enabled: true,
    },
    { type: 'packages', title: 'Варианты', enabled: true },
  ],
  media: [],
  messageTemplate: 'Сообщение {{proposal.url}}',
  defaults: {
    packages: [
      {
        id: 'main',
        title: 'Основной',
        description: 'Описание',
        lines: [
          {
            serviceId: 's',
            title: 'Снимок услуги',
            description: 'Моя правка',
            price: 100,
          },
        ],
        total: 100,
        manualTotal: false,
        recommended: true,
      },
    ],
    servicesIds: ['s'],
  },
}
const proposal = {
  _id: 'p',
  eventId: 'e',
  title: 'КП для клиента',
  version: 1,
  status: 'expired',
  packages: template.defaults.packages,
  blocksSnapshot: template.blocks,
  mediaSnapshot: [],
  selectedPackageId: 'main',
  selectedAt: '2026-10-01',
  appliedPackageId: 'main',
  appliedSelectionAt: '2026-10-01',
  appliedAt: '2026-10-02',
}
const state = () =>
  ((window as any).__fixtureState ||= { calls: [], failSave: false })
export const proposalsApi = {
  template: async () => structuredClone(template),
  templateDefaults: async () => structuredClone(template),
  templates: async () => [structuredClone(template)],
  services: async () => [
    { _id: 's', title: 'Каталог изменён', price: 999 },
    { _id: 'new', title: 'Новая услуга', price: 30 },
  ],
  list: async () => [proposal],
  get: async () => proposal,
  readEvent: async () => ({ _id: 'e', status: 'active' }),
  saveTemplate: async (id: string, body: any) => {
    state().calls.push({ method: 'PATCH', id, body })
    if (state().failSave) throw Error('synthetic network failure')
    return { _id: id, ...body }
  },
  previewTemplate: async (id: string, body: any) => {
    state().calls.push({ method: 'PREVIEW', id, body })
    return buildProposalPreview({
      _id: id,
      title: body.name,
      version: 1,
      status: 'draft',
      blocksSnapshot: body.blocks,
      packages: body.defaults.packages,
      mediaSnapshot: body.media,
      clientSnapshot: { firstName: 'Анна' },
      artistSnapshot: { fullName: 'Исполнитель' },
      eventSnapshot: {},
    })
  },
}
