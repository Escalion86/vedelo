# BRIEF-U — авторский STOP после targeted RED

Дельта: в `mobile/package.json` добавлен только anchored ignore
`<rootDir>/__tests__/stageO/boundRead\\.ts$`; discovery 171 → 170, удалён только
non-test helper, `boundRead.stageO.test.ts` и все 170 реальных suites сохранены.
В существующем stageR bootstrap заранее разрешён штатный RN ActivityIndicator
через `void jest.requireActual('react-native').ActivityIndicator`; прежний
URL/TextDecoder fix сохранён. Продуктовый код и исходный support-тест неизменны.

До правки выполнен один диагностический этап: direct fresh, включение кэша,
реальное повторное использование кэша. Monotonic trace после исходных шести
assertions: send/loading commit 9578,57 мс, preset ActivityIndicator transform
7214,15 мс, genuine implementation 1329,57 мс. Перед send поле editable;
NetInfo вызван один раз, reply один раз, get/read-back всего два раза. После
синхронного render reply завершился за 5,56 мс, read-back за 1,04 мс. Direct
fresh отдельно показал дополнительные native ScrollView/Image/TextInput first-use
затраты; поэтому одна ActivityIndicator-подготовка не доказывает устранение всех
затрат fresh-сценария. Инструментация удалена; исходный тест восстановлен по SHA.

**Blocker:** после единственной минимальной правки stock support whole-suite
`--no-cache` снова RED: 15/16, runtime errors 0, pending 0, actual exit 1.
Исходный reply-case строки 96–115: timeout 5000 мс, duration 8466 мс,
numPassingAsserts 6; исходные exactargs/input-clear assertions не достигнуты.
Deadlines 5000/1000/20s не менялись. Второй repair attempt не выполнялся.

Cached support, affected 6 suites / 126 cases, typecheck и lint не запускались
после STOP. Final FULL не запускался автором; controller finalFULL/repeat и
независимый review ожидают решения контроллера, успешный candidate не заявлен.
`releaseApproved=false`; собственные команды завершены, `pending=[]`.

Первичные JSON/log/exit, baseline SHA, discovery comparison, raw timings и
минимальный diff: `/home/aleksei/reports/vedelo/2026-10-11/update/U-close-final-gates`.
