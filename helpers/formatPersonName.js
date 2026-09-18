const formatPersonName = (value) => {
  if (typeof value !== 'string') return value

  return value
    .toLocaleLowerCase('ru-RU')
    .replace(/(^|[\s'’\-])(\p{L})/gu, (_, separator, letter) =>
      `${separator}${letter.toLocaleUpperCase('ru-RU')}`
    )
}

export default formatPersonName
