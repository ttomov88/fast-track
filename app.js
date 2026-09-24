const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let timerInterval = null;
let startTime = null;

// DOM Elements
const authBtn = document.getElementById('auth-btn');
const notifyBtn = document.getElementById('notify-btn');
const userDisplay = document.getElementById('user-display');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const timerDisplay = document.getElementById('timer');
const fastList = document.getElementById('fastList');

// Auth Listener
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    if (userDisplay) userDisplay.innerText = `Logged in: ${user.email}`;
    if (authBtn) authBtn.innerText = "Log Out";
    if (notifyBtn) notifyBtn.style.display = "inline-block";
    loadUserFasts();
  } else {
    currentUser = null;
    if (userDisplay) userDisplay.innerText = "Not logged in";
    if (authBtn) authBtn.innerText = "Log In with Google";
    if (notifyBtn) notifyBtn.style.display = "none";
    if (fastList) fastList.innerHTML = "";
  }
});

function toggleAuth() {
  if (currentUser) {
    auth.signOut();
  } else {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => alert("Login error: " + err.message));
  }
}

// Timer Logic
if (startBtn) {
  startBtn.addEventListener('click', () => {
    startTime = Date.now();
    startBtn.disabled = true;
    stopBtn.disabled = false;
    
    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const hours = String(Math.floor(elapsed / 3600)).padStart(2, '0');
      const minutes = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
      const seconds = String(elapsed % 60).padStart(2, '0');
      timerDisplay.innerText = `${hours}:${minutes}:${seconds}`;
    }, 1000);
  });
}

if (stopBtn) {
  stopBtn.addEventListener('click', async () => {
    clearInterval(timerInterval);
    const endTime = Date.now();
    const durationSeconds = Math.floor((endTime - startTime) / 1000);
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
    timerDisplay.innerText = "00:00:00";

    if (currentUser) {
      await db.collection('users').doc(currentUser.uid).collection('fasts').add({
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        durationSeconds: durationSeconds,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      loadUserFasts();
    }
  });
}

// Load Fasts from Firestore
async function loadUserFasts() {
  if (!currentUser || !fastList) return;

  try {
    const snapshot = await db.collection('users')
      .doc(currentUser.uid)
      .collection('fasts')
      .orderBy('createdAt', 'desc')
      .get();

    fastList.innerHTML = "";
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const li = document.createElement('li');
      const hours = (data.durationSeconds / 3600).toFixed(1);
      const dateStr = new Date(data.startTime).toLocaleDateString();
      li.innerText = `${dateStr} — Duration: ${hours} hrs`;
      fastList.appendChild(li);
    });
  } catch (err) {
    console.error("Error loading fasts:", err);
  }
}

// Push Notifications
async function requestNotificationPermission() {
  if (!currentUser) return;
  try {
    const messaging = firebase.messaging();
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await messaging.getToken();
      await db.collection('users').doc(currentUser.uid).set({
        fcmToken: token
      }, { merge: true });
      alert("Notifications enabled!");
    }
  } catch (err) {
    console.error("Notification setup error:", err);
  }
}
