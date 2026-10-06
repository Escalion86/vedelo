// The web import OAuth requires a browser session and gc_oauth_state cookie.
// Mobile Google OAuth writes googleCalendar (sync), never googleCalendarImport.
// Do not call sync auth-url as an import substitute or put credentials in a URL.
export const calendarImportEntry = Object.freeze({
  nativeSupported: false,
  webUrl: 'https://vedelo.ru/cabinet/import',
})
