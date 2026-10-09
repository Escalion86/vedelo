import { FileImportError, getFileImportCharge } from '../helpers/fileImport.mjs'

// All money movements and response checkpoints share one atomic Mongo document.
// This works on standalone MongoDB without multi-document transactions.
export const createFileImportBudgetStore = ({ users, ownerId }) => {
  const pathFor = (id) => {
    if (!/^[a-f0-9]{24}_[ai]\d+$/.test(id))
      throw new Error('Invalid import budget id')
    return `aiFileImportBudgets.${id}`
  }
  const read = async (id) => {
    const path = pathFor(id)
    const user = await users.findOne(
      { _id: ownerId },
      { projection: { [path]: 1, balance: 1 } }
    )
    return user?.aiFileImportBudgets?.[id] || null
  }
  const reserve = async (
    id,
    {
      amountKopecks,
      markup,
      platform,
      feature,
      model,
      coveredProviderKopecks = 0,
    }
  ) => {
    const path = pathFor(id)
    const existing = await read(id)
    if (existing) return existing
    if (!Number.isSafeInteger(amountKopecks) || amountKopecks < 0)
      throw new Error('Invalid import budget')
    const markupValue =
      Number.isFinite(Number(markup)) && Number(markup) > 0 ? Number(markup) : 1
    // Часть себестоимости может быть включена в тариф: её платит платформа,
    // поэтому баланс резервируется только на оставшуюся сумму.
    const coveredProvider =
      Number.isSafeInteger(coveredProviderKopecks) && coveredProviderKopecks > 0
        ? Math.min(amountKopecks, coveredProviderKopecks)
        : 0
    const coveredApplied = coveredProvider
      ? Math.min(amountKopecks, Math.ceil(coveredProvider * markupValue))
      : 0
    const holdKopecks = platform ? Math.max(0, amountKopecks - coveredApplied) : 0
    const result = await users.updateOne(
      {
        _id: ownerId,
        balance: { $gte: holdKopecks / 100 },
        [path]: { $exists: false },
      },
      {
        $inc: { balance: -(holdKopecks / 100) },
        $set: {
          [path]: {
            amountKopecks,
            holdKopecks,
            coveredProviderKopecks: coveredProvider,
            spentKopecks: 0,
            spentCoveredProviderKopecks: 0,
            markup,
            platform,
            feature,
            model,
            closed: false,
            operations: {},
            version: 0,
            createdAt: new Date(),
          },
        },
      }
    )
    if (!result.matchedCount) {
      const raced = await read(id)
      if (raced) return raced
      throw new FileImportError(
        'Недостаточно средств. Пополните баланс и продолжите импорт.',
        'AI_BALANCE_INSUFFICIENT',
        402
      )
    }
    return read(id)
  }
  const execute = async (id, operationId, request) => {
    if (!/^[a-z0-9_]+$/.test(operationId))
      throw new Error('Invalid operation id')
    const path = pathFor(id)
    const budget = await read(id)
    const operationPath = `${path}.operations.${operationId}`
    const previous = budget?.operations?.[operationId]
    if (previous?.status === 'succeeded') return previous.result
    if (previous)
      throw new FileImportError(
        'Этот запрос уже выполнялся. Повтор доступен отдельным запуском с новой сметой.',
        'AI_OPERATION_INTERRUPTED'
      )
    if (!budget || budget.closed)
      throw new FileImportError(
        'Резерв закрыт. Рассчитайте стоимость повторно.',
        'AI_BUDGET_CLOSED'
      )
    if (
      budget.platform &&
      budget.spentKopecks >= Number(budget.holdKopecks ?? budget.amountKopecks) &&
      (budget.spentCoveredProviderKopecks || 0) >=
        (budget.coveredProviderKopecks || 0)
    )
      throw new FileImportError(
        'Достигнут согласованный предел расходов. Рассчитайте стоимость оставшихся записей.',
        'AI_BUDGET_EXHAUSTED'
      )
    const claimed = await users.updateOne(
      {
        _id: ownerId,
        [`${path}.closed`]: false,
        [operationPath]: { $exists: false },
      },
      {
        $set: { [operationPath]: { status: 'running', startedAt: new Date() } },
        $inc: { [`${path}.version`]: 1 },
      }
    )
    if (!claimed.matchedCount)
      throw new FileImportError(
        'Запрос уже выполняется.',
        'AI_OPERATION_BUSY',
        409
      )
    let result
    try {
      result = await request()
      if (!result)
        throw new FileImportError('ИИ-провайдер недоступен.', 'AI_UNAVAILABLE')
      for (let attempt = 0; attempt < 5; attempt++) {
        const current = await read(id)
        if (current.closed)
          throw new FileImportError('Резерв закрыт.', 'AI_BUDGET_CLOSED')
        const charge = current.platform
          ? getFileImportCharge(current, result.usage)
          : { charged: 0, uncovered: 0 }
        const saved = await users.updateOne(
          {
            _id: ownerId,
            [`${path}.version`]: current.version,
            [`${operationPath}.status`]: 'running',
            [`${path}.closed`]: false,
          },
          {
            $set: {
              [operationPath]: {
                status: 'succeeded',
                result,
                ...charge,
                finishedAt: new Date(),
              },
            },
            $inc: {
              [`${path}.spentKopecks`]: charge.charged,
              [`${path}.spentCoveredProviderKopecks`]:
                charge.coveredProviderKopecks || 0,
              [`${path}.version`]: 1,
            },
          }
        )
        if (saved.matchedCount) return result
      }
      throw new FileImportError(
        'Не удалось сохранить результат запроса.',
        'AI_CHECKPOINT_FAILED'
      )
    } catch (error) {
      await users.updateOne(
        { _id: ownerId, [`${operationPath}.status`]: 'running' },
        {
          $set: {
            [operationPath]: {
              status: 'failed',
              errorCode: error.code || 'AI_PROVIDER_FAILED',
              finishedAt: new Date(),
            },
          },
          $inc: { [`${path}.version`]: 1 },
        }
      )
      throw error
    }
  }
  const close = async (id) => {
    const path = pathFor(id)
    for (let attempt = 0; attempt < 5; attempt++) {
      const budget = await read(id)
      if (!budget || budget.closed) return budget
      // Only the job lease owner closes a budget, after its requests have stopped.
      const holdKopecks = Number(budget.holdKopecks ?? budget.amountKopecks ?? 0)
      const refund = (holdKopecks - budget.spentKopecks) / 100
      const result = await users.updateOne(
        {
          _id: ownerId,
          [`${path}.version`]: budget.version,
          [`${path}.closed`]: false,
        },
        {
          $inc: { balance: refund, [`${path}.version`]: 1 },
          $set: { [`${path}.closed`]: true, [`${path}.closedAt`]: new Date() },
        }
      )
      if (result.matchedCount) return read(id)
    }
    throw new FileImportError(
      'Не удалось освободить резерв. Повторите запрос.',
      'AI_REFUND_PENDING'
    )
  }
  return { read, reserve, execute, close }
}
