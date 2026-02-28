/* ============================================================
   Quit Addiction — Firebase Sync Module
   Handles Google sign-in and Firestore cloud sync.
   Each Google account has its own isolated streak data.
   Uses redirect flow on mobile for reliable auth.
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

    console.log('[Sync] Initializing Firebase...');
    firebase.initializeApp(firebaseConfig);

    var auth = firebase.auth();
    var db = firebase.firestore();
    console.log('[Sync] Firebase initialized');


    // ---- DOM References ----

    var signInBtn = document.getElementById('signInBtn');
    var signOutBtn = document.getElementById('signOutBtn');
    var userAvatar = document.getElementById('userAvatar');
    var userName = document.getElementById('userName');
    var authSection = document.getElementById('authSection');
    var syncStatus = document.getElementById('syncStatus');


    // ---- State ----

    var currentUID = null;
    var unsubscribe = null;


    // ---- Detect mobile ----

    function isMobile() {
        return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }


    // ---- Sync Status ----

    function showStatus(text, type) {
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


    // ---- Auth ----

    // Check for redirect result on page load (for mobile flow)
    auth.getRedirectResult().then(function (result) {
        if (result.user) {
            console.log('[Sync] Redirect sign-in success:', result.user.email);
        }
    }).catch(function (error) {
        console.error('[Sync] Redirect error:', error.code, error.message);
        showStatus('Sign-in error: ' + error.code, 'error');
    });

    auth.onAuthStateChanged(function (user) {
        console.log('[Sync] Auth changed:', user ? user.email : 'signed out');
        if (user) {
            currentUID = user.uid;
            showSignedInUI(user);
            showStatus('Syncing...', 'loading');
            loadCloudData(user.uid);
        } else {
            currentUID = null;
            showSignedOutUI();
            stopSync();
            QuitApp.setState({
                currentStreak: 0,
                longestStreak: 0,
                lastCheckIn: null,
                focusMode: false
            });
        }
    });

    function signIn() {
        console.log('[Sync] Starting sign-in, mobile:', isMobile());
        var provider = new firebase.auth.GoogleAuthProvider();

        if (isMobile()) {
            // Redirect flow — more reliable on mobile browsers
            auth.signInWithRedirect(provider);
        } else {
            // Popup flow on desktop
            auth.signInWithPopup(provider).then(function (result) {
                console.log('[Sync] Popup sign-in success:', result.user.email);
            }).catch(function (error) {
                console.error('[Sync] Popup error:', error.code, error.message);
                if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
                    // Fall back to redirect
                    auth.signInWithRedirect(provider);
                } else {
                    showStatus('Sign-in failed: ' + error.code, 'error');
                }
            });
        }
    }

    function signOut() {
        auth.signOut();
    }


    // ---- UI ----

    function showSignedInUI(user) {
        signInBtn.style.display = 'none';
        signOutBtn.style.display = 'inline-flex';
        if (user.photoURL) {
            userAvatar.src = user.photoURL;
            userAvatar.alt = user.displayName || '';
            userAvatar.style.display = 'block';
        } else {
            userAvatar.style.display = 'none';
        }
        var name = (user.displayName || 'You').split(' ')[0];
        userName.textContent = 'Hi, ' + name;
        userName.style.display = 'block';
        authSection.classList.add('signed-in');
    }

    function showSignedOutUI() {
        signInBtn.style.display = 'inline-flex';
        signOutBtn.style.display = 'none';
        userAvatar.style.display = 'none';
        userName.style.display = 'none';
        authSection.classList.remove('signed-in');
        showStatus('', 'hidden');
        if (syncStatus) syncStatus.style.display = 'none';
    }


    // ---- Firestore Sync ----

    function loadCloudData(uid) {
        console.log('[Sync] Loading data for:', uid);
        var docRef = db.collection('users').doc(uid);

        docRef.get().then(function (doc) {
            console.log('[Sync] Got doc. exists:', doc.exists, 'cache:', doc.metadata.fromCache);

            if (doc.exists) {
                var d = doc.data();
                console.log('[Sync] Data:', JSON.stringify(d));
                QuitApp.setState({
                    currentStreak: d.currentStreak || 0,
                    longestStreak: d.longestStreak || 0,
                    lastCheckIn: d.lastCheckIn || null,
                    focusMode: d.focusMode || false
                });
                showStatus('✓ Synced', 'success');
            } else {
                console.log('[Sync] New account — creating doc');
                var fresh = { currentStreak: 0, longestStreak: 0, lastCheckIn: null, focusMode: false };
                QuitApp.setState(fresh);
                docRef.set(fresh).then(function () {
                    console.log('[Sync] Created new doc');
                    showStatus('✓ Synced', 'success');
                }).catch(function (err) {
                    console.error('[Sync] CREATE FAILED:', err.code, err.message);
                    showStatus('✗ Failed: ' + err.code, 'error');
                });
            }

            startListener(uid);
        }).catch(function (err) {
            console.error('[Sync] READ FAILED:', err.code, err.message);
            showStatus('✗ Failed: ' + err.code, 'error');
            startListener(uid);
        });
    }

    function startListener(uid) {
        stopSync();
        console.log('[Sync] Starting listener for:', uid);

        unsubscribe = db.collection('users').doc(uid).onSnapshot(function (doc) {
            if (doc.exists && !doc.metadata.hasPendingWrites) {
                var d = doc.data();
                console.log('[Sync] Live update:', JSON.stringify(d));
                QuitApp.setState({
                    currentStreak: d.currentStreak || 0,
                    longestStreak: d.longestStreak || 0,
                    lastCheckIn: d.lastCheckIn || null,
                    focusMode: d.focusMode !== undefined ? d.focusMode : false
                });
            }
        }, function (err) {
            console.error('[Sync] LISTENER ERROR:', err.code, err.message);
            showStatus('✗ Sync lost: ' + err.code, 'error');
        });
    }

    function stopSync() {
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    }

    function syncToCloud() {
        if (!currentUID) return;
        var s = QuitApp.getState();
        console.log('[Sync] Writing:', JSON.stringify(s));

        db.collection('users').doc(currentUID).set({
            currentStreak: s.currentStreak,
            longestStreak: s.longestStreak,
            lastCheckIn: s.lastCheckIn,
            focusMode: s.focusMode
        }).then(function () {
            console.log('[Sync] Write OK');
            showStatus('✓ Synced', 'success');
        }).catch(function (err) {
            console.error('[Sync] WRITE FAILED:', err.code, err.message);
            showStatus('✗ Save failed: ' + err.code, 'error');
        });
    }


    // ---- Events ----

    signInBtn.addEventListener('click', signIn);
    signOutBtn.addEventListener('click', signOut);


    // ---- Public API ----

    window.FirebaseSync = { syncToCloud: syncToCloud };
    console.log('[Sync] Module ready');

})();
