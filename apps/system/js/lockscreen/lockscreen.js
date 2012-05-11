/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var LockScreen = {
  get overlay() {
    delete this.overlay;
    return this.overlay = document.getElementById('lockscreen');
  },

  get padlockOverlay() {
    delete this.padlockOverlay;
    return this.padlockOverlay = document.getElementById('keypadscreen');
  },

  get notification() {
    delete this.notification;
    return this.notification = document.getElementById('lockscreenNotification');
  },

  locked: true,

  init: function lockscreen_init() {
    var events = ['touchstart', 'touchmove', 'touchend', 'keydown', 'keyup', 'transitionend'];
    AddEventHandlers(LockScreen.overlay, this, events);
    this.update();

    this.notification.addEventListener('click', this);

    window.addEventListener('mozChromeEvent', function notificationListener(e) {
      var detail = e.detail;
      if (detail.type !== 'desktop-notification')
        return;

      LockScreen.showNotification(detail.title, detail.text);
    });

    PadLock.init();

    if (localStorage['passcode-lock'] == 'false') {
      this.unlockPadlock(true);
    }
  },

  update: function lockscreen_update() {
    if (localStorage['lockscreen'] == 'false') {
      this.unlock(true);
      return;
    }

    this.lock(true);
  },

  showNotification: function lockscreen_showNotification(title, detail) {
    this.notification.dataset.visible = true;
    this.notification.firstChild.textContent = title;
    this.notification.lastChild.textContent = detail;
  },

  hideNotification: function lockscreen_hideNotification() {
    delete this.notification.dataset.visible;
  },

  lock: function lockscreen_lock(instant) {
    var style = this.overlay.style;

    if (this.locked) {
      if (instant) {
        style.MozTransition = style.MozTransform = '';
        this.lockPadlock();
      } else {
        style.MozTransition = '-moz-transform 0.2s linear';
      }
      style.MozTransform = 'translateY(0)';
      return;
    }

    var wasAlreadyLocked = this.locked;

    this.locked = true;
    if (instant) {
      style.MozTransition = style.MozTransform = '';
      this.lockPadlock();
    } else {
      style.MozTransition = '-moz-transform 0.2s linear';
      style.MozTransform = 'translateY(0)';
    }

    screen.mozLockOrientation('portrait-primary');

    if (!wasAlreadyLocked) {
      var evt = document.createEvent('CustomEvent');
      evt.initCustomEvent('locked', true, true, null);
      window.dispatchEvent(evt);
    }
  },

  lockPadlock: function lockscreen_lockPadlock() {
    if (localStorage['passcode-lock'] == 'false')
      return;

    var style = this.padlockOverlay.style;
    style.MozTransform = '';
    style.MozTransition = '';
  },

  // Unlock the lockscreen, doing an animation for the specified time.
  // If no time is specified use a default of 0.2 seconds.
  // For backward compatibility, you can pass true as the first argument
  // for a time of 0.
  unlock: function lockscreen_unlock(time) {
    var style = this.overlay.style;

    if (time == undefined)
      time = 0.2;
    else if (time === true)
      time = 0;

    if (time === 0)
      style.MozTransition = style.MozTransform = '';
    else
      style.MozTransition = '-moz-transform ' + time + 's linear';
    style.MozTransform = 'translateY(-100%)';

    if (localStorage['passcode-lock'] == 'false') {
      this.unlockPadlock(true);
    }
  },

  unlockPadlock: function lockscreen_unlockPadlock(instant) {
    var wasAlreadyUnlocked = !this.locked;

    var style = this.padlockOverlay.style;
    if (instant)
      style.MozTransition = style.MozTransform = '';
    else
      style.MozTransition = '-moz-transform 0.2s linear';
    style.MozTransform = 'translateY(-100%)';

    WindowManager.setOrientationForApp(WindowManager.getDisplayedApp());

    this.locked = false;
    delete this.padlockOverlay.dataset.active;

    if (!wasAlreadyUnlocked) {
      var evt = document.createEvent('CustomEvent');
      evt.initCustomEvent('unlocked', true, true, null);
      window.dispatchEvent(evt);

      this.hideNotification();
    }
  },

  onTouchStart: function lockscreen_touchStart(e) {
    this.startY = this.lastY = e.pageY;
    this.lastTime = e.timeStamp;
    this.velocity = 0;
    this.moving = true;
  },

  onTouchMove: function lockscreen_touchMove(e) {
    if (this.moving) {
      this.velocity = (this.lastY - e.pageY) / (e.timeStamp - this.lastTime);
      this.lastY = e.pageY;
      this.lastTime = e.timeStamp;
      var dy = Math.max(0, this.startY - e.pageY);
      var style = this.overlay.style;
      style.MozTransition = '';
      style.MozTransform = 'translateY(' + (-dy) + 'px)';
    }
  },

  // Tune these parameters to make the lockscreen unlock feel right
  FRICTION: 0.01,           // pixels/ms/ms
  UNLOCK_THRESHOLD: 0.25,    // fraction of screen height

  onTouchEnd: function lockscreen_touchend(e) {
    if (this.moving) {
      this.moving = false;

      // Physics:
      // An object moving with a velocity v against a frictional
      // deceleration a will travel a distance of 0.5*v*v/a before
      // coming to rest (I think).
      //
      // If the user's gesture plus the distance due to the gesture velocity
      // is more than the unlock threshold times screen height,
      // unlock the phone. Otherwise move the lockscreen back down again.
      //
      var dy = Math.max(0, this.startY - e.pageY);
      var distance = dy +
        0.5 * this.velocity * this.velocity / LockScreen.FRICTION;

      if (distance > window.innerHeight * LockScreen.UNLOCK_THRESHOLD) {
        // Perform the animation at the gesture velocity
        var distanceRemaining = window.innerHeight - dy;
        var timeRemaining = distanceRemaining / this.velocity / 1000;
        // But don't take longer than 1/2 second to complete it.
        timeRemaining = Math.min(timeRemaining, .5);
        this.unlock(timeRemaining);
      } else {
        this.lock();
      }
    }
  },

  handleEvent: function lockscreen_handleEvent(e) {
    switch (e.type) {
      case 'click':
        this.hideNotification();
        break;

      case 'transitionend':
        if (localStorage['passcode-lock'] !== 'true')
          return;
        if (this.locked) {
          this.lockPadlock();
        } else {
          delete this.padlockOverlay.dataset.status;
        }
        break;

      case 'touchstart':
        this.onTouchStart(e.touches[0]);
        this.overlay.setCapture(false);
        break;

      case 'touchmove':
        this.onTouchMove(e.touches[0]);
        break;

      case 'touchend':
        this.onTouchEnd(e.changedTouches[0]);
        document.releaseCapture();
        break;

      case 'keydown':
        if (e.keyCode != e.DOM_VK_SLEEP || !navigator.mozPower.screenEnabled)
          return;

        this._timeout = window.setTimeout(function() {
          SleepMenu.show();
        }, 1500);
        break;

      case 'keyup':
        if (e.keyCode != e.DOM_VK_SLEEP || SleepMenu.visible)
          return;
        window.clearTimeout(this._timeout);

        if (navigator.mozPower.screenEnabled) {
          this.update();
          ScreenManager.turnScreenOff();
        } else {
          // XXX: screen could be turned off by idle service instead of us.
          // Update the lockscreen again when turning the screen on.
          // (home screen would still flash when USB is plugged in)
          this.update();
          ScreenManager.turnScreenOn();
        }

        e.preventDefault();
        e.stopPropagation();
        break;

      default:
        return;
    }
    e.preventDefault();
  }
};

