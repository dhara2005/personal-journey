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

    console.log('[Firebase] Initializing...');
    firebase.initializeApp(firebaseConfig);

    var auth = firebase.auth();
    var db = firebase.firestore();
    console.log('[Firebase] Initialized OK');


    // ---- DOM References ----

    var signInBtn = document.getElementById('signInBtn');
    var signOutBtn = document.getElementById('signOutBtn');
    var userAvatar = document.getElementById('userAvatar');
    var userName = document.getElementById('userName');
    var authSection = document.getElementById('authSection');
    var syncStatus = document.getElementById('syncStatus');


    // ---- Track current signed-in user ----

    var currentUID = null;
    var unsubscribe = null;


    // ---- Sync Status Indicator ----

    function showSyncStatus(text, type) {
        if (!syncStatus) return;
        syncStatus.textContent = text;
        syncStatus.className = 'auth__sync-status sync-' + type;
        syncStatus.style.display = 'block';

        if (type === 'success') {
            setTimeout(function () {
                if (syncStatus) syncStatus.style.display = 'none';
            }, 4000);
        }
    }

    function hideSyncStatus() {
        if (syncStatus) syncStatus.style.display = 'none';
    }


    // ---- Auth State Listener ----

    auth.onAuthStateChanged(function (user) {
        console.log('[Firebase] Auth state changed:', user ? user.email : 'signed out');

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
        console.log('[Firebase] Starting Google sign-in...');
        var provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).then(function (result) {
            console.log('[Firebase] Sign-in successful:', result.user.email);
        }).catch(function (error) {
            console.error('[Firebase] Sign-in error:', error.code, error.message);
            if (error.code === 'auth/popup-blocked') {
                auth.signInWithRedirect(provider);
            } else if (error.code !== 'auth/popup-closed-by-user') {
                showSyncStatus('Sign-in failed: ' + error.message, 'error');
            }
        });
    }

    function signOut() {
        console.log('[Firebase] Signing out...');
        auth.signOut().catch(function (error) {
            console.error('[Firebase] Sign-out error:', error);
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

    function loadCloudData(uid) {
        console.log('[Firebase] Loading cloud data for uid:', uid);
        var docRef = db.collection('users').doc(uid);

        // Use get with source:'server' to force network fetch
        // Fall back to cache if server unavailable
        docRef.get().then(function (doc) {
            console.log('[Firebase] Firestore get() resolved. exists:', doc.exists, 'fromCache:', doc.metadata.fromCache);

            if (doc.exists) {
                var cloudData = doc.data();
                console.log('[Firebase] Cloud data:', JSON.stringify(cloudData));
                QuitApp.setState({
                    currentStreak: cloudData.currentStreak || 0,
                    longestStreak: cloudData.longestStreak || 0,
                    lastCheckIn: cloudData.lastCheckIn || null,
                    focusMode: cloudData.focusMode || false
                });
                showSyncStatus('✓ Synced', 'success');
            } else {
                console.log('[Firebase] No cloud data found — fresh account');
                var freshState = {
                    currentStreak: 0,
                    longestStreak: 0,
                    lastCheckIn: null,
                    focusMode: false
                };
                QuitApp.setState(freshState);
                // Write fresh state to cloud
                docRef.set(freshState).then(function () {
                    console.log('[Firebase] Fresh state saved to cloud');
                    showSyncStatus('✓ Synced', 'success');
                }).catch(function (error) {
                    console.error('[Firebase] WRITE FAILED:', error.code, error.message);
                    showSyncStatus('✗ Save failed: ' + error.code, 'error');
                });
            }

            // Start real-time listener
            startRealtimeSync(uid);

        }).catch(function (error) {
            console.error('[Firebase] READ FAILED:', error.code, error.message);
            showSyncStatus('✗ Read failed: ' + error.code, 'error');
            // Start listener anyway
            startRealtimeSync(uid);
        });
    }


    // ---- Real-time Sync ----

    function startRealtimeSync(uid) {
        stopCloudSync();
        var docRef = db.collection('users').doc(uid);

        console.log('[Firebase] Starting real-time listener for uid:', uid);

        unsubscribe = docRef.onSnapshot(function (doc) {
            console.log('[Firebase] Snapshot received. exists:', doc.exists, 'fromCache:', doc.metadata.fromCache, 'hasPendingWrites:', doc.metadata.hasPendingWrites);

            if (doc.exists && doc.metadata.hasPendingWrites === false) {
                var cloudData = doc.data();
                console.log('[Firebase] Applying cloud data:', JSON.stringify(cloudData));
                QuitApp.setState({
                    currentStreak: cloudData.currentStreak || 0,
                    longestStreak: cloudData.longestStreak || 0,
                    lastCheckIn: cloudData.lastCheckIn || null,
                    focusMode: cloudData.focusMode !== undefined ? cloudData.focusMode : false
                });
            }
        }, function (error) {
            console.error('[Firebase] Listener error:', error.code, error.message);
            showSyncStatus('✗ Sync lost: ' + error.code, 'error');
        });
    }

    function stopCloudSync() {
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }
    }


    // ---- Push to Cloud ----

    function syncToCloud() {
        if (!currentUID) {
            console.log('[Firebase] syncToCloud skipped — not signed in');
            return;
        }

        var state = QuitApp.getState();
        console.log('[Firebase] Writing to cloud:', JSON.stringify(state));

        db.collection('users').doc(currentUID).set({
            currentStreak: state.currentStreak,
            longestStreak: state.longestStreak,
            lastCheckIn: state.lastCheckIn,
            focusMode: state.focusMode
        }).then(function () {
            console.log('[Firebase] Write successful');
            showSyncStatus('✓ Synced', 'success');
        }).catch(function (error) {
            console.error('[Firebase] WRITE FAILED:', error.code, error.message);
            showSyncStatus('✗ Save failed: ' + error.code, 'error');
        });
    }


    // ---- Event Listeners ----

    signInBtn.addEventListener('click', signInWithGoogle);
    signOutBtn.addEventListener('click', signOut);


    // ---- Expose sync function globally ----

    window.FirebaseSync = {
        syncToCloud: syncToCloud
    };

    console.log('[Firebase] Sync module loaded');

})();
