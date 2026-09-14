import MigrationClient from './MigrationClient'

export const metadata = {
  title: 'Перенос в Ведело',
  description: 'Безопасный перенос входа из ArtistCRM в Ведело.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function MigrationPage() {
  return <MigrationClient />
}
