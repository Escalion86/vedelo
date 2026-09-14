# GitHub Secrets Setup — Ведело Mobile

## Required Secrets

### 1. EXPO_TOKEN

1. Go to https://expo.dev/settings/access-tokens
2. Click "Create Token"
3. Name: `GitHub Actions EAS Build`
4. Copy the token
5. Go to GitHub repo → Settings → Secrets and variables → Actions
6. Click "New repository secret"
7. Name: `EXPO_TOKEN`
8. Value: paste the Expo token

### 2. GOOGLE_PLAY_SERVICE_ACCOUNT_JSON

1. Go to Google Play Console → Settings → API access
2. Click "Create new service account"
3. Follow the link to Google Cloud Console
4. Create a service account with "Service Account User" role
5. Create a JSON key
6. Back in Play Console, grant "Release Manager" role to the service account
7. Copy the entire JSON key content
8. Go to GitHub repo → Settings → Secrets and variables → Actions
9. Click "New repository secret"
10. Name: `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
11. Value: paste the entire JSON key

### 3. GOOGLE_SERVICES_JSON

Android push требует Firebase-конфигурацию внутри APK/AAB:

1. Откройте Firebase Console и зарегистрируйте Android-приложение с package `ru.escalion.artistcrm`.
2. Скачайте `google-services.json`.
3. В EAS environments `production` и `preview` создайте переменную `GOOGLE_SERVICES_JSON` типа **File** и загрузите этот файл.
4. Для локальной development-сборки положите файл в `mobile/google-services.json` (он исключён из Git).

Production API URL and scheme are defined in the EAS `production` profile. Public VK ID and Firebase config are stored in EAS environments and validated during the build.

### 4. Apple App Store Connect API Key (for TestFlight)

Required for iOS TestFlight uploads.

1. Go to https://appstoreconnect.apple.com/access/users
2. Click "Keys" tab
3. Click "Generate API Key"
4. Name: `GitHub Actions EAS Submit`
5. Access: `App Manager`
6. Download the `.p8` key file (you can only download once!)
7. Note the Key ID and Issuer ID

Add these secrets to GitHub:

| Secret Name           | Value                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `APPLE_API_KEY`       | Contents of the `.p8` file (the entire text including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`) |
| `APPLE_API_KEY_ID`    | The Key ID (e.g., `ABCD123456`)                                                                                      |
| `APPLE_API_ISSUER_ID` | The Issuer ID (e.g., `12345678-1234-1234-1234-123456789012`)                                                         |
| `APPLE_ID`            | Your Apple Developer account email (e.g., `escalion86@gmail.com`)                                                    |
| `APPLE_ASC_APP_ID`    | The App Store Connect App ID (numeric, found in App Store Connect → App Information)                                 |
| `APPLE_TEAM_ID`       | Your Apple Developer Team ID (10 characters, found in developer.apple.com → Membership)                              |

## After Secrets Are Set

Push to main branch to trigger the build:

```bash
git add .
git commit -m "trigger: iOS TestFlight + Android Internal Testing build"
git push origin main
```

Or manually dispatch from GitHub Actions tab.

## EAS Project

- Project ID: `7772a8bd-ffb8-4ee9-b4d6-53019cc3994f`
- Android build profile: `production` (AAB for Play Store)
- Android submit profile: `production` (Google Play track `internal`)

## App Store Connect Setup (First Time)

Before the first TestFlight upload, you must:

1. Create the app in App Store Connect with bundle ID `ru.escalion.artistcrm`
2. Complete the app information (name, description, screenshots, icon)
3. Complete the age rating questionnaire
4. Fill out the Privacy section
5. Add a privacy policy URL
6. Create the TestFlight group for external testers
7. Add external testers (their email addresses)

**Note**: The first IPA upload may require manual processing in App Store Connect. After that, automated uploads via the workflow will work.

## Google Play Console Setup (First Time)

Before the first upload, you must:

1. Create the app in Google Play Console with package `ru.escalion.artistcrm`
2. Complete the store listing (name, description, screenshots, icon)
3. Complete the content rating questionnaire
4. Fill out the Data Safety section
5. Add a privacy policy URL
6. Create the Internal Testing track
7. Add internal testers (their email addresses)

**Note**: The first AAB upload may need to be done manually via Play Console. After that, automated uploads via the workflow will work.
