const projectId = String(
  process.env.VITE_FIREBASE_PROJECT_ID || 'demo-travel-e2e',
);
const apiKey = String(
  process.env.VITE_FIREBASE_API_KEY || 'emulator-api-key',
);
const authOrigin = 'http://127.0.0.1:9099';
const uid = String(process.env.VITE_E2E_AUTH_UID || 'e2e-owner');
const email = `${uid}@example.test`;

const wait = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

async function waitForAuthEmulator() {
  let lastError = null;
  const accountsUrl = (
    `${authOrigin}/emulator/v1/projects/${encodeURIComponent(projectId)}/accounts`
  );

  for (let attempt = 1; attempt <= 120; attempt += 1) {
    try {
      const response = await fetch(accountsUrl, { method: 'DELETE' });
      if (response.ok) return;
      lastError = new Error(`Auth Emulator 回傳 ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await wait(250);
  }

  throw new Error(`無法連線 Auth Emulator：${String(lastError)}`);
}

async function seedFixedGoogleUser() {
  const response = await fetch(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/projects/`
      + `${encodeURIComponent(projectId)}/accounts:batchCreate?key=`
      + encodeURIComponent(apiKey),
    {
      method: 'POST',
      headers: {
        authorization: 'Bearer owner',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        allowOverwrite: true,
        users: [{
          localId: uid,
          email,
          emailVerified: true,
          displayName: 'E2E Owner',
          photoUrl: 'https://example.test/e2e-owner.png',
          providerUserInfo: [{
            providerId: 'google.com',
            rawId: uid,
            email,
            displayName: 'E2E Owner',
            photoUrl: 'https://example.test/e2e-owner.png',
          }],
        }],
      }),
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || (Array.isArray(payload.error) && payload.error.length > 0)) {
    throw new Error(
      `無法預建 E2E Google 帳號：${response.status} ${JSON.stringify(payload)}`,
    );
  }
}

await waitForAuthEmulator();
await seedFixedGoogleUser();