var PadLock = {
  get padlockOverlay() {
    delete this.padlockOverlay;
    return this.padlockOverlay = document.getElementById('keypadscreen');
  },

  get codeUI() {
    delete this.codeUI;
    return this.codeUI = document.getElementById('keypadscreen-code');
  },

  passCode: '0000',

  currentCode: '',

  init: function padlock_init() {
    this.padlockOverlay.addEventListener('click', this);
  },

  updateCodeUI: function padlock_updateCodeUI() {
    var i = 4;
    while (i--) {
      var span = this.codeUI.childNodes[i];
      if (this.currentCode.length > i)
        span.dataset.dot = true;
      else
        delete span.dataset.dot;
    }
  },

  handleEvent: function padlock_handleEvent(e) {
    if (this.padlockOverlay.dataset.status)
      return;

    if (!e.target.dataset.key)
      return;

    switch (e.target.dataset.key) {
      case 'e':
        // XXX: TBD
        break;
      case 'b':
        if (!this.currentCode) {
          LockScreen.lock();
          break;
        }
        this.currentCode =
          this.currentCode.substr(0, this.currentCode.length - 1);
        this.updateCodeUI();

        break;
      default:
        if (this.currentCode.length === 4)
          break;

        this.currentCode += e.target.dataset.key;
        this.updateCodeUI();

        if (this.currentCode.length === 4) {
          if (this.currentCode === this.passCode) {
            this.padlockOverlay.dataset.status = 'success';
            setTimeout(function () {
              delete PadLock.padlockOverlay.dataset.status;
              LockScreen.unlockPadlock();
              PadLock.currentCode = '';
              PadLock.updateCodeUI();
            }, 500);
          } else {
            this.padlockOverlay.dataset.status = 'error';
            setTimeout(function () {
              delete PadLock.padlockOverlay.dataset.status;
              PadLock.currentCode = '';
              PadLock.updateCodeUI();
            }, 500);
          }
        }
        break;
    }
  }
};
