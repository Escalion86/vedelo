import Notice from '@components/Notice'

const TariffConditions = ({ tariffs = [], className }) => (
  <Notice tone="neutral" className={className}>
    <div className="space-y-2 text-sm">
      <p>
        Месячный лимит учитывает создание и заявок, и заказов — даже если работа
        назначена на другой месяц. Переход заявки в заказ не создаёт новую
        запись.
      </p>
      {tariffs.some((tariff) => tariff?.allowAi) ? (
        <p>
          Доступ к ИИ входит в соответствующий тариф. Использование встроенного
          ИИ оплачивается отдельно из баланса; при своём ключе — у выбранного
          ИИ-провайдера.
        </p>
      ) : null}
      {tariffs.some((tariff) => tariff?.allowTelephony) ? (
        <p>Номер и звонки оплачиваются отдельно оператору телефонии.</p>
      ) : null}
      {tariffs.some((tariff) => tariff?.allowAvitoIntegration) ? (
        <p>
          Для подключения Avito необходим доступ вашего аккаунта к Avito API.
        </p>
      ) : null}
    </div>
  </Notice>
)

export default TariffConditions
