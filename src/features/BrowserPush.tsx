import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction, adminApi } from "./shared";
import { browserSubscription, pushKey, samePushKey } from "@/lib/browser-push";
export async function removeBrowserPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await adminApi.delete("/auth/web-push", {
      endpoint: subscription.endpoint,
    });
    await subscription.unsubscribe();
  }
  for (const notification of await registration.getNotifications())
    notification.close();
}
export default function BrowserPush() {
  const supported =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  const [enabled, setEnabled] = useState(false);
  const action = useAction();
  const configQuery = useQuery({
    queryKey: ["web-push-config"],
    queryFn: ({ signal }) =>
      adminApi.get<{ enabled: boolean; public_key: string }>(
        "/auth/web-push",
        signal,
      ),
    enabled: supported,
    retry: false,
  });
  useEffect(() => {
    let active = true;
    setEnabled(false);
    const config = configQuery.data;
    if (supported && config?.enabled)
      void navigator.serviceWorker
        .getRegistration()
        .then((r) => r?.pushManager.getSubscription())
        .then((s) => {
          if (active)
            setEnabled(!!s && samePushKey(s, pushKey(config.public_key)));
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [supported, configQuery.data]);
  async function enable() {
    await action.run(async () => {
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          "Notifications are blocked. Allow them in browser settings, then try again.",
        );
      const config = configQuery.data;
      if (!config?.enabled)
        throw new Error(
          "Browser notifications have not been enabled on the server yet.",
        );
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration?.active)
        throw new Error(
          "Install or reload the production app before enabling notifications.",
        );
      const subscription = await browserSubscription(
        registration,
        pushKey(config.public_key),
      );
      try {
        await adminApi.post("/auth/web-push", subscription.toJSON());
      } catch (e) {
        await subscription.unsubscribe();
        throw e;
      }
      setEnabled(true);
    }, "Browser notifications enabled");
  }
  return (
    <section className="feature-card">
      <h3>Browser notifications</h3>
      {action.feedback}
      {supported &&
      !enabled &&
      (configQuery.isError || configQuery.data?.enabled === false) ? (
        <p>
          Browser push is not available on this backend yet. You can still use
          the notification feed.
        </p>
      ) : supported ? (
        <>
          <p>
            {enabled
              ? "Notifications enabled on this browser."
              : "Receive venue updates even when the app is closed."}
          </p>
          <button
            className="operator-action"
            disabled={action.busy || (!enabled && !configQuery.data?.enabled)}
            onClick={() =>
              enabled
                ? void action.run(async () => {
                    await removeBrowserPush();
                    setEnabled(false);
                  }, "Browser notifications disabled")
                : void enable()
            }
          >
            {enabled ? "Disable notifications" : "Enable notifications"}
          </button>
        </>
      ) : (
        <p>
          This browser does not support push notifications. The in-app
          notification feed is still available.
        </p>
      )}
    </section>
  );
}
