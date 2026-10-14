// Resolve and warm the genuine Expo globals before test and findBy deadlines.
new globalThis.URL('https://bootstrap.invalid')
new globalThis.TextDecoder().decode(new Uint8Array())

// Resolve the unchanged RN preset host and its genuine ActivityIndicator
// before the first send/loading commit enters the test deadline.
void jest.requireActual('react-native').ActivityIndicator
