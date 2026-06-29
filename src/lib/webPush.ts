/**
 * Web Push Client Utility
 * Handles service worker registration and push subscription
 */

// Convert ArrayBuffer to Base64
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Register service worker
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registered successfully');
    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return null;
  }
}

// Subscribe to push notifications
export async function subscribeToPush(userId: string): Promise<boolean> {
  try {
    // Check if push is supported
    if (!('PushManager' in window)) {
      console.warn('Push notifications not supported');
      return false;
    }

    // Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return false;
    }

    // Get service worker registration
    const registration = await navigator.serviceWorker.ready;

    // Get VAPID public key from environment
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      console.warn('VAPID public key not configured');
      return false;
    }

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
    });

    // Send subscription to server
    const response = await fetch('/api/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        p256dh_key: btoa(
          String.fromCharCode.apply(null, Array.from(new Uint8Array(subscription.getKey('p256dh')!)))
        ),
        auth_key: btoa(
          String.fromCharCode.apply(null, Array.from(new Uint8Array(subscription.getKey('auth')!)))
        ),
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to save subscription');
    }

    console.log('Successfully subscribed to push notifications');
    return true;
  } catch (error) {
    console.error('Failed to subscribe to push:', error);
    return false;
  }
}

// Unsubscribe from push notifications
export async function unsubscribeFromPush(userId: string): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      return false;
    }

    // Unsubscribe from push
    await subscription.unsubscribe();

    // Remove from server
    await fetch(`/api/push?endpoint=${encodeURIComponent(subscription.endpoint)}`, {
      method: 'DELETE',
      headers: { 'x-user-id': userId },
    });

    console.log('Successfully unsubscribed from push notifications');
    return true;
  } catch (error) {
    console.error('Failed to unsubscribe from push:', error);
    return false;
  }
}

// Check if currently subscribed
export async function isSubscribed(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch {
    return false;
  }
}

// Initialize push notifications (call on app load)
export async function initPushNotifications(userId: string): Promise<void> {
  // Register service worker
  await registerServiceWorker();

  // Auto-subscribe if already granted permission
  if (Notification.permission === 'granted') {
    const alreadySubscribed = await isSubscribed();
    if (!alreadySubscribed) {
      await subscribeToPush(userId);
    }
  }
}
