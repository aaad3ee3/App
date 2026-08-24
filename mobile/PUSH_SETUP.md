# Push notifications setup

The app and backend are wired for Firebase Cloud Messaging, but **the credentials are
not in this repository** — you create a Firebase project and add its config files. Until
you do, everything still works: the backend logs `FCM not configured` and sends nothing,
and the app logs `Firebase unavailable` and runs normally. Nothing crashes, nothing is
blocked.

## What the customer receives

| Event | Notification |
|---|---|
| Wallet credited by a Libyana top-up | تم شحن رصيدك — مبلغ + الرصيد الجديد |
| Gift card order completed | تم تنفيذ طلبك — with a nudge to open طلباتي for the code |
| Social-media order completed (hours later) | تم تنفيذ طلبك |
| Order auto-refunded after a supplier error | تم استرجاع مبلغ طلبك |
| Order stuck awaiting admin review | طلبك قيد المراجعة |

That last one matters most: an ambiguous supplier failure debits the wallet and resolves
later by hand. Without a notification the customer sees money leave and nothing happen,
which is indistinguishable from being robbed.

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and create a project (e.g. `sayeh`).
2. Add an **Android** app with package name `com.sayeh.app` (check
   `android/app/build.gradle.kts` if you change it). Download `google-services.json` into
   `android/app/`.
3. Add an **iOS** app if you ship on iOS, and put `GoogleService-Info.plist` into
   `ios/Runner/` via Xcode.

### Android Gradle wiring

In `android/settings.gradle.kts`, add to the `plugins` block:

```kotlin
id("com.google.gms.google-services") version "4.4.2" apply false
```

And in `android/app/build.gradle.kts`:

```kotlin
plugins {
    id("com.google.gms.google-services")
}
```

## 2. Give the backend a service account

In the Firebase console: **Project settings → Service accounts → Generate new private
key**. That downloads a JSON file. Copy three values from it into `backend/.env`:

```
FCM_PROJECT_ID=your-project-id
FCM_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"
```

`FCM_PRIVATE_KEY` must keep its `\n` sequences as **literal backslash-n**, on one line,
wrapped in quotes — a `.env` file cannot hold real newlines. The backend converts them
back when initialising Firebase.

Treat that JSON like a password: anyone holding it can send notifications to every
customer as you. It is not in git, and `.env` is gitignored.

## 3. iOS only: APNs

Apple requires its own key on top of FCM. In the Apple Developer portal create an **APNs
auth key** (.p8), then upload it under Firebase **Project settings → Cloud Messaging →
Apple app configuration**. Push does not work on iOS without this step, including in
TestFlight.

## How it behaves in the app

- **Permission is requested after sign-in**, not at first launch. Asking before the user
  has anything to be notified about is the reliable way to get it permanently denied.
- **Tokens re-register on every launch and on rotation.** FCM rotates tokens after a
  reinstall or restore; a stale token silently stops delivering, with no error anywhere.
- **Signing out unregisters the device**, so a shared or resold phone stops receiving the
  previous account's notifications — they name order amounts and card codes.
- **Foreground notifications are shown as an in-app banner.** Android does not display a
  system notification while the app is open, so `HomeShell` surfaces it instead.

## Testing it

After adding the config, run the app on a real device (the Android emulator needs Play
Services; the simulator on iOS cannot receive push at all), sign in, then trigger a real
event — the simplest is an admin manual credit from the dashboard, which fires the
wallet-credited notification.

To confirm the device registered, check the backend:

```sql
SELECT user_id, platform, last_seen_at FROM device_tokens ORDER BY last_seen_at DESC;
```
