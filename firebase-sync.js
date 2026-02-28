/* ============================================================
   Quit Addiction — Firebase Sync Module
   Handles Google sign-in and Firestore cloud sync.
   Each Google account has its own isolated streak data.
   Loaded AFTER app.js so it can access QuitApp global.
   ============================================================ */

(function () {
    'use strict';

    // ---- Firebase Config ----

    var firebaseConfig = {
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

    var auth = firebase.auth();
    var db = firebase.firestore();

    // Enable offline persistence so Firestore works offline too
    db.enablePersistence({ synchronizeTabs: true }).catch(function (err) {
        console.warn('Firestore persistence unavailable:', err.code);
    });


    // ---- DOM References ----

    var signInBtn = document.getElementById('signInBtn');
    var signOutBtn = document.getElementById('signOutBtn');
    var userAvatar = document.getElementById('userAvatar');
    var userName = document.getElementById('userName');
    var authSection = document.getElementById('authSection');
    var syncStatus = document.getElementById('syncStatus');


    // ---- Track current signed-in user ----

    var currentUID = null;
    var unsubscribe = null; // Firestore listener cleanup


    // ---- Sync Status Indicator ----

    function showSyncStatus(text, type) {
        // type: 'success', 'error', 'loading'
        syncStatus.textContent = text;
        syncStatus.className = 'auth__sync-status sync-' + type;
        syncStatus.style.display = 'inline';

        // Auto-hide success messages after 3s
        if (type === 'success') {
            setTimeout(function () {
                syncStatus.style.display = 'none';
            }, 3000);
        }
    }

    function hideSyncStatus() {
        syncStatus.style.display = 'none';
    }


    // ---- Auth State Listener ----

    auth.onAuthStateChanged(function (user) {
        if (user) {
            currentUID = user.uid;
            showSignedInUI(user);
            showSyncStatus('Syncing...', 'loading');
            loadCloudData(user.uid);
        } else {
            currentUID = null;
            showSignedOutUI();
            stopCloudSync();
            hideSyncStatus();
            // Reset to default empty state when signed out
            QuitApp.setState({
                currentStreak: 0,
                longestStreak: 0,
                lastCheckIn: null,
                focusMode: false
            });
        }
    });


    // ---- Sign In / Sign Out ----

    function signInWithGoogle() {
        var provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(function (error) {
            console.error('Sign-in error:', error.code, error.message);
            if (error.code === 'auth/popup-blocked') {
                auth.signInWithRedirect(provider);
            } else {
                showSyncStatus('Sign-in failed: ' + error.message, 'error');
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


    // ---- Cloud Data Loading ----

    /**
     * Load data from Firestore for this specific user.
     * Each account is fully isolated — no localStorage merge.
     * If cloud data exists, load it. Otherwise start fresh.
     */
    function loadCloudData(uid) {
        var docRef = db.collection('users').doc(uid);

        docRef.get().then(function (doc) {
            if (doc.exists) {
                var cloudData = doc.data();
                QuitApp.setState({
                    currentStreak: cloudData.currentStreak || 0,
                    longestStreak: cloudData.longestStreak || 0,
                    lastCheckIn: cloudData.lastCheckIn || null,
                    focusMode: cloudData.focusMode || false
                });
                showSyncStatus('✓ Synced', 'success');
            } else {
                // Brand new account — start at zero and save to cloud
                var freshState = {
                    currentStreak: 0,
                    longestStreak: 0,
                    lastCheckIn: null,
                    focusMode: false
                };
                docRef.set(freshState).then(function () {
                    showSyncStatus('✓ Synced', 'success');
                }).catch(function (error) {
                    console.error('Cloud write failed:', error.code, error.message);
                    showSyncStatus('✗ Sync failed — check Firestore rules', 'error');
                });
                QuitApp.setState(freshState);
            }

            // Now start real-time listener for ongoing changes from other devices
            startRealtimeSync(uid);
        }).catch(function (error) {
            console.error('Cloud read failed:', error.code, error.message);
            showSyncStatus('✗ Sync failed — check Firestore rules', 'error');
            startRealtimeSync(uid);
        });
    }


    // ---- Real-time Sync ----

    /**
     * Listen for changes pushed from other devices.
     */
    function startRealtimeSync(uid) {
        stopCloudSync();

        var docRef = db.collection('users').doc(uid);

        unsubscribe = docRef.onSnapshot(function (doc) {
            if (doc.exists && doc.metadata.hasPendingWrites === false) {
                // Only update from server-confirmed writes (ignore local echoes)
                var cloudData = doc.data();
                QuitApp.setState({
                    currentStreak: cloudData.currentStreak || 0,
                    longestStreak: cloudData.longestStreak || 0,
                    lastCheckIn: cloudData.lastCheckIn || null,
                    focusMode: cloudData.focusMode !== undefined ? cloudData.focusMode : false
                });
            }
        }, function (error) {
            console.error('Realtime listener error:', error.code, error.message);
            showSyncStatus('✗ Sync lost — check connection', 'error');
        });
    }

    function stopCloudSync() {
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }
    }


    // ---- Push to Cloud ----

    /**
     * Push current state to Firestore.
     * Called by app.js after check-in, relapse, or focus toggle.
     */
    function syncToCloud() {
        if (!currentUID) return;

        var state = QuitApp.getState();
        db.collection('users').doc(currentUID).set({
            currentStreak: state.currentStreak,
            longestStreak: state.longestStreak,
            lastCheckIn: state.lastCheckIn,
            focusMode: state.focusMode
        }).then(function () {
            showSyncStatus('✓ Synced', 'success');
        }).catch(function (error) {
            console.error('Cloud write failed:', error.code, error.message);
            showSyncStatus('✗ Save failed — check Firestore rules', 'error');
        });
    }


    // ---- Event Listeners ----

    signInBtn.addEventListener('click', signInWithGoogle);
    signOutBtn.addEventListener('click', signOut);


    // ---- Expose sync function globally for app.js to call ----

    window.FirebaseSync = {
        syncToCloud: syncToCloud
    };

})();
