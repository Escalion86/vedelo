import { fieldHelpTexts, getFieldHelp, type FieldHelpKey } from './fieldHelp'

// Проверяется настоящий JSON-import через существующий jest-expo/Babel.
const webTexts = require('../../../../helpers/fieldHelp.json')

it('Android читает все 94 согласованных текста, равные веб-каталогу', () => {
  expect(Object.keys(fieldHelpTexts)).toHaveLength(94)
  expect(fieldHelpTexts).toEqual(webTexts)
  for (const key of Object.keys(fieldHelpTexts) as FieldHelpKey[]) {
    expect(getFieldHelp(key)).toBe(webTexts[key])
  }
})
