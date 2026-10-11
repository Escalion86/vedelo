'use client'

import { useWindowDimensionsTailwindNum } from '@helpers/useWindowDimensions'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import { DateTimePicker as MUIDateTimePicker } from '@mui/x-date-pickers'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { ruRU } from '@mui/x-date-pickers/locales'
import cn from 'classnames'
import dayjs from 'dayjs'
import 'dayjs/locale/ru'
import ru from 'dayjs/locale/ru'
import InputWrapper from './InputWrapper'

dayjs.locale(ru)

const toIsoOrNull = (date) => {
  if (!date) return null
  const parsed = dayjs(date)
  if (!parsed.isValid()) return undefined
  return parsed.toISOString()
}

const DateTimePicker = ({
  label = '',
  help,
  value,
  onChange,
  required = false,
  labelClassName,
  className,
  disabled = false,
  error,
  fullWidth = false,
  defaultValue,
  noMargin,
  startWithYear = false,
}) => {
  const widthNum = useWindowDimensionsTailwindNum()
  const pickerFieldSx = {
    '& .MuiOutlinedInput-notchedOutline': {
      borderStyle: 'none',
      outline: 'none',
      boxShadow: 'none',
    },
    '& .MuiPickersOutlinedInput-notchedOutline': {
      borderStyle: 'none',
      outline: 'none',
      boxShadow: 'none',
    },
    '& .MuiPickersOutlinedInput-root': {
      borderStyle: 'none',
      padding: 0,
      margin: 0,
      boxShadow: 'none',
    },
    '& .MuiInputBase-root': {
      minHeight: 28,
      height: 28,
      fontSize: '0.875rem',
      lineHeight: '1.25rem',
      padding: 0,
      boxSizing: 'border-box',
    },
    '& .MuiInputBase-input': {
      height: 28,
      minHeight: 28,
      padding: 0,
      lineHeight: '1.25rem',
      boxSizing: 'border-box',
    },
    '& .MuiPickersInputBase-root': {
      minHeight: 28,
      height: 28,
      padding: 0,
    },
    '& .MuiPickersSectionList-root': {
      padding: 0,
      minHeight: 28,
      alignItems: 'center',
    },
    '& .MuiInputAdornment-root': {
      marginLeft: -2,
      marginRight: 2,
    },
    '& .MuiButtonBase-root': {
      padding: 0,
    },
  }

  return (
    <InputWrapper
      label={label}
      help={help}
      labelClassName={labelClassName}
      value={value}
      className={cn(
        fullWidth
          ? ''
          : widthNum <= 2
            ? 'w-[12rem] max-w-[12rem]'
            : 'w-70 max-w-70',
        className
      )}
      required={required}
      error={error}
      // postfix={
      //   value &&
      //   (showYears || showZodiac) &&
      //   '(' +
      //     (showYears ? birthDateToAge(value) : '') +
      //     (showYears && showZodiac ? ', ' : '') +
      //     (showZodiac ? getZodiac(value).name : '') +
      //     ')'
      // }
      fullWidth={fullWidth}
      // paddingY="small"
      disabled={disabled}
      showDisabledIcon={false}
      noMargin={noMargin}
      paddingY="small"
    >
      <LocalizationProvider
        dateAdapter={AdapterDayjs}
        adapterLocale={'ru'}
        localeText={
          ruRU.components.MuiLocalizationProvider.defaultProps.localeText
        }
      >
        <MUIDateTimePicker
          className={cn(
            'border-0 ring-0 outline-hidden',
            widthNum <= 2 ? 'w-[12rem]' : 'w-[12rem]'
          )}
          sx={pickerFieldSx}
          inputFormat={widthNum <= 2 ? 'dd.MM.yyyy HH:mm' : 'dd.MM.yyyy'}
          openTo={startWithYear ? 'year' : 'day'}
          views={
            widthNum <= 2
              ? ['year', 'month', 'day', 'hours', 'minutes']
              : ['year', 'month', 'day']
          }
          value={value === null ? null : value ? dayjs(value) : undefined}
          defaultValue={defaultValue ? dayjs(defaultValue) : undefined}
          onChange={(date) => {
            const nextValue = toIsoOrNull(date)
            if (nextValue !== undefined) onChange(nextValue)
          }}
          disabled={disabled}
          showDisabledIcon={false}
          // slotProps={{
          //   textField: {
          //     sx: { boxShadow: 'none' },
          //     // sx: { outline: 'none' },
          //     // disableUnderline: true,
          //     // outlined: false,
          //     // size: 'small',
          //     // paddingX: 0,
          //     // sx: { paddingX: 0, padding: 0 },
          //     // margin: 0,
          //   },
          //   // layout: {
          //   //   sx: { padding: 0, margin: 0, p: 0, px: 0 },
          //   //   slotProps: {
          //   //     root: { sx: { padding: 0, margin: 0, p: 0, px: 0 } },
          //   //   },
          //   // },
          // }}
        />
        {widthNum > 2 && (
          <MUIDateTimePicker
            className="w-[10rem] border-0 ring-0 outline-hidden"
            sx={{
              ...pickerFieldSx,
              '& .MuiPickersOutlinedInput-root': {
                borderStyle: 'none',
                marginLeft: 2,
                padding: 0,
                marginTop: 0,
                marginBottom: 0,
                boxShadow: 'none',
              },
              '& .MuiInputAdornment-root': {
                marginLeft: -2,
                marginRight: 3,
              },
            }}
            inputFormat="HH:mm"
            openTo="hours"
            views={['hours', 'minutes']}
            value={value === null ? null : value ? dayjs(value) : undefined}
            defaultValue={defaultValue ? dayjs(defaultValue) : undefined}
            slots={{
              openPickerIcon: AccessTimeIcon,
            }}
            onChange={(date) => {
              const nextValue = toIsoOrNull(date)
              if (nextValue !== undefined) onChange(nextValue)
            }}
            disabled={disabled}
            showDisabledIcon={false}
          />
        )}
      </LocalizationProvider>
    </InputWrapper>
  )
}

export default DateTimePicker
