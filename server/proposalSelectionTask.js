import Events from '@models/Events'
import Proposals from '@models/Proposals'

const canceledTitle = 'Связаться с клиентом: выбор варианта КП отменён'
const selectedTitle = (title) =>
  `Связаться с клиентом: выбран вариант «${title}»`
const selectedDescription = (version) =>
  `Клиент выбрал коммерческое предложение версии ${version}.`
const canceledDescription = (version) =>
  `Клиент отменил выбор в коммерческом предложении версии ${version}. Уточните пожелания клиента.`

// Keep one follow-up, including after cancellation. Re-read the selection on
// retries so a delayed request cannot leave the task describing an older choice.
export async function syncProposalSelectionTask({ proposalId, tenantId }) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const proposal = await Proposals.findOne({
      _id: proposalId,
      tenantId,
    }).lean()
    if (!proposal) return
    const event = await Events.findOne({
      _id: proposal.eventId,
      tenantId,
    }).lean()
    if (!event) return
    const tasks = event.additionalEvents || []
    const titles = new Set([
      canceledTitle,
      ...proposal.packages.map((item) => selectedTitle(item.title)),
    ])
    const descriptions = new Set([
      selectedDescription(proposal.version),
      canceledDescription(proposal.version),
    ])
    const generated = (task) =>
      titles.has(task.title) && descriptions.has(task.description)
    let index = tasks.findIndex(
      (task) =>
        String(task._id) === String(proposal.selectionTaskId || proposal._id)
    )
    if (
      index < 0 &&
      !proposal.selectionTaskId &&
      proposal.selectionTaskCreatedAt
    ) {
      // Old tasks have no explicit proposal link. Only adopt a unique untouched
      // generated task for this version; never guess among multiple matches.
      const candidates = tasks
        .map((task, i) => (generated(task) ? i : -1))
        .filter((i) => i >= 0)
      if (candidates.length === 1) index = candidates[0]
    }
    const task = tasks[index]
    if (task && (task.done || !generated(task))) return
    const selected = proposal.packages.find(
      (item) => item.id === proposal.selectedPackageId
    )
    if (!task && (proposal.selectionTaskCreatedAt || !selected)) return
    const title = selected ? selectedTitle(selected.title) : canceledTitle
    const description = selected
      ? selectedDescription(proposal.version)
      : canceledDescription(proposal.version)
    const nextTask = task
      ? { ...task, title, description }
      : {
          // Stable per proposal: concurrent selections/retries cannot add a second task.
          _id: proposal._id,
          title,
          description,
          date: new Date(),
          done: false,
        }
    const changed =
      !task || task.title !== title || task.description !== description
    if (changed) {
      const nextTasks = task
        ? tasks.map((item, i) => (i === index ? nextTask : item))
        : [...tasks, nextTask]
      const result = await Events.updateOne(
        {
          _id: event._id,
          tenantId,
          // $literal avoids Mongoose adding new schema defaults to the old
          // array in the equality guard (legacy tasks may lack those fields).
          $expr: {
            $eq: [{ $ifNull: ['$additionalEvents', []] }, { $literal: tasks }],
          },
        },
        { $set: { additionalEvents: nextTasks }, $inc: { syncVersion: 1 } },
        { runValidators: true }
      )
      // Concurrent task edits are preserved. Retry against a fresh event/selection.
      if (!result.matchedCount) continue
    }
    if (!proposal.selectionTaskId) {
      await Proposals.updateOne(
        { _id: proposal._id, tenantId, selectionTaskId: null },
        {
          $set: {
            selectionTaskId: nextTask._id,
            ...(!proposal.selectionTaskCreatedAt
              ? { selectionTaskCreatedAt: new Date() }
              : {}),
          },
        }
      )
    }
    if (!changed) return
    // Verify once more after writing: another selection may have won meanwhile.
  }
  throw new Error(
    'Не удалось обновить задачу по выбору КП. Повторите запрос для сверки.'
  )
}
