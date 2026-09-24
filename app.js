const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;

// Track authentication state changes
auth.onAuthStateChanged(user => {
  const userDisplay = document.getElementById('user-display');
  const authBtn = document.getElementById('auth-btn');
  const appContainer = document.getElementById('app-container');

  if (user) {
    currentUser = user;
    if (userDisplay) userDisplay.innerText = `Logged in: ${user.email}`;
    if (authBtn) authBtn.innerText = "Log Out";
    if (appContainer) appContainer.style.display = "block";
    
    // Automatically load saved data from Cloud Firestore
    loadUserFasts();
  } else {
    currentUser = null;
    if (userDisplay) userDisplay.innerText = "Not logged in";
    if (authBtn) authBtn.innerText = "Log In with Google";
    if (appContainer) appContainer.style.display = "none";
  }
});

// Google Sign-In & Sign-Out Handler
function toggleAuth() {
  if (currentUser) {
    auth.signOut();
  } else {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => {
      alert("Login failed: " + err.message);
    });
  }
}

// SAVE FASTING DATA TO FIRESTORE (Replaces local file download)
async function saveFastRecord(fastData) {
  if (!currentUser) {
    alert("Please log in to save your fasts.");
    return;
  }

  try {
    await db.collection('users').doc(currentUser.uid).collection('fasts').add({
      ...fastData,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log("Fast saved to database!");
  } catch (err) {
    console.error("Error saving fast:", err);
  }
}

// LOAD SAVED FASTS FROM FIRESTORE
async function loadUserFasts() {
  if (!currentUser) return;

  try {
    const snapshot = await db.collection('users')
      .doc(currentUser.uid)
      .collection('fasts')
      .orderBy('updatedAt', 'desc')
      .get();

    const fasts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log("Loaded user fasts from database:", fasts);
  } catch (err) {
    console.error("Error loading fasts:", err);
  }
}

// ENABLE PHONE PUSH NOTIFICATIONS
async function requestNotificationPermission() {
  if (!currentUser) {
    alert("Please log in first.");
    return;
  }

  try {
    const messaging = firebase.messaging();
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await messaging.getToken();
      await db.collection('users').doc(currentUser.uid).set({
        fcmToken: token,
        tokenUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      alert("Notifications enabled for this device!");
    } else {
      alert("Notification permission denied.");
    }
  } catch (err) {
    console.error("Notification setup error:", err);
  }
}
