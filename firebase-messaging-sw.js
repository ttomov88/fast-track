importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCEEFr5OacmCb-qMhE2m70xTfDzA6TMU9c",
  authDomain: "fast-track-app-tt.firebaseapp.com",
  projectId: "fast-track-app-tt",
  storageBucket: "fast-track-app-tt.firebasestorage.app",
  messagingSenderId: "368091780461",
  appId: "1:368091780461:web:2eb68c7d222a9b67fdf664"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification.title || 'Fast Track Alert';
  const notificationOptions = {
    body: payload.notification.body || 'You have an update regarding your fast.',
    icon: '/icons/icon-192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
