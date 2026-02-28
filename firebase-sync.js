/* ============================================================
   Quit Addiction — Firebase Sync Module
   Handles Google sign-in and Firestore cloud sync.
   Loaded AFTER app.js so it can access QuitApp global.
   ============================================================ */

(function () {
    'use strict';

    // ---- Firebase Config ----

    const firebaseConfig = {
        apiKey: "AIzaSyCtKj4LV8qoe7WBV-EHFLXbX70zrzX7otU",
        authDomain: "quit-addiction-b9825.firebaseapp.com",
        projectId: "quit-addiction-b9825",
        storageBucket: "quit-addiction-b9825.firebasestorage.app",
        messagingSenderId: "716341836765",
        appId: "1:716341836765:web:8be8378f9c4cf8867b1434",
        measurementId: "G-7L40L0FZBV"
    };


    // ---- Initialize Firebase ----

    firebase.initializeApp(firebaseConfig);

    const auth = firebase.auth();
    const db = firebase.firestore();

    // Enable offline persistence so Firestore works offline too
    db.enablePersistence({ synchronizeTabs: true }).catch(function (err) {
        console.warn('Firestore persistence unavailable:', err.code);
    });


    // ---- DOM References ----

    const signInBtn = document.getElementById('signInBtn');
    const signOutBtn = document.getElementById('signOutBtn');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const authSection = document.getElementById('authSection');


    // ---- Auth State Listener ----

    auth.onAuthStateChanged(function (user) {
        if (user) {
            // User is signed in
            showSignedInUI(user);
            startCloudSync(user.uid);
        } else {
            // User is signed out
            showSignedOutUI();
            stopCloudSync();
        }
    });


    // ---- Sign In / Sign Out ----

    function signInWithGoogle() {
        var provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(function (error) {
            console.error('Sign-in error:', error);
            // If popup blocked, fall back to redirect
            if (error.code === 'auth/popup-blocked') {
                auth.signInWithRedirect(provider);
            }
        });
    }

    function signOut() {
        auth.signOut().catch(function (error) {
            console.error('Sign-out error:', error);
        });
    }


    // ---- UI Updates ----

    function showSignedInUI(user) {
        signInBtn.style.display = 'none';
        signOutBtn.style.display = 'inline-flex';

        if (user.photoURL) {
            userAvatar.src = user.photoURL;
            userAvatar.alt = user.displayName || 'User';
            userAvatar.style.display = 'block';
        } else {
            userAvatar.style.display = 'none';
        }

        var firstName = (user.displayName || 'You').split(' ')[0];
        userName.textContent = 'Welcome, ' + firstName;
        userName.style.display = 'block';

        authSection.classList.add('signed-in');
    }

    function showSignedOutUI() {
        signInBtn.style.display = 'inline-flex';
        signOutBtn.style.display = 'none';
        userAvatar.style.display = 'none';
        userName.style.display = 'none';
        authSection.classList.remove('signed-in');
    }


    // ---- Cloud Sync ----

    var unsubscribe = null; // Firestore listener cleanup

    /**
     * Start real-time sync with Firestore.
     * On first sign-in, merge local data with cloud (keep higher values).
     */
    function startCloudSync(uid) {
        var docRef = db.collection('users').doc(uid);

        // First, merge local data with cloud
        docRef.get().then(function (doc) {
            var localState = QuitApp.getState();

            if (doc.exists) {
                var cloudData = doc.data();
                // Merge: take the higher streak values
                var merged = {
                    currentStreak: Math.max(localState.currentStreak || 0, cloudData.currentStreak || 0),
                    longestStreak: Math.max(localState.longestStreak || 0, cloudData.longestStreak || 0),
                    lastCheckIn: pickLatestDate(localState.lastCheckIn, cloudData.lastCheckIn),
                    focusMode: localState.focusMode
                };
                // Update cloud with merged data
                docRef.set(merged, { merge: true });
                // Update local
                QuitApp.setState(merged);
            } else {
                // No cloud data — push local data up
                docRef.set({
                    currentStreak: localState.currentStreak || 0,
                    longestStreak: localState.longestStreak || 0,
                    lastCheckIn: localState.lastCheckIn || null,
                    focusMode: localState.focusMode || false
                });
            }
        }).catch(function (error) {
            console.warn('Cloud sync initial read failed:', error);
        });

        // Real-time listener — update local state when cloud changes
        unsubscribe = docRef.onSnapshot(function (doc) {
            if (doc.exists) {
                var cloudData = doc.data();
                QuitApp.setState({
                    currentStreak: cloudData.currentStreak || 0,
                    longestStreak: cloudData.longestStreak || 0,
                    lastCheckIn: cloudData.lastCheckIn || null,
                    focusMode: cloudData.focusMode !== undefined ? cloudData.focusMode : false
                });
            }
        }, function (error) {
            console.warn('Cloud sync listener error:', error);
        });
    }

    function stopCloudSync() {
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }
    }

    /**
     * Push current state to Firestore.
     * Called by app.js after check-in or relapse.
     */
    function syncToCloud() {
        var user = auth.currentUser;
        if (!user) return;

        var state = QuitApp.getState();
        db.collection('users').doc(user.uid).set({
            currentStreak: state.currentStreak,
            longestStreak: state.longestStreak,
            lastCheckIn: state.lastCheckIn,
            focusMode: state.focusMode
        }, { merge: true }).catch(function (error) {
            console.warn('Cloud sync write failed:', error);
        });
    }

    /**
     * Pick the latest (most recent) date string, or whichever is non-null.
     */
    function pickLatestDate(a, b) {
        if (!a) return b || null;
        if (!b) return a;
        return a > b ? a : b;
    }


    // ---- Event Listeners ----

    signInBtn.addEventListener('click', signInWithGoogle);
    signOutBtn.addEventListener('click', signOut);


    // ---- Expose sync function globally for app.js to call ----

    window.FirebaseSync = {
        syncToCloud: syncToCloud
    };

})();
