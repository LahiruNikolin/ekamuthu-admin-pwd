export function pushKey(value: string) {
  return Uint8Array.from(
    atob(value.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
}

export function samePushKey(subscription: PushSubscription, key: Uint8Array) {
  const stored = subscription.options?.applicationServerKey;
  if (!stored) return false;
  const bytes = new Uint8Array(stored);
  return (
    bytes.length === key.length && bytes.every((value, i) => value === key[i])
  );
}

export async function browserSubscription(
  registration: ServiceWorkerRegistration,
  key: ReturnType<typeof pushKey>,
) {
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !samePushKey(subscription, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  return (
    subscription ||
    registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    })
  );
}
