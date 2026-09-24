const auth = firebase.auth();
const db = firebase.firestore();
const messaging = firebase.messaging();

let currentUser = null;

// Track user login state
auth.onAuthStateChanged(user => {
  const userDisplay = document.getElementById('user-display');
  const authBtn = document.getElementById('auth-btn');

  if (user) {
    currentUser = user;
    if (userDisplay) userDisplay.innerText = `User: ${user.email}`;
    if (authBtn) authBtn.innerText = "Log Out";
    
    initPushNotifications();
    loadUserFasts();
  } else {
    currentUser = null;
    if (userDisplay) userDisplay.innerText = "Not logged in";
    if (authBtn) authBtn.innerText = "Log In with Google";
  }
});

// Trigger Google Login or Logout
function toggleAuth() {
  if (currentUser) {
    auth.signOut();
  } else {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => alert("Login failed: " + err.message));
  }
}

// SAVE DATA TO FIRESTORE (Replaces local file download export)
async function saveFastRecord(fastData) {
  if (!currentUser) {
    alert("Please log in first to save your data.");
    return;
  }

  try {
    await db.collection('users').doc(currentUser.uid).collection('fasts').add({
      ...fastData,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log("Fast successfully saved to Google Cloud!");
  } catch (err) {
    console.error("Error saving fast to database:", err);
  }
}

// LOAD DATA FROM FIRESTORE
async function loadUserFasts() {
  if (!currentUser) return;

  try {
    const snapshot = await db.collection('users')
      .doc(currentUser.uid)
      .collection('fasts')
      .orderBy('createdAt', 'desc')
      .get();

    const fasts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log("Loaded fast records from cloud:", fasts);
  } catch (err) {
    console.error("Error loading fasts:", err);
  }
}

// REGISTER PHONE PUSH NOTIFICATIONS
async function initPushNotifications() {
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await messaging.getToken();
      
      await db.collection('users').doc(currentUser.uid).set({
        fcmToken: token,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      console.log("Notifications activated for this device.");
    }
  } catch (err) {
    console.warn("Notification permission error or denied:", err);
  }
}
