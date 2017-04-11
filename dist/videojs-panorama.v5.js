(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*! npm.im/intervalometer */
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function intervalometer(cb, request, cancel, requestParameter) {
	var requestId;
	var previousLoopTime;
	function loop(now) {
		// must be requested before cb() because that might call .stop()
		requestId = request(loop, requestParameter);

		// called with "ms since last call". 0 on start()
		cb(now - (previousLoopTime || now));

		previousLoopTime = now;
	}
	return {
		start: function start() {
			if (!requestId) { // prevent double starts
				loop(0);
			}
		},
		stop: function stop() {
			cancel(requestId);
			requestId = null;
			previousLoopTime = 0;
		}
	};
}

function frameIntervalometer(cb) {
	return intervalometer(cb, requestAnimationFrame, cancelAnimationFrame);
}

function timerIntervalometer(cb, delay) {
	return intervalometer(cb, setTimeout, clearTimeout, delay);
}

exports.intervalometer = intervalometer;
exports.frameIntervalometer = frameIntervalometer;
exports.timerIntervalometer = timerIntervalometer;
},{}],2:[function(require,module,exports){
/*! npm.im/iphone-inline-video */
'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var Symbol = _interopDefault(require('poor-mans-symbol'));
var intervalometer = require('intervalometer');

function preventEvent(element, eventName, toggleProperty, preventWithProperty) {
	function handler(e) {
		if (Boolean(element[toggleProperty]) === Boolean(preventWithProperty)) {
			e.stopImmediatePropagation();
			// console.log(eventName, 'prevented on', element);
		}
		delete element[toggleProperty];
	}
	element.addEventListener(eventName, handler, false);

	// Return handler to allow to disable the prevention. Usage:
	// const preventionHandler = preventEvent(el, 'click');
	// el.removeEventHandler('click', preventionHandler);
	return handler;
}

function proxyProperty(object, propertyName, sourceObject, copyFirst) {
	function get() {
		return sourceObject[propertyName];
	}
	function set(value) {
		sourceObject[propertyName] = value;
	}

	if (copyFirst) {
		set(object[propertyName]);
	}

	Object.defineProperty(object, propertyName, {get: get, set: set});
}

function proxyEvent(object, eventName, sourceObject) {
	sourceObject.addEventListener(eventName, function () { return object.dispatchEvent(new Event(eventName)); });
}

function dispatchEventAsync(element, type) {
	Promise.resolve().then(function () {
		element.dispatchEvent(new Event(type));
	});
}

// iOS 10 adds support for native inline playback + silent autoplay
var isWhitelisted = 'object-fit' in document.head.style && /iPhone|iPod/i.test(navigator.userAgent) && !matchMedia('(-webkit-video-playable-inline)').matches;

var ಠ = Symbol();
var ಠevent = Symbol();
var ಠplay = Symbol('nativeplay');
var ಠpause = Symbol('nativepause');

/**
 * UTILS
 */

function getAudioFromVideo(video) {
	var audio = new Audio();
	proxyEvent(video, 'play', audio);
	proxyEvent(video, 'playing', audio);
	proxyEvent(video, 'pause', audio);
	audio.crossOrigin = video.crossOrigin;

	// 'data:' causes audio.networkState > 0
	// which then allows to keep <audio> in a resumable playing state
	// i.e. once you set a real src it will keep playing if it was if .play() was called
	audio.src = video.src || video.currentSrc || 'data:';

	// if (audio.src === 'data:') {
	//   TODO: wait for video to be selected
	// }
	return audio;
}

var lastRequests = [];
var requestIndex = 0;
var lastTimeupdateEvent;

function setTime(video, time, rememberOnly) {
	// allow one timeupdate event every 200+ ms
	if ((lastTimeupdateEvent || 0) + 200 < Date.now()) {
		video[ಠevent] = true;
		lastTimeupdateEvent = Date.now();
	}
	if (!rememberOnly) {
		video.currentTime = time;
	}
	lastRequests[++requestIndex % 3] = time * 100 | 0 / 100;
}

function isPlayerEnded(player) {
	return player.driver.currentTime >= player.video.duration;
}

function update(timeDiff) {
	var player = this;
	// console.log('update', player.video.readyState, player.video.networkState, player.driver.readyState, player.driver.networkState, player.driver.paused);
	if (player.video.readyState >= player.video.HAVE_FUTURE_DATA) {
		if (!player.hasAudio) {
			player.driver.currentTime = player.video.currentTime + ((timeDiff * player.video.playbackRate) / 1000);
			if (player.video.loop && isPlayerEnded(player)) {
				player.driver.currentTime = 0;
			}
		}
		setTime(player.video, player.driver.currentTime);
	} else if (player.video.networkState === player.video.NETWORK_IDLE && !player.video.buffered.length) {
		// this should happen when the source is available but:
		// - it's potentially playing (.paused === false)
		// - it's not ready to play
		// - it's not loading
		// If it hasAudio, that will be loaded in the 'emptied' handler below
		player.video.load();
		// console.log('Will load');
	}

	// console.assert(player.video.currentTime === player.driver.currentTime, 'Video not updating!');

	if (player.video.ended) {
		delete player.video[ಠevent]; // allow timeupdate event
		player.video.pause(true);
	}
}

/**
 * METHODS
 */

function play() {
	// console.log('play');
	var video = this;
	var player = video[ಠ];

	// if it's fullscreen, use the native player
	if (video.webkitDisplayingFullscreen) {
		video[ಠplay]();
		return;
	}

	if (player.driver.src !== 'data:' && player.driver.src !== video.src) {
		// console.log('src changed on play', video.src);
		setTime(video, 0, true);
		player.driver.src = video.src;
	}

	if (!video.paused) {
		return;
	}
	player.paused = false;

	if (!video.buffered.length) {
		// .load() causes the emptied event
		// the alternative is .play()+.pause() but that triggers play/pause events, even worse
		// possibly the alternative is preventing this event only once
		video.load();
	}

	player.driver.play();
	player.updater.start();

	if (!player.hasAudio) {
		dispatchEventAsync(video, 'play');
		if (player.video.readyState >= player.video.HAVE_ENOUGH_DATA) {
			// console.log('onplay');
			dispatchEventAsync(video, 'playing');
		}
	}
}
function pause(forceEvents) {
	// console.log('pause');
	var video = this;
	var player = video[ಠ];

	player.driver.pause();
	player.updater.stop();

	// if it's fullscreen, the developer the native player.pause()
	// This is at the end of pause() because it also
	// needs to make sure that the simulation is paused
	if (video.webkitDisplayingFullscreen) {
		video[ಠpause]();
	}

	if (player.paused && !forceEvents) {
		return;
	}

	player.paused = true;
	if (!player.hasAudio) {
		dispatchEventAsync(video, 'pause');
	}
	if (video.ended) {
		video[ಠevent] = true;
		dispatchEventAsync(video, 'ended');
	}
}

/**
 * SETUP
 */

function addPlayer(video, hasAudio) {
	var player = video[ಠ] = {};
	player.paused = true; // track whether 'pause' events have been fired
	player.hasAudio = hasAudio;
	player.video = video;
	player.updater = intervalometer.frameIntervalometer(update.bind(player));

	if (hasAudio) {
		player.driver = getAudioFromVideo(video);
	} else {
		video.addEventListener('canplay', function () {
			if (!video.paused) {
				// console.log('oncanplay');
				dispatchEventAsync(video, 'playing');
			}
		});
		player.driver = {
			src: video.src || video.currentSrc || 'data:',
			muted: true,
			paused: true,
			pause: function () {
				player.driver.paused = true;
			},
			play: function () {
				player.driver.paused = false;
				// media automatically goes to 0 if .play() is called when it's done
				if (isPlayerEnded(player)) {
					setTime(video, 0);
				}
			},
			get ended() {
				return isPlayerEnded(player);
			}
		};
	}

	// .load() causes the emptied event
	video.addEventListener('emptied', function () {
		// console.log('driver src is', player.driver.src);
		var wasEmpty = !player.driver.src || player.driver.src === 'data:';
		if (player.driver.src && player.driver.src !== video.src) {
			// console.log('src changed to', video.src);
			setTime(video, 0, true);
			player.driver.src = video.src;
			// playing videos will only keep playing if no src was present when .play()’ed
			if (wasEmpty) {
				player.driver.play();
			} else {
				player.updater.stop();
			}
		}
	}, false);

	// stop programmatic player when OS takes over
	video.addEventListener('webkitbeginfullscreen', function () {
		if (!video.paused) {
			// make sure that the <audio> and the syncer/updater are stopped
			video.pause();

			// play video natively
			video[ಠplay]();
		} else if (hasAudio && !player.driver.buffered.length) {
			// if the first play is native,
			// the <audio> needs to be buffered manually
			// so when the fullscreen ends, it can be set to the same current time
			player.driver.load();
		}
	});
	if (hasAudio) {
		video.addEventListener('webkitendfullscreen', function () {
			// sync audio to new video position
			player.driver.currentTime = video.currentTime;
			// console.assert(player.driver.currentTime === video.currentTime, 'Audio not synced');
		});

		// allow seeking
		video.addEventListener('seeking', function () {
			if (lastRequests.indexOf(video.currentTime * 100 | 0 / 100) < 0) {
				// console.log('User-requested seeking');
				player.driver.currentTime = video.currentTime;
			}
		});
	}
}

function overloadAPI(video) {
	var player = video[ಠ];
	video[ಠplay] = video.play;
	video[ಠpause] = video.pause;
	video.play = play;
	video.pause = pause;
	proxyProperty(video, 'paused', player.driver);
	proxyProperty(video, 'muted', player.driver, true);
	proxyProperty(video, 'playbackRate', player.driver, true);
	proxyProperty(video, 'ended', player.driver);
	proxyProperty(video, 'loop', player.driver, true);
	preventEvent(video, 'seeking');
	preventEvent(video, 'seeked');
	preventEvent(video, 'timeupdate', ಠevent, false);
	preventEvent(video, 'ended', ಠevent, false); // prevent occasional native ended events
}

function enableInlineVideo(video, hasAudio, onlyWhitelisted) {
	if ( hasAudio === void 0 ) hasAudio = true;
	if ( onlyWhitelisted === void 0 ) onlyWhitelisted = true;

	if ((onlyWhitelisted && !isWhitelisted) || video[ಠ]) {
		return;
	}
	addPlayer(video, hasAudio);
	overloadAPI(video);
	video.classList.add('IIV');
	if (!hasAudio && video.autoplay) {
		video.play();
	}
	if (!/iPhone|iPod|iPad/.test(navigator.platform)) {
		console.warn('iphone-inline-video is not guaranteed to work in emulated environments');
	}
}

enableInlineVideo.isWhitelisted = isWhitelisted;

module.exports = enableInlineVideo;
},{"intervalometer":1,"poor-mans-symbol":3}],3:[function(require,module,exports){
'use strict';

var index = typeof Symbol === 'undefined' ? function (description) {
	return '@' + (description || '@') + Math.random();
} : Symbol;

module.exports = index;
},{}],4:[function(require,module,exports){
/**
 *
 * (c) Wensheng Yan <yanwsh@gmail.com>
 * Date: 10/30/16
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _Detector = require('../lib/Detector');

var _Detector2 = _interopRequireDefault(_Detector);

var _MobileBuffering = require('../lib/MobileBuffering');

var _MobileBuffering2 = _interopRequireDefault(_MobileBuffering);

var _Util = require('../lib/Util');

var _Util2 = _interopRequireDefault(_Util);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var HAVE_CURRENT_DATA = 2;

var BaseCanvas = function BaseCanvas(baseComponent, THREE) {
    var settings = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

    return {
        constructor: function init(player, options) {
            this.settings = options;
            //basic settings
            this.width = player.el().offsetWidth, this.height = player.el().offsetHeight;
            this.lon = options.initLon, this.lat = options.initLat, this.phi = 0, this.theta = 0;
            this.videoType = options.videoType;
            this.clickToToggle = options.clickToToggle;
            this.mouseDown = false;
            this.isUserInteracting = false;

            //define render
            this.renderer = new THREE.WebGLRenderer();
            this.renderer.setPixelRatio(window.devicePixelRatio);
            this.renderer.setSize(this.width, this.height);
            this.renderer.autoClear = false;
            this.renderer.setClearColor(0x000000, 1);

            //define texture, on ie 11, we need additional helper canvas to solve rendering issue.
            var video = settings.getTech(player);
            this.supportVideoTexture = _Detector2.default.supportVideoTexture();
            this.liveStreamOnSafari = _Detector2.default.isLiveStreamOnSafari(video);
            if (this.liveStreamOnSafari) this.supportVideoTexture = false;
            if (!this.supportVideoTexture) {
                this.helperCanvas = player.addChild("HelperCanvas", {
                    video: video,
                    width: options.helperCanvas.width ? options.helperCanvas.width : this.width,
                    height: options.helperCanvas.height ? options.helperCanvas.height : this.height
                });
                var context = this.helperCanvas.el();
                this.texture = new THREE.Texture(context);
            } else {
                this.texture = new THREE.Texture(video);
            }

            video.style.visibility = "hidden";

            this.texture.generateMipmaps = false;
            this.texture.minFilter = THREE.LinearFilter;
            this.texture.maxFilter = THREE.LinearFilter;
            this.texture.format = THREE.RGBFormat;

            this.el_ = this.renderer.domElement;
            this.el_.classList.add('vjs-video-canvas');

            options.el = this.el_;
            baseComponent.call(this, player, options);

            this.attachControlEvents();
            this.player().on("play", function () {
                this.time = new Date().getTime();
                this.animate();
            }.bind(this));
        },

        attachControlEvents: function attachControlEvents() {
            this.on('mousemove', this.handleMouseMove.bind(this));
            this.on('touchmove', this.handleTouchMove.bind(this));
            this.on('mousedown', this.handleMouseDown.bind(this));
            this.on('touchstart', this.handleTouchStart.bind(this));
            this.on('mouseup', this.handleMouseUp.bind(this));
            this.on('touchend', this.handleTouchEnd.bind(this));
            if (this.settings.scrollable) {
                this.on('mousewheel', this.handleMouseWheel.bind(this));
                this.on('MozMousePixelScroll', this.handleMouseWheel.bind(this));
            }
            this.on('mouseenter', this.handleMouseEnter.bind(this));
            this.on('mouseleave', this.handleMouseLease.bind(this));
        },

        handleResize: function handleResize() {
            this.width = this.player().el().offsetWidth, this.height = this.player().el().offsetHeight;
            this.renderer.setSize(this.width, this.height);
        },

        handleMouseUp: function handleMouseUp(event) {
            this.mouseDown = false;
            if (this.clickToToggle) {
                var clientX = event.clientX || event.changedTouches && event.changedTouches[0].clientX;
                var clientY = event.clientY || event.changedTouches && event.changedTouches[0].clientY;
                if (typeof clientX === "undefined" || clientY === "undefined") return;
                var diffX = Math.abs(clientX - this.onPointerDownPointerX);
                var diffY = Math.abs(clientY - this.onPointerDownPointerY);
                if (diffX < 0.1 && diffY < 0.1) this.player().paused() ? this.player().play() : this.player().pause();
            }
        },

        handleMouseDown: function handleMouseDown(event) {
            event.preventDefault();
            var clientX = event.clientX || event.touches && event.touches[0].clientX;
            var clientY = event.clientY || event.touches && event.touches[0].clientY;
            if (typeof clientX === "undefined" || clientY === "undefined") return;
            this.mouseDown = true;
            this.onPointerDownPointerX = clientX;
            this.onPointerDownPointerY = clientY;
            this.onPointerDownLon = this.lon;
            this.onPointerDownLat = this.lat;
        },

        handleTouchStart: function handleTouchStart(event) {
            if (event.touches.length > 1) {
                this.isUserPinch = true;
                this.multiTouchDistance = _Util2.default.getTouchesDistance(event.touches);
            }
            this.handleMouseDown(event);
        },

        handleTouchEnd: function handleTouchEnd(event) {
            this.isUserPinch = false;
            this.handleMouseUp(event);
        },

        handleMouseMove: function handleMouseMove(event) {
            var clientX = event.clientX || event.touches && event.touches[0].clientX;
            var clientY = event.clientY || event.touches && event.touches[0].clientY;
            if (typeof clientX === "undefined" || clientY === "undefined") return;
            if (this.settings.clickAndDrag) {
                if (this.mouseDown) {
                    this.lon = (this.onPointerDownPointerX - clientX) * 0.2 + this.onPointerDownLon;
                    this.lat = (clientY - this.onPointerDownPointerY) * 0.2 + this.onPointerDownLat;
                }
            } else {
                var x = event.pageX - this.el_.offsetLeft;
                var y = event.pageY - this.el_.offsetTop;
                this.lon = x / this.width * 430 - 225;
                this.lat = y / this.height * -180 + 90;
            }
        },

        handleTouchMove: function handleTouchMove(event) {
            //handle single touch event,
            if (!this.isUserPinch || event.touches.length <= 1) {
                this.handleMouseMove(event);
            }
        },

        handleMobileOrientation: function handleMobileOrientation(event) {
            if (typeof event.rotationRate === "undefined") return;
            var x = event.rotationRate.alpha;
            var y = event.rotationRate.beta;
            var portrait = typeof event.portrait !== "undefined" ? event.portrait : window.matchMedia("(orientation: portrait)").matches;
            var landscape = typeof event.landscape !== "undefined" ? event.landscape : window.matchMedia("(orientation: landscape)").matches;
            var orientation = event.orientation || window.orientation;

            if (portrait) {
                this.lon = this.lon - y * this.settings.mobileVibrationValue;
                this.lat = this.lat + x * this.settings.mobileVibrationValue;
            } else if (landscape) {
                var orientationDegree = -90;
                if (typeof orientation != "undefined") {
                    orientationDegree = orientation;
                }

                this.lon = orientationDegree == -90 ? this.lon + x * this.settings.mobileVibrationValue : this.lon - x * this.settings.mobileVibrationValue;
                this.lat = orientationDegree == -90 ? this.lat + y * this.settings.mobileVibrationValue : this.lat - y * this.settings.mobileVibrationValue;
            }
        },

        handleMouseWheel: function handleMouseWheel(event) {
            event.stopPropagation();
            event.preventDefault();
        },

        handleMouseEnter: function handleMouseEnter(event) {
            this.isUserInteracting = true;
        },

        handleMouseLease: function handleMouseLease(event) {
            this.isUserInteracting = false;
            if (this.mouseDown) {
                this.mouseDown = false;
            }
        },

        animate: function animate() {
            this.requestAnimationId = requestAnimationFrame(this.animate.bind(this));
            if (!this.player().paused()) {
                if (typeof this.texture !== "undefined" && (!this.isPlayOnMobile && this.player().readyState() >= HAVE_CURRENT_DATA || this.isPlayOnMobile && this.player().hasClass("vjs-playing"))) {
                    var ct = new Date().getTime();
                    if (ct - this.time >= 30) {
                        this.texture.needsUpdate = true;
                        this.time = ct;
                    }
                    if (this.isPlayOnMobile) {
                        var currentTime = this.player().currentTime();
                        if (_MobileBuffering2.default.isBuffering(currentTime)) {
                            if (!this.player().hasClass("vjs-panorama-mobile-inline-video-buffering")) {
                                this.player().addClass("vjs-panorama-mobile-inline-video-buffering");
                            }
                        } else {
                            if (this.player().hasClass("vjs-panorama-mobile-inline-video-buffering")) {
                                this.player().removeClass("vjs-panorama-mobile-inline-video-buffering");
                            }
                        }
                    }
                }
            }
            this.render();
        },

        render: function render() {
            if (!this.isUserInteracting) {
                var symbolLat = this.lat > this.settings.initLat ? -1 : 1;
                var symbolLon = this.lon > this.settings.initLon ? -1 : 1;
                if (this.settings.backToVerticalCenter) {
                    this.lat = this.lat > this.settings.initLat - Math.abs(this.settings.returnStepLat) && this.lat < this.settings.initLat + Math.abs(this.settings.returnStepLat) ? this.settings.initLat : this.lat + this.settings.returnStepLat * symbolLat;
                }
                if (this.settings.backToHorizonCenter) {
                    this.lon = this.lon > this.settings.initLon - Math.abs(this.settings.returnStepLon) && this.lon < this.settings.initLon + Math.abs(this.settings.returnStepLon) ? this.settings.initLon : this.lon + this.settings.returnStepLon * symbolLon;
                }
            }
            this.lat = Math.max(this.settings.minLat, Math.min(this.settings.maxLat, this.lat));
            this.lon = Math.max(this.settings.minLon, Math.min(this.settings.maxLon, this.lon));
            this.phi = THREE.Math.degToRad(90 - this.lat);
            this.theta = THREE.Math.degToRad(this.lon);

            if (!this.supportVideoTexture) {
                this.helperCanvas.update();
            }
            this.renderer.clear();
        },

        playOnMobile: function playOnMobile() {
            this.isPlayOnMobile = true;
            if (this.settings.autoMobileOrientation) window.addEventListener('devicemotion', this.handleMobileOrientation.bind(this));
        },

        el: function el() {
            return this.el_;
        }
    };
};

exports.default = BaseCanvas;

},{"../lib/Detector":6,"../lib/MobileBuffering":8,"../lib/Util":11}],5:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _BaseCanvas = require('./BaseCanvas');

var _BaseCanvas2 = _interopRequireDefault(_BaseCanvas);

var _Util = require('./Util');

var _Util2 = _interopRequireDefault(_Util);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Created by yanwsh on 4/3/16.
 */

var Canvas = function Canvas(baseComponent, THREE) {
    var settings = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

    var parent = (0, _BaseCanvas2.default)(baseComponent, THREE, settings);

    return _Util2.default.extend(parent, {
        constructor: function init(player, options) {
            parent.constructor.call(this, player, options);

            this.VRMode = false;
            //define scene
            this.scene = new THREE.Scene();
            //define camera
            this.camera = new THREE.PerspectiveCamera(options.initFov, this.width / this.height, 1, 2000);
            this.camera.target = new THREE.Vector3(0, 0, 0);
            if (this.settings.VREnable && this.settings.autoMobileOrientation && this.controls === undefined && THREE.DeviceOrientationControls !== undefined) {
                this.controls = new THREE.DeviceOrientationControls(this.camera);
            }

            //define geometry
            var geometry = this.videoType === "equirectangular" ? new THREE.SphereGeometry(500, 60, 40) : new THREE.SphereBufferGeometry(500, 60, 40).toNonIndexed();
            if (this.videoType === "fisheye") {
                var normals = geometry.attributes.normal.array;
                var uvs = geometry.attributes.uv.array;
                for (var i = 0, l = normals.length / 3; i < l; i++) {
                    var x = normals[i * 3 + 0];
                    var y = normals[i * 3 + 1];
                    var z = normals[i * 3 + 2];

                    var r = Math.asin(Math.sqrt(x * x + z * z) / Math.sqrt(x * x + y * y + z * z)) / Math.PI;
                    if (y < 0) r = 1 - r;
                    var theta = x == 0 && z == 0 ? 0 : Math.acos(x / Math.sqrt(x * x + z * z));
                    if (z < 0) theta = theta * -1;
                    uvs[i * 2 + 0] = -0.8 * r * Math.cos(theta) + 0.5;
                    uvs[i * 2 + 1] = 0.8 * r * Math.sin(theta) + 0.5;
                }
                geometry.rotateX(options.rotateX);
                geometry.rotateY(options.rotateY);
                geometry.rotateZ(options.rotateZ);
            } else if (this.videoType === "dual_fisheye") {
                var _normals = geometry.attributes.normal.array;
                var _uvs = geometry.attributes.uv.array;
                var _l = _normals.length / 3;
                for (var _i = 0; _i < _l / 2; _i++) {
                    var _x2 = _normals[_i * 3 + 0];
                    var _y = _normals[_i * 3 + 1];
                    var _z = _normals[_i * 3 + 2];

                    var _r = _x2 == 0 && _z == 0 ? 1 : Math.acos(_y) / Math.sqrt(_x2 * _x2 + _z * _z) * (2 / Math.PI);
                    _uvs[_i * 2 + 0] = _x2 * options.dualFish.circle1.rx * _r * options.dualFish.circle1.coverX + options.dualFish.circle1.x;
                    _uvs[_i * 2 + 1] = _z * options.dualFish.circle1.ry * _r * options.dualFish.circle1.coverY + options.dualFish.circle1.y;
                }
                for (var _i2 = _l / 2; _i2 < _l; _i2++) {
                    var _x3 = _normals[_i2 * 3 + 0];
                    var _y2 = _normals[_i2 * 3 + 1];
                    var _z2 = _normals[_i2 * 3 + 2];

                    var _r2 = _x3 == 0 && _z2 == 0 ? 1 : Math.acos(-_y2) / Math.sqrt(_x3 * _x3 + _z2 * _z2) * (2 / Math.PI);
                    _uvs[_i2 * 2 + 0] = -_x3 * options.dualFish.circle2.rx * _r2 * options.dualFish.circle2.coverX + options.dualFish.circle2.x;
                    _uvs[_i2 * 2 + 1] = _z2 * options.dualFish.circle2.ry * _r2 * options.dualFish.circle2.coverY + options.dualFish.circle2.y;
                }
                geometry.rotateX(options.rotateX);
                geometry.rotateY(options.rotateY);
                geometry.rotateZ(options.rotateZ);
            }
            geometry.scale(-1, 1, 1);
            //define mesh
            this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: this.texture }));
            //this.mesh.scale.x = -1;
            this.scene.add(this.mesh);
        },

        enableVR: function enableVR() {
            this.VRMode = true;
            if (typeof vrHMD !== 'undefined') {
                var eyeParamsL = vrHMD.getEyeParameters('left');
                var eyeParamsR = vrHMD.getEyeParameters('right');

                this.eyeFOVL = eyeParamsL.recommendedFieldOfView;
                this.eyeFOVR = eyeParamsR.recommendedFieldOfView;
            }

            this.cameraL = new THREE.PerspectiveCamera(this.camera.fov, this.width / 2 / this.height, 1, 2000);
            this.cameraR = new THREE.PerspectiveCamera(this.camera.fov, this.width / 2 / this.height, 1, 2000);
            if (this.settings.VREnable && this.settings.autoMobileOrientation && this.controlsL === undefined && THREE.DeviceOrientationControls !== undefined) {
                this.controlsL = new THREE.DeviceOrientationControls(this.cameraL);
                this.controlsR = new THREE.DeviceOrientationControls(this.cameraR);
                var lonL = THREE.Math.degToRad(0 + this.settings.VRGapDegree);
                var lonR = THREE.Math.degToRad(0 - this.settings.VRGapDegree);
                this.controlsL.updateAlphaOffsetAngle(lonL);
                this.controlsR.updateAlphaOffsetAngle(lonR);
            }
        },

        disableVR: function disableVR() {
            this.VRMode = false;
            this.renderer.setViewport(0, 0, this.width, this.height);
            this.renderer.setScissor(0, 0, this.width, this.height);

            if (this.controlsL) this.controlsL = undefined;
            if (this.controlsR) this.controlsR = undefined;
        },

        handleResize: function handleResize() {
            parent.handleResize.call(this);
            this.camera.aspect = this.width / this.height;
            this.camera.updateProjectionMatrix();
            if (this.VRMode) {
                this.cameraL.aspect = this.camera.aspect / 2;
                this.cameraR.aspect = this.camera.aspect / 2;
                this.cameraL.updateProjectionMatrix();
                this.cameraR.updateProjectionMatrix();
            }
        },

        handleMouseWheel: function handleMouseWheel(event) {
            parent.handleMouseWheel(event);
            // WebKit
            if (event.wheelDeltaY) {
                this.camera.fov -= event.wheelDeltaY * 0.05;
                // Opera / Explorer 9
            } else if (event.wheelDelta) {
                this.camera.fov -= event.wheelDelta * 0.05;
                // Firefox
            } else if (event.detail) {
                this.camera.fov += event.detail * 1.0;
            }
            this.camera.fov = Math.min(this.settings.maxFov, this.camera.fov);
            this.camera.fov = Math.max(this.settings.minFov, this.camera.fov);
            this.camera.updateProjectionMatrix();
            if (this.VRMode) {
                this.cameraL.fov = this.camera.fov;
                this.cameraR.fov = this.camera.fov;
                this.cameraL.updateProjectionMatrix();
                this.cameraR.updateProjectionMatrix();
            }
        },

        handleTouchMove: function handleTouchMove(event) {
            parent.handleTouchMove.call(this, event);
            if (this.isUserPinch) {
                var currentDistance = _Util2.default.getTouchesDistance(event.touches);
                event.wheelDeltaY = (currentDistance - this.multiTouchDistance) * 2;
                this.handleMouseWheel.call(this, event);
                this.multiTouchDistance = currentDistance;
            }
        },

        render: function render() {
            parent.render.call(this);

            if (this.controls) {
                this.controls.update();
            } else {
                this.camera.target.x = 500 * Math.sin(this.phi) * Math.cos(this.theta);
                this.camera.target.y = 500 * Math.cos(this.phi);
                this.camera.target.z = 500 * Math.sin(this.phi) * Math.sin(this.theta);
                this.camera.lookAt(this.camera.target);
            }

            if (!this.VRMode) {
                this.renderer.render(this.scene, this.camera);
            } else {
                var viewPortWidth = this.width / 2,
                    viewPortHeight = this.height;
                if (typeof vrHMD !== 'undefined') {
                    this.cameraL.projectionMatrix = _Util2.default.fovToProjection(this.eyeFOVL, true, this.camera.near, this.camera.far);
                    this.cameraR.projectionMatrix = _Util2.default.fovToProjection(this.eyeFOVR, true, this.camera.near, this.camera.far);
                } else {
                    var lonL = this.lon + this.settings.VRGapDegree;
                    var lonR = this.lon - this.settings.VRGapDegree;

                    var thetaL = THREE.Math.degToRad(lonL);
                    var thetaR = THREE.Math.degToRad(lonR);

                    var targetL = _Util2.default.deepCopy(this.camera.target);
                    targetL.x = 500 * Math.sin(this.phi) * Math.cos(thetaL);
                    targetL.z = 500 * Math.sin(this.phi) * Math.sin(thetaL);
                    if (this.controlsL) {
                        this.controlsL.update();
                    } else {
                        this.cameraL.lookAt(targetL);
                    }

                    var targetR = _Util2.default.deepCopy(this.camera.target);
                    targetR.x = 500 * Math.sin(this.phi) * Math.cos(thetaR);
                    targetR.z = 500 * Math.sin(this.phi) * Math.sin(thetaR);
                    if (this.controlsR) {
                        this.controlsR.update();
                    } else {
                        this.cameraR.lookAt(targetR);
                    }
                }
                // render left eye
                this.renderer.setViewport(0, 0, viewPortWidth, viewPortHeight);
                this.renderer.setScissor(0, 0, viewPortWidth, viewPortHeight);
                this.renderer.render(this.scene, this.cameraL);

                // render right eye
                this.renderer.setViewport(viewPortWidth, 0, viewPortWidth, viewPortHeight);
                this.renderer.setScissor(viewPortWidth, 0, viewPortWidth, viewPortHeight);
                this.renderer.render(this.scene, this.cameraR);
            }
        }
    });
};

exports.default = Canvas;

},{"./BaseCanvas":4,"./Util":11}],6:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
/**
 * @author alteredq / http://alteredqualia.com/
 * @author mr.doob / http://mrdoob.com/
 */

var Detector = {

    canvas: !!window.CanvasRenderingContext2D,
    webgl: function () {

        try {

            var canvas = document.createElement('canvas');return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
        } catch (e) {

            return false;
        }
    }(),
    workers: !!window.Worker,
    fileapi: window.File && window.FileReader && window.FileList && window.Blob,

    Check_Version: function Check_Version() {
        var rv = -1; // Return value assumes failure.

        if (navigator.appName == 'Microsoft Internet Explorer') {

            var ua = navigator.userAgent,
                re = new RegExp("MSIE ([0-9]{1,}[\\.0-9]{0,})");

            if (re.exec(ua) !== null) {
                rv = parseFloat(RegExp.$1);
            }
        } else if (navigator.appName == "Netscape") {
            /// in IE 11 the navigator.appVersion says 'trident'
            /// in Edge the navigator.appVersion does not say trident
            if (navigator.appVersion.indexOf('Trident') !== -1) rv = 11;else {
                var ua = navigator.userAgent;
                var re = new RegExp("Edge\/([0-9]{1,}[\\.0-9]{0,})");
                if (re.exec(ua) !== null) {
                    rv = parseFloat(RegExp.$1);
                }
            }
        }

        return rv;
    },

    supportVideoTexture: function supportVideoTexture() {
        //ie 11 and edge 12 doesn't support video texture.
        var version = this.Check_Version();
        return version === -1 || version >= 13;
    },

    isLiveStreamOnSafari: function isLiveStreamOnSafari(videoElement) {
        //live stream on safari doesn't support video texture
        var videoSources = videoElement.querySelectorAll("source");
        var result = false;
        for (var i = 0; i < videoSources.length; i++) {
            var currentVideoSource = videoSources[i];
            if ((currentVideoSource.type == "application/x-mpegURL" || currentVideoSource.type == "application/vnd.apple.mpegurl") && /(Safari|AppleWebKit)/.test(navigator.userAgent) && /Apple Computer/.test(navigator.vendor)) {
                result = true;
            }
            break;
        }
        return result;
    },

    getWebGLErrorMessage: function getWebGLErrorMessage() {

        var element = document.createElement('div');
        element.id = 'webgl-error-message';

        if (!this.webgl) {

            element.innerHTML = window.WebGLRenderingContext ? ['Your graphics card does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation" style="color:#000">WebGL</a>.<br />', 'Find out how to get it <a href="http://get.webgl.org/" style="color:#000">here</a>.'].join('\n') : ['Your browser does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation" style="color:#000">WebGL</a>.<br/>', 'Find out how to get it <a href="http://get.webgl.org/" style="color:#000">here</a>.'].join('\n');
        }

        return element;
    },

    addGetWebGLMessage: function addGetWebGLMessage(parameters) {

        var parent, id, element;

        parameters = parameters || {};

        parent = parameters.parent !== undefined ? parameters.parent : document.body;
        id = parameters.id !== undefined ? parameters.id : 'oldie';

        element = Detector.getWebGLErrorMessage();
        element.id = id;

        parent.appendChild(element);
    }

};

exports.default = Detector;

},{}],7:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
/**
 * Created by wensheng.yan on 5/23/16.
 */
var element = document.createElement('canvas');
element.className = "vjs-video-helper-canvas";

var HelperCanvas = function HelperCanvas(baseComponent) {
    return {
        constructor: function init(player, options) {
            this.videoElement = options.video;
            this.width = options.width;
            this.height = options.height;

            element.width = this.width;
            element.height = this.height;
            element.style.display = "none";
            options.el = element;

            this.context = element.getContext('2d');
            this.context.drawImage(this.videoElement, 0, 0, this.width, this.height);
            baseComponent.call(this, player, options);
        },

        getContext: function getContext() {
            return this.context;
        },

        update: function update() {
            this.context.drawImage(this.videoElement, 0, 0, this.width, this.height);
        },

        el: function el() {
            return element;
        }
    };
};

exports.default = HelperCanvas;

},{}],8:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
/**
 * Created by yanwsh on 6/6/16.
 */
var MobileBuffering = {
    prev_currentTime: 0,
    counter: 0,

    isBuffering: function isBuffering(currentTime) {
        if (currentTime == this.prev_currentTime) this.counter++;else this.counter = 0;
        this.prev_currentTime = currentTime;
        if (this.counter > 10) {
            //not let counter overflow
            this.counter = 10;
            return true;
        }
        return false;
    }
};

exports.default = MobileBuffering;

},{}],9:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

/**
 * Created by yanwsh on 4/4/16.
 */

var Notice = function Notice(baseComponent) {
    var element = document.createElement('div');
    element.className = "vjs-video-notice-label";

    return {
        constructor: function init(player, options) {
            if (_typeof(options.NoticeMessage) == "object") {
                element = options.NoticeMessage;
                options.el = options.NoticeMessage;
            } else if (typeof options.NoticeMessage == "string") {
                element.innerHTML = options.NoticeMessage;
                options.el = element;
            }

            baseComponent.call(this, player, options);
        },

        el: function el() {
            return element;
        }
    };
};

exports.default = Notice;

},{}],10:[function(require,module,exports){
/**
 *
 * (c) Wensheng Yan <yanwsh@gmail.com>
 * Date: 10/21/16
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _BaseCanvas = require('./BaseCanvas');

var _BaseCanvas2 = _interopRequireDefault(_BaseCanvas);

var _Util = require('./Util');

var _Util2 = _interopRequireDefault(_Util);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var ThreeDCanvas = function ThreeDCanvas(baseComponent, THREE) {
    var settings = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

    var parent = (0, _BaseCanvas2.default)(baseComponent, THREE, settings);
    return _Util2.default.extend(parent, {
        constructor: function init(player, options) {
            parent.constructor.call(this, player, options);
            //only show left part by default
            this.VRMode = false;
            //define scene
            this.scene = new THREE.Scene();

            var aspectRatio = this.width / this.height;
            //define camera
            this.cameraL = new THREE.PerspectiveCamera(options.initFov, aspectRatio, 1, 2000);
            this.cameraL.target = new THREE.Vector3(0, 0, 0);

            this.cameraR = new THREE.PerspectiveCamera(options.initFov, aspectRatio / 2, 1, 2000);
            this.cameraR.position.set(1000, 0, 0);
            this.cameraR.target = new THREE.Vector3(1000, 0, 0);

            var geometryL = new THREE.SphereBufferGeometry(500, 60, 40).toNonIndexed();
            var geometryR = new THREE.SphereBufferGeometry(500, 60, 40).toNonIndexed();

            var uvsL = geometryL.attributes.uv.array;
            var normalsL = geometryL.attributes.normal.array;
            for (var i = 0; i < normalsL.length / 3; i++) {
                uvsL[i * 2 + 1] = uvsL[i * 2 + 1] / 2;
            }

            var uvsR = geometryR.attributes.uv.array;
            var normalsR = geometryR.attributes.normal.array;
            for (var i = 0; i < normalsR.length / 3; i++) {
                uvsR[i * 2 + 1] = uvsR[i * 2 + 1] / 2 + 0.5;
            }

            geometryL.scale(-1, 1, 1);
            geometryR.scale(-1, 1, 1);

            this.meshL = new THREE.Mesh(geometryL, new THREE.MeshBasicMaterial({ map: this.texture }));

            this.meshR = new THREE.Mesh(geometryR, new THREE.MeshBasicMaterial({ map: this.texture }));
            this.meshR.position.set(1000, 0, 0);

            this.scene.add(this.meshL);

            if (options.callback) options.callback();
        },

        handleResize: function handleResize() {
            parent.handleResize.call(this);
            var aspectRatio = this.width / this.height;
            if (!this.VRMode) {
                this.cameraL.aspect = aspectRatio;
                this.cameraL.updateProjectionMatrix();
            } else {
                aspectRatio /= 2;
                this.cameraL.aspect = aspectRatio;
                this.cameraR.aspect = aspectRatio;
                this.cameraL.updateProjectionMatrix();
                this.cameraR.updateProjectionMatrix();
            }
        },

        handleMouseWheel: function handleMouseWheel(event) {
            parent.handleMouseWheel(event);
            // WebKit
            if (event.wheelDeltaY) {
                this.cameraL.fov -= event.wheelDeltaY * 0.05;
                // Opera / Explorer 9
            } else if (event.wheelDelta) {
                this.cameraL.fov -= event.wheelDelta * 0.05;
                // Firefox
            } else if (event.detail) {
                this.cameraL.fov += event.detail * 1.0;
            }
            this.cameraL.fov = Math.min(this.settings.maxFov, this.cameraL.fov);
            this.cameraL.fov = Math.max(this.settings.minFov, this.cameraL.fov);
            this.cameraL.updateProjectionMatrix();
            if (this.VRMode) {
                this.cameraR.fov = this.cameraL.fov;
                this.cameraR.updateProjectionMatrix();
            }
        },

        enableVR: function enableVR() {
            this.VRMode = true;
            this.scene.add(this.meshR);
            this.handleResize();
        },

        disableVR: function disableVR() {
            this.VRMode = false;
            this.scene.remove(this.meshR);
            this.handleResize();
        },

        render: function render() {
            parent.render.call(this);
            this.cameraL.target.x = 500 * Math.sin(this.phi) * Math.cos(this.theta);
            this.cameraL.target.y = 500 * Math.cos(this.phi);
            this.cameraL.target.z = 500 * Math.sin(this.phi) * Math.sin(this.theta);
            this.cameraL.lookAt(this.cameraL.target);

            if (this.VRMode) {
                var viewPortWidth = this.width / 2,
                    viewPortHeight = this.height;
                this.cameraR.target.x = 1000 + 500 * Math.sin(this.phi) * Math.cos(this.theta);
                this.cameraR.target.y = 500 * Math.cos(this.phi);
                this.cameraR.target.z = 500 * Math.sin(this.phi) * Math.sin(this.theta);
                this.cameraR.lookAt(this.cameraR.target);

                // render left eye
                this.renderer.setViewport(0, 0, viewPortWidth, viewPortHeight);
                this.renderer.setScissor(0, 0, viewPortWidth, viewPortHeight);
                this.renderer.render(this.scene, this.cameraL);

                // render right eye
                this.renderer.setViewport(viewPortWidth, 0, viewPortWidth, viewPortHeight);
                this.renderer.setScissor(viewPortWidth, 0, viewPortWidth, viewPortHeight);
                this.renderer.render(this.scene, this.cameraR);
            } else {
                this.renderer.render(this.scene, this.cameraL);
            }
        }
    });
};

exports.default = ThreeDCanvas;

},{"./BaseCanvas":4,"./Util":11}],11:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
/**
 * Created by wensheng.yan on 4/4/16.
 */
function whichTransitionEvent() {
    var t;
    var el = document.createElement('fakeelement');
    var transitions = {
        'transition': 'transitionend',
        'OTransition': 'oTransitionEnd',
        'MozTransition': 'transitionend',
        'WebkitTransition': 'webkitTransitionEnd'
    };

    for (t in transitions) {
        if (el.style[t] !== undefined) {
            return transitions[t];
        }
    }
}

function mobileAndTabletcheck() {
    var check = false;
    (function (a) {
        if (/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i.test(a) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0, 4))) check = true;
    })(navigator.userAgent || navigator.vendor || window.opera);
    return check;
}

function isIos() {
    return (/iPhone|iPad|iPod/i.test(navigator.userAgent)
    );
}

function isRealIphone() {
    return (/iPhone|iPod/i.test(navigator.platform)
    );
}

//adopt code from: https://github.com/MozVR/vr-web-examples/blob/master/threejs-vr-boilerplate/js/VREffect.js
function fovToNDCScaleOffset(fov) {
    var pxscale = 2.0 / (fov.leftTan + fov.rightTan);
    var pxoffset = (fov.leftTan - fov.rightTan) * pxscale * 0.5;
    var pyscale = 2.0 / (fov.upTan + fov.downTan);
    var pyoffset = (fov.upTan - fov.downTan) * pyscale * 0.5;
    return { scale: [pxscale, pyscale], offset: [pxoffset, pyoffset] };
}

function fovPortToProjection(fov, rightHanded, zNear, zFar) {

    rightHanded = rightHanded === undefined ? true : rightHanded;
    zNear = zNear === undefined ? 0.01 : zNear;
    zFar = zFar === undefined ? 10000.0 : zFar;

    var handednessScale = rightHanded ? -1.0 : 1.0;

    // start with an identity matrix
    var mobj = new THREE.Matrix4();
    var m = mobj.elements;

    // and with scale/offset info for normalized device coords
    var scaleAndOffset = fovToNDCScaleOffset(fov);

    // X result, map clip edges to [-w,+w]
    m[0 * 4 + 0] = scaleAndOffset.scale[0];
    m[0 * 4 + 1] = 0.0;
    m[0 * 4 + 2] = scaleAndOffset.offset[0] * handednessScale;
    m[0 * 4 + 3] = 0.0;

    // Y result, map clip edges to [-w,+w]
    // Y offset is negated because this proj matrix transforms from world coords with Y=up,
    // but the NDC scaling has Y=down (thanks D3D?)
    m[1 * 4 + 0] = 0.0;
    m[1 * 4 + 1] = scaleAndOffset.scale[1];
    m[1 * 4 + 2] = -scaleAndOffset.offset[1] * handednessScale;
    m[1 * 4 + 3] = 0.0;

    // Z result (up to the app)
    m[2 * 4 + 0] = 0.0;
    m[2 * 4 + 1] = 0.0;
    m[2 * 4 + 2] = zFar / (zNear - zFar) * -handednessScale;
    m[2 * 4 + 3] = zFar * zNear / (zNear - zFar);

    // W result (= Z in)
    m[3 * 4 + 0] = 0.0;
    m[3 * 4 + 1] = 0.0;
    m[3 * 4 + 2] = handednessScale;
    m[3 * 4 + 3] = 0.0;

    mobj.transpose();

    return mobj;
}

function fovToProjection(fov, rightHanded, zNear, zFar) {
    var DEG2RAD = Math.PI / 180.0;

    var fovPort = {
        upTan: Math.tan(fov.upDegrees * DEG2RAD),
        downTan: Math.tan(fov.downDegrees * DEG2RAD),
        leftTan: Math.tan(fov.leftDegrees * DEG2RAD),
        rightTan: Math.tan(fov.rightDegrees * DEG2RAD)
    };

    return fovPortToProjection(fovPort, rightHanded, zNear, zFar);
}

function extend(superClass) {
    var subClassMethods = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

    for (var method in superClass) {
        if (superClass.hasOwnProperty(method) && !subClassMethods.hasOwnProperty(method)) {
            subClassMethods[method] = superClass[method];
        }
    }
    return subClassMethods;
}

function deepCopy(obj) {
    var to = {};

    for (var name in obj) {
        to[name] = obj[name];
    }

    return to;
}

function getTouchesDistance(touches) {
    return Math.sqrt((touches[0].clientX - touches[1].clientX) * (touches[0].clientX - touches[1].clientX) + (touches[0].clientY - touches[1].clientY) * (touches[0].clientY - touches[1].clientY));
}

exports.default = {
    whichTransitionEvent: whichTransitionEvent,
    mobileAndTabletcheck: mobileAndTabletcheck,
    isIos: isIos,
    isRealIphone: isRealIphone,
    fovToProjection: fovToProjection,
    extend: extend,
    deepCopy: deepCopy,
    getTouchesDistance: getTouchesDistance
};

},{}],12:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
/**
 * Created by yanwsh on 8/13/16.
 */

var VRButton = function VRButton(ButtonComponent) {
    return {
        constructor: function init(player, options) {
            ButtonComponent.call(this, player, options);
        },

        buildCSSClass: function buildCSSClass() {
            return "vjs-VR-control " + ButtonComponent.prototype.buildCSSClass.call(this);
        },

        handleClick: function handleClick() {
            var canvas = this.player().getChild("Canvas");
            !canvas.VRMode ? canvas.enableVR() : canvas.disableVR();
            canvas.VRMode ? this.addClass("enable") : this.removeClass("enable");
            canvas.VRMode ? this.player().trigger('VRModeOn') : this.player().trigger('VRModeOff');
        },

        controlText_: "VR"
    };
};

exports.default = VRButton;

},{}],13:[function(require,module,exports){
/**
 * Created by yanwsh on 4/3/16.
 */
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _Util = require('./lib/Util');

var _Util2 = _interopRequireDefault(_Util);

var _Detector = require('./lib/Detector');

var _Detector2 = _interopRequireDefault(_Detector);

var _iphoneInlineVideo = require('iphone-inline-video');

var _iphoneInlineVideo2 = _interopRequireDefault(_iphoneInlineVideo);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var runOnMobile = _Util2.default.mobileAndTabletcheck();

// Default options for the plugin.
var defaults = {
    clickAndDrag: runOnMobile,
    showNotice: true,
    NoticeMessage: "Please use your mouse drag and drop the video.",
    autoHideNotice: 3000,
    //limit the video size when user scroll.
    scrollable: true,
    initFov: 75,
    maxFov: 105,
    minFov: 51,
    //initial position for the video
    initLat: 0,
    initLon: -180,
    //A float value back to center when mouse out the canvas. The higher, the faster.
    returnStepLat: 0.5,
    returnStepLon: 2,
    backToVerticalCenter: !runOnMobile,
    backToHorizonCenter: !runOnMobile,
    clickToToggle: false,

    //limit viewable zoom
    minLat: -85,
    maxLat: 85,

    minLon: -Infinity,
    maxLon: Infinity,

    videoType: "equirectangular",

    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,

    autoMobileOrientation: false,
    mobileVibrationValue: _Util2.default.isIos() ? 0.022 : 1,

    VREnable: true,
    VRGapDegree: 2.5,

    closePanorama: false,

    helperCanvas: {},

    dualFish: {
        width: 1920,
        height: 1080,
        circle1: {
            x: 0.240625,
            y: 0.553704,
            rx: 0.23333,
            ry: 0.43148,
            coverX: 0.913,
            coverY: 0.9
        },
        circle2: {
            x: 0.757292,
            y: 0.553704,
            rx: 0.232292,
            ry: 0.4296296,
            coverX: 0.913,
            coverY: 0.9308
        }
    }
};

function playerResize(player) {
    var canvas = player.getChild('Canvas');
    return function () {
        player.el().style.width = window.innerWidth + "px";
        player.el().style.height = window.innerHeight + "px";
        canvas.handleResize();
    };
}

function fullscreenOnIOS(player, clickFn) {
    var resizeFn = playerResize(player);
    player.controlBar.fullscreenToggle.off("tap", clickFn);
    player.controlBar.fullscreenToggle.on("tap", function fullscreen() {
        var canvas = player.getChild('Canvas');
        if (!player.isFullscreen()) {
            //set to fullscreen
            player.isFullscreen(true);
            player.enterFullWindow();
            resizeFn();
            window.addEventListener("devicemotion", resizeFn);
        } else {
            player.isFullscreen(false);
            player.exitFullWindow();
            player.el().style.width = "";
            player.el().style.height = "";
            canvas.handleResize();
            window.removeEventListener("devicemotion", resizeFn);
        }
    });
}

/**
 * Function to invoke when the player is ready.
 *
 * This is a great place for your plugin to initialize itself. When this
 * function is called, the player will have its DOM and child components
 * in place.
 *
 * @function onPlayerReady
 * @param    {Player} player
 * @param    {Object} [options={}]
 */
var onPlayerReady = function onPlayerReady(player, options, settings) {
    player.addClass('vjs-panorama');
    if (!_Detector2.default.webgl) {
        PopupNotification(player, {
            NoticeMessage: _Detector2.default.getWebGLErrorMessage(),
            autoHideNotice: options.autoHideNotice
        });
        if (options.callback) {
            options.callback();
        }
        return;
    }
    player.addChild('Canvas', _Util2.default.deepCopy(options));
    var canvas = player.getChild('Canvas');
    if (runOnMobile) {
        var videoElement = settings.getTech(player);
        if (_Util2.default.isRealIphone()) {
            //ios 10 support play video inline
            videoElement.setAttribute("playsinline", "");
            (0, _iphoneInlineVideo2.default)(videoElement, true);
        }
        if (_Util2.default.isIos()) {
            fullscreenOnIOS(player, settings.getFullscreenToggleClickFn(player));
        }
        player.addClass("vjs-panorama-mobile-inline-video");
        player.removeClass("vjs-using-native-controls");
        canvas.playOnMobile();
    }
    if (options.showNotice) {
        player.on("playing", function () {
            PopupNotification(player, _Util2.default.deepCopy(options));
        });
    }
    if (options.VREnable) {
        player.controlBar.addChild('VRButton', {}, player.controlBar.children().length - 1);
    }
    canvas.hide();
    player.on("play", function () {
        canvas.show();
    });
    player.on("fullscreenchange", function () {
        canvas.handleResize();
    });
    if (options.callback) options.callback();
};

var PopupNotification = function PopupNotification(player) {
    var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {
        NoticeMessage: ""
    };

    var notice = player.addChild('Notice', options);

    if (options.autoHideNotice > 0) {
        setTimeout(function () {
            notice.addClass("vjs-video-notice-fadeOut");
            var transitionEvent = _Util2.default.whichTransitionEvent();
            var hide = function hide() {
                notice.hide();
                notice.removeClass("vjs-video-notice-fadeOut");
                notice.off(transitionEvent, hide);
            };
            notice.on(transitionEvent, hide);
        }, options.autoHideNotice);
    }
};

var plugin = function plugin() {
    var settings = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    /**
     * A video.js plugin.
     *
     * In the plugin function, the value of `this` is a video.js `Player`
     * instance. You cannot rely on the player being in a "ready" state here,
     * depending on how the plugin is invoked. This may or may not be important
     * to you; if not, remove the wait for "ready"!
     *
     * @function panorama
     * @param    {Object} [options={}]
     *           An object of options left to the plugin author to define.
     */
    var videoTypes = ["equirectangular", "fisheye", "3dVideo", "dual_fisheye"];
    var panorama = function panorama(options) {
        var _this = this;

        if (settings.mergeOption) options = settings.mergeOption(defaults, options);
        if (typeof settings._init === "undefined" || typeof settings._init !== "function") {
            console.error("plugin must implement init function().");
            return;
        }
        if (videoTypes.indexOf(options.videoType) == -1) options.videoType = defaults.videoType;
        settings._init(options);
        /* implement callback function when videojs is ready */
        this.ready(function () {
            onPlayerReady(_this, options, settings);
        });
    };

    // Include the version number.
    panorama.VERSION = '0.1.5';

    return panorama;
};

exports.default = plugin;

},{"./lib/Detector":6,"./lib/Util":11,"iphone-inline-video":2}],14:[function(require,module,exports){
'use strict';

var _Canvas = require('./lib/Canvas');

var _Canvas2 = _interopRequireDefault(_Canvas);

var _ThreeCanvas = require('./lib/ThreeCanvas');

var _ThreeCanvas2 = _interopRequireDefault(_ThreeCanvas);

var _Notice = require('./lib/Notice');

var _Notice2 = _interopRequireDefault(_Notice);

var _HelperCanvas = require('./lib/HelperCanvas');

var _HelperCanvas2 = _interopRequireDefault(_HelperCanvas);

var _VRButton = require('./lib/VRButton');

var _VRButton2 = _interopRequireDefault(_VRButton);

var _plugin = require('./plugin');

var _plugin2 = _interopRequireDefault(_plugin);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function getTech(player) {
    return player.tech({ IWillNotUseThisInPlugins: true }).el();
}

function getFullscreenToggleClickFn(player) {
    return player.controlBar.fullscreenToggle.handleClick;
}

var component = videojs.getComponent('Component');

var notice = (0, _Notice2.default)(component);
videojs.registerComponent('Notice', videojs.extend(component, notice));

var helperCanvas = (0, _HelperCanvas2.default)(component);
videojs.registerComponent('HelperCanvas', videojs.extend(component, helperCanvas));

var button = videojs.getComponent("Button");
var vrBtn = (0, _VRButton2.default)(button);
videojs.registerComponent('VRButton', videojs.extend(button, vrBtn));

// Register the plugin with video.js.
videojs.plugin('panorama', (0, _plugin2.default)({
    _init: function _init(options) {
        var canvas = options.videoType !== "3dVideo" ? (0, _Canvas2.default)(component, window.THREE, {
            getTech: getTech
        }) : (0, _ThreeCanvas2.default)(component, window.THREE, {
            getTech: getTech
        });
        videojs.registerComponent('Canvas', videojs.extend(component, canvas));
    },
    mergeOption: function mergeOption(defaults, options) {
        return videojs.mergeOptions(defaults, options);
    },
    getTech: getTech,
    getFullscreenToggleClickFn: getFullscreenToggleClickFn
}));

},{"./lib/Canvas":5,"./lib/HelperCanvas":7,"./lib/Notice":9,"./lib/ThreeCanvas":10,"./lib/VRButton":12,"./plugin":13}]},{},[14])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaW50ZXJ2YWxvbWV0ZXIvZGlzdC9pbnRlcnZhbG9tZXRlci5jb21tb24tanMuanMiLCJub2RlX21vZHVsZXMvaXBob25lLWlubGluZS12aWRlby9kaXN0L2lwaG9uZS1pbmxpbmUtdmlkZW8uY29tbW9uLWpzLmpzIiwibm9kZV9tb2R1bGVzL3Bvb3ItbWFucy1zeW1ib2wvZGlzdC9wb29yLW1hbnMtc3ltYm9sLmNvbW1vbi1qcy5qcyIsInNyY1xcc2NyaXB0c1xcbGliXFxCYXNlQ2FudmFzLmpzIiwic3JjXFxzY3JpcHRzXFxsaWJcXENhbnZhcy5qcyIsInNyY1xcc2NyaXB0c1xcbGliXFxEZXRlY3Rvci5qcyIsInNyY1xcc2NyaXB0c1xcbGliXFxIZWxwZXJDYW52YXMuanMiLCJzcmNcXHNjcmlwdHNcXGxpYlxcTW9iaWxlQnVmZmVyaW5nLmpzIiwic3JjXFxzY3JpcHRzXFxsaWJcXE5vdGljZS5qcyIsInNyY1xcc2NyaXB0c1xcbGliXFxUaHJlZUNhbnZhcy5qcyIsInNyY1xcc2NyaXB0c1xcbGliXFxVdGlsLmpzIiwic3JjXFxzY3JpcHRzXFxsaWJcXFZSQnV0dG9uLmpzIiwic3JjXFxzY3JpcHRzXFxwbHVnaW4uanMiLCJzcmNcXHNjcmlwdHNcXHBsdWdpbl92NS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdlVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ05BOzs7Ozs7OztBQVFBOzs7Ozs7QUFFQTs7OztBQUNBOzs7O0FBQ0E7Ozs7OztBQUVBLElBQU0sb0JBQW9CLENBQTFCOztBQUVBLElBQUksYUFBYSxTQUFiLFVBQWEsQ0FBVSxhQUFWLEVBQXlCLEtBQXpCLEVBQStDO0FBQUEsUUFBZixRQUFlLHVFQUFKLEVBQUk7O0FB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LEtBVitCO0FBV2hDLGlCQUFhLHFCQUFVLFFBQVYsRUFBb0IsT0FBcEIsRUFBNkI7QUFDdEMsZUFBTyxRQUFRLFlBQVIsQ0FBcUIsUUFBckIsRUFBK0IsT0FBL0IsQ0FBUDtBQUNILEtBYitCO0FBY2hDLGFBQVMsT0FkdUI7QUFlaEMsZ0NBQTRCO0FBZkksQ0FBVCxDQUEzQiIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKiEgbnBtLmltL2ludGVydmFsb21ldGVyICovXG4ndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCAnX19lc01vZHVsZScsIHsgdmFsdWU6IHRydWUgfSk7XG5cbmZ1bmN0aW9uIGludGVydmFsb21ldGVyKGNiLCByZXF1ZXN0LCBjYW5jZWwsIHJlcXVlc3RQYXJhbWV0ZXIpIHtcblx0dmFyIHJlcXVlc3RJZDtcblx0dmFyIHByZXZpb3VzTG9vcFRpbWU7XG5cdGZ1bmN0aW9uIGxvb3Aobm93KSB7XG5cdFx0Ly8gbXVzdCBiZSByZXF1ZXN0ZWQgYmVmb3JlIGNiKCkgYmVjYXVzZSB0aGF0IG1pZ2h0IGNhbGwgLnN0b3AoKVxuXHRcdHJlcXVlc3RJZCA9IHJlcXVlc3QobG9vcCwgcmVxdWVzdFBhcmFtZXRlcik7XG5cblx0XHQvLyBjYWxsZWQgd2l0aCBcIm1zIHNpbmNlIGxhc3QgY2FsbFwiLiAwIG9uIHN0YXJ0KClcblx0XHRjYihub3cgLSAocHJldmlvdXNMb29wVGltZSB8fCBub3cpKTtcblxuXHRcdHByZXZpb3VzTG9vcFRpbWUgPSBub3c7XG5cdH1cblx0cmV0dXJuIHtcblx0XHRzdGFydDogZnVuY3Rpb24gc3RhcnQoKSB7XG5cdFx0XHRpZiAoIXJlcXVlc3RJZCkgeyAvLyBwcmV2ZW50IGRvdWJsZSBzdGFydHNcblx0XHRcdFx0bG9vcCgwKTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdHN0b3A6IGZ1bmN0aW9uIHN0b3AoKSB7XG5cdFx0XHRjYW5jZWwocmVxdWVzdElkKTtcblx0XHRcdHJlcXVlc3RJZCA9IG51bGw7XG5cdFx0XHRwcmV2aW91c0xvb3BUaW1lID0gMDtcblx0XHR9XG5cdH07XG59XG5cbmZ1bmN0aW9uIGZyYW1lSW50ZXJ2YWxvbWV0ZXIoY2IpIHtcblx0cmV0dXJuIGludGVydmFsb21ldGVyKGNiLCByZXF1ZXN0QW5pbWF0aW9uRnJhbWUsIGNhbmNlbEFuaW1hdGlvbkZyYW1lKTtcbn1cblxuZnVuY3Rpb24gdGltZXJJbnRlcnZhbG9tZXRlcihjYiwgZGVsYXkpIHtcblx0cmV0dXJuIGludGVydmFsb21ldGVyKGNiLCBzZXRUaW1lb3V0LCBjbGVhclRpbWVvdXQsIGRlbGF5KTtcbn1cblxuZXhwb3J0cy5pbnRlcnZhbG9tZXRlciA9IGludGVydmFsb21ldGVyO1xuZXhwb3J0cy5mcmFtZUludGVydmFsb21ldGVyID0gZnJhbWVJbnRlcnZhbG9tZXRlcjtcbmV4cG9ydHMudGltZXJJbnRlcnZhbG9tZXRlciA9IHRpbWVySW50ZXJ2YWxvbWV0ZXI7IiwiLyohIG5wbS5pbS9pcGhvbmUtaW5saW5lLXZpZGVvICovXG4ndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wRGVmYXVsdCAoZXgpIHsgcmV0dXJuIChleCAmJiAodHlwZW9mIGV4ID09PSAnb2JqZWN0JykgJiYgJ2RlZmF1bHQnIGluIGV4KSA/IGV4WydkZWZhdWx0J10gOiBleDsgfVxuXG52YXIgU3ltYm9sID0gX2ludGVyb3BEZWZhdWx0KHJlcXVpcmUoJ3Bvb3ItbWFucy1zeW1ib2wnKSk7XG52YXIgaW50ZXJ2YWxvbWV0ZXIgPSByZXF1aXJlKCdpbnRlcnZhbG9tZXRlcicpO1xuXG5mdW5jdGlvbiBwcmV2ZW50RXZlbnQoZWxlbWVudCwgZXZlbnROYW1lLCB0b2dnbGVQcm9wZXJ0eSwgcHJldmVudFdpdGhQcm9wZXJ0eSkge1xuXHRmdW5jdGlvbiBoYW5kbGVyKGUpIHtcblx0XHRpZiAoQm9vbGVhbihlbGVtZW50W3RvZ2dsZVByb3BlcnR5XSkgPT09IEJvb2xlYW4ocHJldmVudFdpdGhQcm9wZXJ0eSkpIHtcblx0XHRcdGUuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG5cdFx0XHQvLyBjb25zb2xlLmxvZyhldmVudE5hbWUsICdwcmV2ZW50ZWQgb24nLCBlbGVtZW50KTtcblx0XHR9XG5cdFx0ZGVsZXRlIGVsZW1lbnRbdG9nZ2xlUHJvcGVydHldO1xuXHR9XG5cdGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIGhhbmRsZXIsIGZhbHNlKTtcblxuXHQvLyBSZXR1cm4gaGFuZGxlciB0byBhbGxvdyB0byBkaXNhYmxlIHRoZSBwcmV2ZW50aW9uLiBVc2FnZTpcblx0Ly8gY29uc3QgcHJldmVudGlvbkhhbmRsZXIgPSBwcmV2ZW50RXZlbnQoZWwsICdjbGljaycpO1xuXHQvLyBlbC5yZW1vdmVFdmVudEhhbmRsZXIoJ2NsaWNrJywgcHJldmVudGlvbkhhbmRsZXIpO1xuXHRyZXR1cm4gaGFuZGxlcjtcbn1cblxuZnVuY3Rpb24gcHJveHlQcm9wZXJ0eShvYmplY3QsIHByb3BlcnR5TmFtZSwgc291cmNlT2JqZWN0LCBjb3B5Rmlyc3QpIHtcblx0ZnVuY3Rpb24gZ2V0KCkge1xuXHRcdHJldHVybiBzb3VyY2VPYmplY3RbcHJvcGVydHlOYW1lXTtcblx0fVxuXHRmdW5jdGlvbiBzZXQodmFsdWUpIHtcblx0XHRzb3VyY2VPYmplY3RbcHJvcGVydHlOYW1lXSA9IHZhbHVlO1xuXHR9XG5cblx0aWYgKGNvcHlGaXJzdCkge1xuXHRcdHNldChvYmplY3RbcHJvcGVydHlOYW1lXSk7XG5cdH1cblxuXHRPYmplY3QuZGVmaW5lUHJvcGVydHkob2JqZWN0LCBwcm9wZXJ0eU5hbWUsIHtnZXQ6IGdldCwgc2V0OiBzZXR9KTtcbn1cblxuZnVuY3Rpb24gcHJveHlFdmVudChvYmplY3QsIGV2ZW50TmFtZSwgc291cmNlT2JqZWN0KSB7XG5cdHNvdXJjZU9iamVjdC5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgZnVuY3Rpb24gKCkgeyByZXR1cm4gb2JqZWN0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KGV2ZW50TmFtZSkpOyB9KTtcbn1cblxuZnVuY3Rpb24gZGlzcGF0Y2hFdmVudEFzeW5jKGVsZW1lbnQsIHR5cGUpIHtcblx0UHJvbWlzZS5yZXNvbHZlKCkudGhlbihmdW5jdGlvbiAoKSB7XG5cdFx0ZWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCh0eXBlKSk7XG5cdH0pO1xufVxuXG4vLyBpT1MgMTAgYWRkcyBzdXBwb3J0IGZvciBuYXRpdmUgaW5saW5lIHBsYXliYWNrICsgc2lsZW50IGF1dG9wbGF5XG52YXIgaXNXaGl0ZWxpc3RlZCA9ICdvYmplY3QtZml0JyBpbiBkb2N1bWVudC5oZWFkLnN0eWxlICYmIC9pUGhvbmV8aVBvZC9pLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCkgJiYgIW1hdGNoTWVkaWEoJygtd2Via2l0LXZpZGVvLXBsYXlhYmxlLWlubGluZSknKS5tYXRjaGVzO1xuXG52YXIg4LKgID0gU3ltYm9sKCk7XG52YXIg4LKgZXZlbnQgPSBTeW1ib2woKTtcbnZhciDgsqBwbGF5ID0gU3ltYm9sKCduYXRpdmVwbGF5Jyk7XG52YXIg4LKgcGF1c2UgPSBTeW1ib2woJ25hdGl2ZXBhdXNlJyk7XG5cbi8qKlxuICogVVRJTFNcbiAqL1xuXG5mdW5jdGlvbiBnZXRBdWRpb0Zyb21WaWRlbyh2aWRlbykge1xuXHR2YXIgYXVkaW8gPSBuZXcgQXVkaW8oKTtcblx0cHJveHlFdmVudCh2aWRlbywgJ3BsYXknLCBhdWRpbyk7XG5cdHByb3h5RXZlbnQodmlkZW8sICdwbGF5aW5nJywgYXVkaW8pO1xuXHRwcm94eUV2ZW50KHZpZGVvLCAncGF1c2UnLCBhdWRpbyk7XG5cdGF1ZGlvLmNyb3NzT3JpZ2luID0gdmlkZW8uY3Jvc3NPcmlnaW47XG5cblx0Ly8gJ2RhdGE6JyBjYXVzZXMgYXVkaW8ubmV0d29ya1N0YXRlID4gMFxuXHQvLyB3aGljaCB0aGVuIGFsbG93cyB0byBrZWVwIDxhdWRpbz4gaW4gYSByZXN1bWFibGUgcGxheWluZyBzdGF0ZVxuXHQvLyBpLmUuIG9uY2UgeW91IHNldCBhIHJlYWwgc3JjIGl0IHdpbGwga2VlcCBwbGF5aW5nIGlmIGl0IHdhcyBpZiAucGxheSgpIHdhcyBjYWxsZWRcblx0YXVkaW8uc3JjID0gdmlkZW8uc3JjIHx8IHZpZGVvLmN1cnJlbnRTcmMgfHwgJ2RhdGE6JztcblxuXHQvLyBpZiAoYXVkaW8uc3JjID09PSAnZGF0YTonKSB7XG5cdC8vICAgVE9ETzogd2FpdCBmb3IgdmlkZW8gdG8gYmUgc2VsZWN0ZWRcblx0Ly8gfVxuXHRyZXR1cm4gYXVkaW87XG59XG5cbnZhciBsYXN0UmVxdWVzdHMgPSBbXTtcbnZhciByZXF1ZXN0SW5kZXggPSAwO1xudmFyIGxhc3RUaW1ldXBkYXRlRXZlbnQ7XG5cbmZ1bmN0aW9uIHNldFRpbWUodmlkZW8sIHRpbWUsIHJlbWVtYmVyT25seSkge1xuXHQvLyBhbGxvdyBvbmUgdGltZXVwZGF0ZSBldmVudCBldmVyeSAyMDArIG1zXG5cdGlmICgobGFzdFRpbWV1cGRhdGVFdmVudCB8fCAwKSArIDIwMCA8IERhdGUubm93KCkpIHtcblx0XHR2aWRlb1vgsqBldmVudF0gPSB0cnVlO1xuXHRcdGxhc3RUaW1ldXBkYXRlRXZlbnQgPSBEYXRlLm5vdygpO1xuXHR9XG5cdGlmICghcmVtZW1iZXJPbmx5KSB7XG5cdFx0dmlkZW8uY3VycmVudFRpbWUgPSB0aW1lO1xuXHR9XG5cdGxhc3RSZXF1ZXN0c1srK3JlcXVlc3RJbmRleCAlIDNdID0gdGltZSAqIDEwMCB8IDAgLyAxMDA7XG59XG5cbmZ1bmN0aW9uIGlzUGxheWVyRW5kZWQocGxheWVyKSB7XG5cdHJldHVybiBwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID49IHBsYXllci52aWRlby5kdXJhdGlvbjtcbn1cblxuZnVuY3Rpb24gdXBkYXRlKHRpbWVEaWZmKSB7XG5cdHZhciBwbGF5ZXIgPSB0aGlzO1xuXHQvLyBjb25zb2xlLmxvZygndXBkYXRlJywgcGxheWVyLnZpZGVvLnJlYWR5U3RhdGUsIHBsYXllci52aWRlby5uZXR3b3JrU3RhdGUsIHBsYXllci5kcml2ZXIucmVhZHlTdGF0ZSwgcGxheWVyLmRyaXZlci5uZXR3b3JrU3RhdGUsIHBsYXllci5kcml2ZXIucGF1c2VkKTtcblx0aWYgKHBsYXllci52aWRlby5yZWFkeVN0YXRlID49IHBsYXllci52aWRlby5IQVZFX0ZVVFVSRV9EQVRBKSB7XG5cdFx0aWYgKCFwbGF5ZXIuaGFzQXVkaW8pIHtcblx0XHRcdHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPSBwbGF5ZXIudmlkZW8uY3VycmVudFRpbWUgKyAoKHRpbWVEaWZmICogcGxheWVyLnZpZGVvLnBsYXliYWNrUmF0ZSkgLyAxMDAwKTtcblx0XHRcdGlmIChwbGF5ZXIudmlkZW8ubG9vcCAmJiBpc1BsYXllckVuZGVkKHBsYXllcikpIHtcblx0XHRcdFx0cGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA9IDA7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHNldFRpbWUocGxheWVyLnZpZGVvLCBwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lKTtcblx0fSBlbHNlIGlmIChwbGF5ZXIudmlkZW8ubmV0d29ya1N0YXRlID09PSBwbGF5ZXIudmlkZW8uTkVUV09SS19JRExFICYmICFwbGF5ZXIudmlkZW8uYnVmZmVyZWQubGVuZ3RoKSB7XG5cdFx0Ly8gdGhpcyBzaG91bGQgaGFwcGVuIHdoZW4gdGhlIHNvdXJjZSBpcyBhdmFpbGFibGUgYnV0OlxuXHRcdC8vIC0gaXQncyBwb3RlbnRpYWxseSBwbGF5aW5nICgucGF1c2VkID09PSBmYWxzZSlcblx0XHQvLyAtIGl0J3Mgbm90IHJlYWR5IHRvIHBsYXlcblx0XHQvLyAtIGl0J3Mgbm90IGxvYWRpbmdcblx0XHQvLyBJZiBpdCBoYXNBdWRpbywgdGhhdCB3aWxsIGJlIGxvYWRlZCBpbiB0aGUgJ2VtcHRpZWQnIGhhbmRsZXIgYmVsb3dcblx0XHRwbGF5ZXIudmlkZW8ubG9hZCgpO1xuXHRcdC8vIGNvbnNvbGUubG9nKCdXaWxsIGxvYWQnKTtcblx0fVxuXG5cdC8vIGNvbnNvbGUuYXNzZXJ0KHBsYXllci52aWRlby5jdXJyZW50VGltZSA9PT0gcGxheWVyLmRyaXZlci5jdXJyZW50VGltZSwgJ1ZpZGVvIG5vdCB1cGRhdGluZyEnKTtcblxuXHRpZiAocGxheWVyLnZpZGVvLmVuZGVkKSB7XG5cdFx0ZGVsZXRlIHBsYXllci52aWRlb1vgsqBldmVudF07IC8vIGFsbG93IHRpbWV1cGRhdGUgZXZlbnRcblx0XHRwbGF5ZXIudmlkZW8ucGF1c2UodHJ1ZSk7XG5cdH1cbn1cblxuLyoqXG4gKiBNRVRIT0RTXG4gKi9cblxuZnVuY3Rpb24gcGxheSgpIHtcblx0Ly8gY29uc29sZS5sb2coJ3BsYXknKTtcblx0dmFyIHZpZGVvID0gdGhpcztcblx0dmFyIHBsYXllciA9IHZpZGVvW+CyoF07XG5cblx0Ly8gaWYgaXQncyBmdWxsc2NyZWVuLCB1c2UgdGhlIG5hdGl2ZSBwbGF5ZXJcblx0aWYgKHZpZGVvLndlYmtpdERpc3BsYXlpbmdGdWxsc2NyZWVuKSB7XG5cdFx0dmlkZW9b4LKgcGxheV0oKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRpZiAocGxheWVyLmRyaXZlci5zcmMgIT09ICdkYXRhOicgJiYgcGxheWVyLmRyaXZlci5zcmMgIT09IHZpZGVvLnNyYykge1xuXHRcdC8vIGNvbnNvbGUubG9nKCdzcmMgY2hhbmdlZCBvbiBwbGF5JywgdmlkZW8uc3JjKTtcblx0XHRzZXRUaW1lKHZpZGVvLCAwLCB0cnVlKTtcblx0XHRwbGF5ZXIuZHJpdmVyLnNyYyA9IHZpZGVvLnNyYztcblx0fVxuXG5cdGlmICghdmlkZW8ucGF1c2VkKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdHBsYXllci5wYXVzZWQgPSBmYWxzZTtcblxuXHRpZiAoIXZpZGVvLmJ1ZmZlcmVkLmxlbmd0aCkge1xuXHRcdC8vIC5sb2FkKCkgY2F1c2VzIHRoZSBlbXB0aWVkIGV2ZW50XG5cdFx0Ly8gdGhlIGFsdGVybmF0aXZlIGlzIC5wbGF5KCkrLnBhdXNlKCkgYnV0IHRoYXQgdHJpZ2dlcnMgcGxheS9wYXVzZSBldmVudHMsIGV2ZW4gd29yc2Vcblx0XHQvLyBwb3NzaWJseSB0aGUgYWx0ZXJuYXRpdmUgaXMgcHJldmVudGluZyB0aGlzIGV2ZW50IG9ubHkgb25jZVxuXHRcdHZpZGVvLmxvYWQoKTtcblx0fVxuXG5cdHBsYXllci5kcml2ZXIucGxheSgpO1xuXHRwbGF5ZXIudXBkYXRlci5zdGFydCgpO1xuXG5cdGlmICghcGxheWVyLmhhc0F1ZGlvKSB7XG5cdFx0ZGlzcGF0Y2hFdmVudEFzeW5jKHZpZGVvLCAncGxheScpO1xuXHRcdGlmIChwbGF5ZXIudmlkZW8ucmVhZHlTdGF0ZSA+PSBwbGF5ZXIudmlkZW8uSEFWRV9FTk9VR0hfREFUQSkge1xuXHRcdFx0Ly8gY29uc29sZS5sb2coJ29ucGxheScpO1xuXHRcdFx0ZGlzcGF0Y2hFdmVudEFzeW5jKHZpZGVvLCAncGxheWluZycpO1xuXHRcdH1cblx0fVxufVxuZnVuY3Rpb24gcGF1c2UoZm9yY2VFdmVudHMpIHtcblx0Ly8gY29uc29sZS5sb2coJ3BhdXNlJyk7XG5cdHZhciB2aWRlbyA9IHRoaXM7XG5cdHZhciBwbGF5ZXIgPSB2aWRlb1vgsqBdO1xuXG5cdHBsYXllci5kcml2ZXIucGF1c2UoKTtcblx0cGxheWVyLnVwZGF0ZXIuc3RvcCgpO1xuXG5cdC8vIGlmIGl0J3MgZnVsbHNjcmVlbiwgdGhlIGRldmVsb3BlciB0aGUgbmF0aXZlIHBsYXllci5wYXVzZSgpXG5cdC8vIFRoaXMgaXMgYXQgdGhlIGVuZCBvZiBwYXVzZSgpIGJlY2F1c2UgaXQgYWxzb1xuXHQvLyBuZWVkcyB0byBtYWtlIHN1cmUgdGhhdCB0aGUgc2ltdWxhdGlvbiBpcyBwYXVzZWRcblx0aWYgKHZpZGVvLndlYmtpdERpc3BsYXlpbmdGdWxsc2NyZWVuKSB7XG5cdFx0dmlkZW9b4LKgcGF1c2VdKCk7XG5cdH1cblxuXHRpZiAocGxheWVyLnBhdXNlZCAmJiAhZm9yY2VFdmVudHMpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRwbGF5ZXIucGF1c2VkID0gdHJ1ZTtcblx0aWYgKCFwbGF5ZXIuaGFzQXVkaW8pIHtcblx0XHRkaXNwYXRjaEV2ZW50QXN5bmModmlkZW8sICdwYXVzZScpO1xuXHR9XG5cdGlmICh2aWRlby5lbmRlZCkge1xuXHRcdHZpZGVvW+CyoGV2ZW50XSA9IHRydWU7XG5cdFx0ZGlzcGF0Y2hFdmVudEFzeW5jKHZpZGVvLCAnZW5kZWQnKTtcblx0fVxufVxuXG4vKipcbiAqIFNFVFVQXG4gKi9cblxuZnVuY3Rpb24gYWRkUGxheWVyKHZpZGVvLCBoYXNBdWRpbykge1xuXHR2YXIgcGxheWVyID0gdmlkZW9b4LKgXSA9IHt9O1xuXHRwbGF5ZXIucGF1c2VkID0gdHJ1ZTsgLy8gdHJhY2sgd2hldGhlciAncGF1c2UnIGV2ZW50cyBoYXZlIGJlZW4gZmlyZWRcblx0cGxheWVyLmhhc0F1ZGlvID0gaGFzQXVkaW87XG5cdHBsYXllci52aWRlbyA9IHZpZGVvO1xuXHRwbGF5ZXIudXBkYXRlciA9IGludGVydmFsb21ldGVyLmZyYW1lSW50ZXJ2YWxvbWV0ZXIodXBkYXRlLmJpbmQocGxheWVyKSk7XG5cblx0aWYgKGhhc0F1ZGlvKSB7XG5cdFx0cGxheWVyLmRyaXZlciA9IGdldEF1ZGlvRnJvbVZpZGVvKHZpZGVvKTtcblx0fSBlbHNlIHtcblx0XHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCdjYW5wbGF5JywgZnVuY3Rpb24gKCkge1xuXHRcdFx0aWYgKCF2aWRlby5wYXVzZWQpIHtcblx0XHRcdFx0Ly8gY29uc29sZS5sb2coJ29uY2FucGxheScpO1xuXHRcdFx0XHRkaXNwYXRjaEV2ZW50QXN5bmModmlkZW8sICdwbGF5aW5nJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cGxheWVyLmRyaXZlciA9IHtcblx0XHRcdHNyYzogdmlkZW8uc3JjIHx8IHZpZGVvLmN1cnJlbnRTcmMgfHwgJ2RhdGE6Jyxcblx0XHRcdG11dGVkOiB0cnVlLFxuXHRcdFx0cGF1c2VkOiB0cnVlLFxuXHRcdFx0cGF1c2U6IGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cGxheWVyLmRyaXZlci5wYXVzZWQgPSB0cnVlO1xuXHRcdFx0fSxcblx0XHRcdHBsYXk6IGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cGxheWVyLmRyaXZlci5wYXVzZWQgPSBmYWxzZTtcblx0XHRcdFx0Ly8gbWVkaWEgYXV0b21hdGljYWxseSBnb2VzIHRvIDAgaWYgLnBsYXkoKSBpcyBjYWxsZWQgd2hlbiBpdCdzIGRvbmVcblx0XHRcdFx0aWYgKGlzUGxheWVyRW5kZWQocGxheWVyKSkge1xuXHRcdFx0XHRcdHNldFRpbWUodmlkZW8sIDApO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGVuZGVkKCkge1xuXHRcdFx0XHRyZXR1cm4gaXNQbGF5ZXJFbmRlZChwbGF5ZXIpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHQvLyAubG9hZCgpIGNhdXNlcyB0aGUgZW1wdGllZCBldmVudFxuXHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCdlbXB0aWVkJywgZnVuY3Rpb24gKCkge1xuXHRcdC8vIGNvbnNvbGUubG9nKCdkcml2ZXIgc3JjIGlzJywgcGxheWVyLmRyaXZlci5zcmMpO1xuXHRcdHZhciB3YXNFbXB0eSA9ICFwbGF5ZXIuZHJpdmVyLnNyYyB8fCBwbGF5ZXIuZHJpdmVyLnNyYyA9PT0gJ2RhdGE6Jztcblx0XHRpZiAocGxheWVyLmRyaXZlci5zcmMgJiYgcGxheWVyLmRyaXZlci5zcmMgIT09IHZpZGVvLnNyYykge1xuXHRcdFx0Ly8gY29uc29sZS5sb2coJ3NyYyBjaGFuZ2VkIHRvJywgdmlkZW8uc3JjKTtcblx0XHRcdHNldFRpbWUodmlkZW8sIDAsIHRydWUpO1xuXHRcdFx0cGxheWVyLmRyaXZlci5zcmMgPSB2aWRlby5zcmM7XG5cdFx0XHQvLyBwbGF5aW5nIHZpZGVvcyB3aWxsIG9ubHkga2VlcCBwbGF5aW5nIGlmIG5vIHNyYyB3YXMgcHJlc2VudCB3aGVuIC5wbGF5KCnigJllZFxuXHRcdFx0aWYgKHdhc0VtcHR5KSB7XG5cdFx0XHRcdHBsYXllci5kcml2ZXIucGxheSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cGxheWVyLnVwZGF0ZXIuc3RvcCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSwgZmFsc2UpO1xuXG5cdC8vIHN0b3AgcHJvZ3JhbW1hdGljIHBsYXllciB3aGVuIE9TIHRha2VzIG92ZXJcblx0dmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0YmVnaW5mdWxsc2NyZWVuJywgZnVuY3Rpb24gKCkge1xuXHRcdGlmICghdmlkZW8ucGF1c2VkKSB7XG5cdFx0XHQvLyBtYWtlIHN1cmUgdGhhdCB0aGUgPGF1ZGlvPiBhbmQgdGhlIHN5bmNlci91cGRhdGVyIGFyZSBzdG9wcGVkXG5cdFx0XHR2aWRlby5wYXVzZSgpO1xuXG5cdFx0XHQvLyBwbGF5IHZpZGVvIG5hdGl2ZWx5XG5cdFx0XHR2aWRlb1vgsqBwbGF5XSgpO1xuXHRcdH0gZWxzZSBpZiAoaGFzQXVkaW8gJiYgIXBsYXllci5kcml2ZXIuYnVmZmVyZWQubGVuZ3RoKSB7XG5cdFx0XHQvLyBpZiB0aGUgZmlyc3QgcGxheSBpcyBuYXRpdmUsXG5cdFx0XHQvLyB0aGUgPGF1ZGlvPiBuZWVkcyB0byBiZSBidWZmZXJlZCBtYW51YWxseVxuXHRcdFx0Ly8gc28gd2hlbiB0aGUgZnVsbHNjcmVlbiBlbmRzLCBpdCBjYW4gYmUgc2V0IHRvIHRoZSBzYW1lIGN1cnJlbnQgdGltZVxuXHRcdFx0cGxheWVyLmRyaXZlci5sb2FkKCk7XG5cdFx0fVxuXHR9KTtcblx0aWYgKGhhc0F1ZGlvKSB7XG5cdFx0dmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0ZW5kZnVsbHNjcmVlbicsIGZ1bmN0aW9uICgpIHtcblx0XHRcdC8vIHN5bmMgYXVkaW8gdG8gbmV3IHZpZGVvIHBvc2l0aW9uXG5cdFx0XHRwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID0gdmlkZW8uY3VycmVudFRpbWU7XG5cdFx0XHQvLyBjb25zb2xlLmFzc2VydChwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID09PSB2aWRlby5jdXJyZW50VGltZSwgJ0F1ZGlvIG5vdCBzeW5jZWQnKTtcblx0XHR9KTtcblxuXHRcdC8vIGFsbG93IHNlZWtpbmdcblx0XHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCdzZWVraW5nJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0aWYgKGxhc3RSZXF1ZXN0cy5pbmRleE9mKHZpZGVvLmN1cnJlbnRUaW1lICogMTAwIHwgMCAvIDEwMCkgPCAwKSB7XG5cdFx0XHRcdC8vIGNvbnNvbGUubG9nKCdVc2VyLXJlcXVlc3RlZCBzZWVraW5nJyk7XG5cdFx0XHRcdHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPSB2aWRlby5jdXJyZW50VGltZTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBvdmVybG9hZEFQSSh2aWRlbykge1xuXHR2YXIgcGxheWVyID0gdmlkZW9b4LKgXTtcblx0dmlkZW9b4LKgcGxheV0gPSB2aWRlby5wbGF5O1xuXHR2aWRlb1vgsqBwYXVzZV0gPSB2aWRlby5wYXVzZTtcblx0dmlkZW8ucGxheSA9IHBsYXk7XG5cdHZpZGVvLnBhdXNlID0gcGF1c2U7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdwYXVzZWQnLCBwbGF5ZXIuZHJpdmVyKTtcblx0cHJveHlQcm9wZXJ0eSh2aWRlbywgJ211dGVkJywgcGxheWVyLmRyaXZlciwgdHJ1ZSk7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdwbGF5YmFja1JhdGUnLCBwbGF5ZXIuZHJpdmVyLCB0cnVlKTtcblx0cHJveHlQcm9wZXJ0eSh2aWRlbywgJ2VuZGVkJywgcGxheWVyLmRyaXZlcik7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdsb29wJywgcGxheWVyLmRyaXZlciwgdHJ1ZSk7XG5cdHByZXZlbnRFdmVudCh2aWRlbywgJ3NlZWtpbmcnKTtcblx0cHJldmVudEV2ZW50KHZpZGVvLCAnc2Vla2VkJyk7XG5cdHByZXZlbnRFdmVudCh2aWRlbywgJ3RpbWV1cGRhdGUnLCDgsqBldmVudCwgZmFsc2UpO1xuXHRwcmV2ZW50RXZlbnQodmlkZW8sICdlbmRlZCcsIOCyoGV2ZW50LCBmYWxzZSk7IC8vIHByZXZlbnQgb2NjYXNpb25hbCBuYXRpdmUgZW5kZWQgZXZlbnRzXG59XG5cbmZ1bmN0aW9uIGVuYWJsZUlubGluZVZpZGVvKHZpZGVvLCBoYXNBdWRpbywgb25seVdoaXRlbGlzdGVkKSB7XG5cdGlmICggaGFzQXVkaW8gPT09IHZvaWQgMCApIGhhc0F1ZGlvID0gdHJ1ZTtcblx0aWYgKCBvbmx5V2hpdGVsaXN0ZWQgPT09IHZvaWQgMCApIG9ubHlXaGl0ZWxpc3RlZCA9IHRydWU7XG5cblx0aWYgKChvbmx5V2hpdGVsaXN0ZWQgJiYgIWlzV2hpdGVsaXN0ZWQpIHx8IHZpZGVvW+CyoF0pIHtcblx0XHRyZXR1cm47XG5cdH1cblx0YWRkUGxheWVyKHZpZGVvLCBoYXNBdWRpbyk7XG5cdG92ZXJsb2FkQVBJKHZpZGVvKTtcblx0dmlkZW8uY2xhc3NMaXN0LmFkZCgnSUlWJyk7XG5cdGlmICghaGFzQXVkaW8gJiYgdmlkZW8uYXV0b3BsYXkpIHtcblx0XHR2aWRlby5wbGF5KCk7XG5cdH1cblx0aWYgKCEvaVBob25lfGlQb2R8aVBhZC8udGVzdChuYXZpZ2F0b3IucGxhdGZvcm0pKSB7XG5cdFx0Y29uc29sZS53YXJuKCdpcGhvbmUtaW5saW5lLXZpZGVvIGlzIG5vdCBndWFyYW50ZWVkIHRvIHdvcmsgaW4gZW11bGF0ZWQgZW52aXJvbm1lbnRzJyk7XG5cdH1cbn1cblxuZW5hYmxlSW5saW5lVmlkZW8uaXNXaGl0ZWxpc3RlZCA9IGlzV2hpdGVsaXN0ZWQ7XG5cbm1vZHVsZS5leHBvcnRzID0gZW5hYmxlSW5saW5lVmlkZW87IiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgaW5kZXggPSB0eXBlb2YgU3ltYm9sID09PSAndW5kZWZpbmVkJyA/IGZ1bmN0aW9uIChkZXNjcmlwdGlvbikge1xuXHRyZXR1cm4gJ0AnICsgKGRlc2NyaXB0aW9uIHx8ICdAJykgKyBNYXRoLnJhbmRvbSgpO1xufSA6IFN5bWJvbDtcblxubW9kdWxlLmV4cG9ydHMgPSBpbmRleDsiLCIvKipcclxuICpcclxuICogKGMpIFdlbnNoZW5nIFlhbiA8eWFud3NoQGdtYWlsLmNvbT5cclxuICogRGF0ZTogMTAvMzAvMTZcclxuICpcclxuICogRm9yIHRoZSBmdWxsIGNvcHlyaWdodCBhbmQgbGljZW5zZSBpbmZvcm1hdGlvbiwgcGxlYXNlIHZpZXcgdGhlIExJQ0VOU0VcclxuICogZmlsZSB0aGF0IHdhcyBkaXN0cmlidXRlZCB3aXRoIHRoaXMgc291cmNlIGNvZGUuXHJcbiAqL1xyXG4ndXNlIHN0cmljdCc7XHJcblxyXG5pbXBvcnQgRGV0ZWN0b3IgZnJvbSAnLi4vbGliL0RldGVjdG9yJztcclxuaW1wb3J0IE1vYmlsZUJ1ZmZlcmluZyBmcm9tICcuLi9saWIvTW9iaWxlQnVmZmVyaW5nJztcclxuaW1wb3J0IFV0aWwgZnJvbSAnLi4vbGliL1V0aWwnO1xyXG5cclxuY29uc3QgSEFWRV9DVVJSRU5UX0RBVEEgPSAyO1xyXG5cclxudmFyIEJhc2VDYW52YXMgPSBmdW5jdGlvbiAoYmFzZUNvbXBvbmVudCwgVEhSRUUsIHNldHRpbmdzID0ge30pIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcclxuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncyA9IG9wdGlvbnM7XHJcbiAgICAgICAgICAgIC8vYmFzaWMgc2V0dGluZ3NcclxuICAgICAgICAgICAgdGhpcy53aWR0aCA9IHBsYXllci5lbCgpLm9mZnNldFdpZHRoLCB0aGlzLmhlaWdodCA9IHBsYXllci5lbCgpLm9mZnNldEhlaWdodDtcclxuICAgICAgICAgICAgdGhpcy5sb24gPSBvcHRpb25zLmluaXRMb24sIHRoaXMubGF0ID0gb3B0aW9ucy5pbml0TGF0LCB0aGlzLnBoaSA9IDAsIHRoaXMudGhldGEgPSAwO1xyXG4gICAgICAgICAgICB0aGlzLnZpZGVvVHlwZSA9IG9wdGlvbnMudmlkZW9UeXBlO1xyXG4gICAgICAgICAgICB0aGlzLmNsaWNrVG9Ub2dnbGUgPSBvcHRpb25zLmNsaWNrVG9Ub2dnbGU7XHJcbiAgICAgICAgICAgIHRoaXMubW91c2VEb3duID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHRoaXMuaXNVc2VySW50ZXJhY3RpbmcgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgICAgIC8vZGVmaW5lIHJlbmRlclxyXG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyZXIoKTtcclxuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRQaXhlbFJhdGlvKHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvKTtcclxuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaXplKHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5hdXRvQ2xlYXIgPSBmYWxzZTtcclxuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRDbGVhckNvbG9yKDB4MDAwMDAwLCAxKTtcclxuXHJcbiAgICAgICAgICAgIC8vZGVmaW5lIHRleHR1cmUsIG9uIGllIDExLCB3ZSBuZWVkIGFkZGl0aW9uYWwgaGVscGVyIGNhbnZhcyB0byBzb2x2ZSByZW5kZXJpbmcgaXNzdWUuXHJcbiAgICAgICAgICAgIHZhciB2aWRlbyA9IHNldHRpbmdzLmdldFRlY2gocGxheWVyKTtcclxuICAgICAgICAgICAgdGhpcy5zdXBwb3J0VmlkZW9UZXh0dXJlID0gRGV0ZWN0b3Iuc3VwcG9ydFZpZGVvVGV4dHVyZSgpO1xyXG4gICAgICAgICAgICB0aGlzLmxpdmVTdHJlYW1PblNhZmFyaSA9IERldGVjdG9yLmlzTGl2ZVN0cmVhbU9uU2FmYXJpKHZpZGVvKTtcclxuICAgICAgICAgICAgaWYodGhpcy5saXZlU3RyZWFtT25TYWZhcmkpIHRoaXMuc3VwcG9ydFZpZGVvVGV4dHVyZSA9IGZhbHNlO1xyXG4gICAgICAgICAgICBpZighdGhpcy5zdXBwb3J0VmlkZW9UZXh0dXJlKXtcclxuICAgICAgICAgICAgICAgIHRoaXMuaGVscGVyQ2FudmFzID0gcGxheWVyLmFkZENoaWxkKFwiSGVscGVyQ2FudmFzXCIsIHtcclxuICAgICAgICAgICAgICAgICAgICB2aWRlbzogdmlkZW8sXHJcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6IChvcHRpb25zLmhlbHBlckNhbnZhcy53aWR0aCk/IG9wdGlvbnMuaGVscGVyQ2FudmFzLndpZHRoOiB0aGlzLndpZHRoLFxyXG4gICAgICAgICAgICAgICAgICAgIGhlaWdodDogKG9wdGlvbnMuaGVscGVyQ2FudmFzLmhlaWdodCk/IG9wdGlvbnMuaGVscGVyQ2FudmFzLmhlaWdodDogdGhpcy5oZWlnaHRcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgdmFyIGNvbnRleHQgPSB0aGlzLmhlbHBlckNhbnZhcy5lbCgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlID0gbmV3IFRIUkVFLlRleHR1cmUoY29udGV4dCk7XHJcbiAgICAgICAgICAgIH1lbHNle1xyXG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlID0gbmV3IFRIUkVFLlRleHR1cmUodmlkZW8pO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB2aWRlby5zdHlsZS52aXNpYmlsaXR5ID0gXCJoaWRkZW5cIjtcclxuXHJcbiAgICAgICAgICAgIHRoaXMudGV4dHVyZS5nZW5lcmF0ZU1pcG1hcHMgPSBmYWxzZTtcclxuICAgICAgICAgICAgdGhpcy50ZXh0dXJlLm1pbkZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcclxuICAgICAgICAgICAgdGhpcy50ZXh0dXJlLm1heEZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcclxuICAgICAgICAgICAgdGhpcy50ZXh0dXJlLmZvcm1hdCA9IFRIUkVFLlJHQkZvcm1hdDtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZWxfID0gdGhpcy5yZW5kZXJlci5kb21FbGVtZW50O1xyXG4gICAgICAgICAgICB0aGlzLmVsXy5jbGFzc0xpc3QuYWRkKCd2anMtdmlkZW8tY2FudmFzJyk7XHJcblxyXG4gICAgICAgICAgICBvcHRpb25zLmVsID0gdGhpcy5lbF87XHJcbiAgICAgICAgICAgIGJhc2VDb21wb25lbnQuY2FsbCh0aGlzLCBwbGF5ZXIsIG9wdGlvbnMpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5hdHRhY2hDb250cm9sRXZlbnRzKCk7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyKCkub24oXCJwbGF5XCIsIGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMudGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hbmltYXRlKCk7XHJcbiAgICAgICAgICAgIH0uYmluZCh0aGlzKSk7XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgYXR0YWNoQ29udHJvbEV2ZW50czogZnVuY3Rpb24oKXtcclxuICAgICAgICAgICAgdGhpcy5vbignbW91c2Vtb3ZlJywgdGhpcy5oYW5kbGVNb3VzZU1vdmUuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgICAgIHRoaXMub24oJ3RvdWNobW92ZScsIHRoaXMuaGFuZGxlVG91Y2hNb3ZlLmJpbmQodGhpcykpO1xyXG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZWRvd24nLCB0aGlzLmhhbmRsZU1vdXNlRG93bi5iaW5kKHRoaXMpKTtcclxuICAgICAgICAgICAgdGhpcy5vbigndG91Y2hzdGFydCcsdGhpcy5oYW5kbGVUb3VjaFN0YXJ0LmJpbmQodGhpcykpO1xyXG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZXVwJywgdGhpcy5oYW5kbGVNb3VzZVVwLmJpbmQodGhpcykpO1xyXG4gICAgICAgICAgICB0aGlzLm9uKCd0b3VjaGVuZCcsIHRoaXMuaGFuZGxlVG91Y2hFbmQuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgICAgIGlmKHRoaXMuc2V0dGluZ3Muc2Nyb2xsYWJsZSl7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uKCdtb3VzZXdoZWVsJywgdGhpcy5oYW5kbGVNb3VzZVdoZWVsLmJpbmQodGhpcykpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5vbignTW96TW91c2VQaXhlbFNjcm9sbCcsIHRoaXMuaGFuZGxlTW91c2VXaGVlbC5iaW5kKHRoaXMpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZWVudGVyJywgdGhpcy5oYW5kbGVNb3VzZUVudGVyLmJpbmQodGhpcykpO1xyXG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZWxlYXZlJywgdGhpcy5oYW5kbGVNb3VzZUxlYXNlLmJpbmQodGhpcykpO1xyXG4gICAgICAgIH0sXHJcblxyXG4gICAgICAgIGhhbmRsZVJlc2l6ZTogZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICB0aGlzLndpZHRoID0gdGhpcy5wbGF5ZXIoKS5lbCgpLm9mZnNldFdpZHRoLCB0aGlzLmhlaWdodCA9IHRoaXMucGxheWVyKCkuZWwoKS5vZmZzZXRIZWlnaHQ7XHJcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2l6ZSggdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQgKTtcclxuICAgICAgICB9LFxyXG5cclxuICAgICAgICBoYW5kbGVNb3VzZVVwOiBmdW5jdGlvbihldmVudCl7XHJcbiAgICAgICAgICAgIHRoaXMubW91c2VEb3duID0gZmFsc2U7XHJcbiAgICAgICAgICAgIGlmKHRoaXMuY2xpY2tUb1RvZ2dsZSl7XHJcbiAgICAgICAgICAgICAgICB2YXIgY2xpZW50WCA9IGV2ZW50LmNsaWVudFggfHwgZXZlbnQuY2hhbmdlZFRvdWNoZXMgJiYgZXZlbnQuY2hhbmdlZFRvdWNoZXNbMF0uY2xpZW50WDtcclxuICAgICAgICAgICAgICAgIHZhciBjbGllbnRZID0gZXZlbnQuY2xpZW50WSB8fCBldmVudC5jaGFuZ2VkVG91Y2hlcyAmJiBldmVudC5jaGFuZ2VkVG91Y2hlc1swXS5jbGllbnRZO1xyXG4gICAgICAgICAgICAgICAgaWYodHlwZW9mIGNsaWVudFggPT09IFwidW5kZWZpbmVkXCIgfHwgY2xpZW50WSA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgdmFyIGRpZmZYID0gTWF0aC5hYnMoY2xpZW50WCAtIHRoaXMub25Qb2ludGVyRG93blBvaW50ZXJYKTtcclxuICAgICAgICAgICAgICAgIHZhciBkaWZmWSA9IE1hdGguYWJzKGNsaWVudFkgLSB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWSk7XHJcbiAgICAgICAgICAgICAgICBpZihkaWZmWCA8IDAuMSAmJiBkaWZmWSA8IDAuMSlcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllcigpLnBhdXNlZCgpID8gdGhpcy5wbGF5ZXIoKS5wbGF5KCkgOiB0aGlzLnBsYXllcigpLnBhdXNlKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG5cclxuICAgICAgICBoYW5kbGVNb3VzZURvd246IGZ1bmN0aW9uKGV2ZW50KXtcclxuICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICAgICAgdmFyIGNsaWVudFggPSBldmVudC5jbGllbnRYIHx8IGV2ZW50LnRvdWNoZXMgJiYgZXZlbnQudG91Y2hlc1swXS5jbGllbnRYO1xyXG4gICAgICAgICAgICB2YXIgY2xpZW50WSA9IGV2ZW50LmNsaWVudFkgfHwgZXZlbnQudG91Y2hlcyAmJiBldmVudC50b3VjaGVzWzBdLmNsaWVudFk7XHJcbiAgICAgICAgICAgIGlmKHR5cGVvZiBjbGllbnRYID09PSBcInVuZGVmaW5lZFwiIHx8IGNsaWVudFkgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcclxuICAgICAgICAgICAgdGhpcy5tb3VzZURvd24gPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWCA9IGNsaWVudFg7XHJcbiAgICAgICAgICAgIHRoaXMub25Qb2ludGVyRG93blBvaW50ZXJZID0gY2xpZW50WTtcclxuICAgICAgICAgICAgdGhpcy5vblBvaW50ZXJEb3duTG9uID0gdGhpcy5sb247XHJcbiAgICAgICAgICAgIHRoaXMub25Qb2ludGVyRG93bkxhdCA9IHRoaXMubGF0O1xyXG4gICAgICAgIH0sXHJcblxyXG4gICAgICAgIGhhbmRsZVRvdWNoU3RhcnQ6IGZ1bmN0aW9uKGV2ZW50KXtcclxuICAgICAgICAgICAgaWYoZXZlbnQudG91Y2hlcy5sZW5ndGggPiAxKXtcclxuICAgICAgICAgICAgICAgIHRoaXMuaXNVc2VyUGluY2ggPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5tdWx0aVRvdWNoRGlzdGFuY2UgPSBVdGlsLmdldFRvdWNoZXNEaXN0YW5jZShldmVudC50b3VjaGVzKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmhhbmRsZU1vdXNlRG93bihldmVudCk7XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgaGFuZGxlVG91Y2hFbmQ6IGZ1bmN0aW9uKGV2ZW50KXtcclxuICAgICAgICAgICAgdGhpcy5pc1VzZXJQaW5jaCA9IGZhbHNlO1xyXG4gICAgICAgICAgICB0aGlzLmhhbmRsZU1vdXNlVXAoZXZlbnQpO1xyXG4gICAgICAgIH0sXHJcblxyXG4gICAgICAgIGhhbmRsZU1vdXNlTW92ZTogZnVuY3Rpb24oZXZlbnQpe1xyXG4gICAgICAgICAgICB2YXIgY2xpZW50WCA9IGV2ZW50LmNsaWVudFggfHwgZXZlbnQudG91Y2hlcyAmJiBldmVudC50b3VjaGVzWzBdLmNsaWVudFg7XHJcbiAgICAgICAgICAgIHZhciBjbGllbnRZID0gZXZlbnQuY2xpZW50WSB8fCBldmVudC50b3VjaGVzICYmIGV2ZW50LnRvdWNoZXNbMF0uY2xpZW50WTtcclxuICAgICAgICAgICAgaWYodHlwZW9mIGNsaWVudFggPT09IFwidW5kZWZpbmVkXCIgfHwgY2xpZW50WSA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuO1xyXG4gICAgICAgICAgICBpZih0aGlzLnNldHRpbmdzLmNsaWNrQW5kRHJhZyl7XHJcbiAgICAgICAgICAgICAgICBpZih0aGlzLm1vdXNlRG93bil7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sb24gPSAoIHRoaXMub25Qb2ludGVyRG93blBvaW50ZXJYIC0gY2xpZW50WCApICogMC4yICsgdGhpcy5vblBvaW50ZXJEb3duTG9uO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGF0ID0gKCBjbGllbnRZIC0gdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclkgKSAqIDAuMiArIHRoaXMub25Qb2ludGVyRG93bkxhdDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfWVsc2V7XHJcbiAgICAgICAgICAgICAgICB2YXIgeCA9IGV2ZW50LnBhZ2VYIC0gdGhpcy5lbF8ub2Zmc2V0TGVmdDtcclxuICAgICAgICAgICAgICAgIHZhciB5ID0gZXZlbnQucGFnZVkgLSB0aGlzLmVsXy5vZmZzZXRUb3A7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvbiA9ICh4IC8gdGhpcy53aWR0aCkgKiA0MzAgLSAyMjU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxhdCA9ICh5IC8gdGhpcy5oZWlnaHQpICogLTE4MCArIDkwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgaGFuZGxlVG91Y2hNb3ZlOiBmdW5jdGlvbihldmVudCl7XHJcbiAgICAgICAgICAgIC8vaGFuZGxlIHNpbmdsZSB0b3VjaCBldmVudCxcclxuICAgICAgICAgICAgaWYoIXRoaXMuaXNVc2VyUGluY2ggfHwgZXZlbnQudG91Y2hlcy5sZW5ndGggPD0gMSl7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZU1vdXNlTW92ZShldmVudCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG5cclxuICAgICAgICBoYW5kbGVNb2JpbGVPcmllbnRhdGlvbjogZnVuY3Rpb24gKGV2ZW50KSB7XHJcbiAgICAgICAgICAgIGlmKHR5cGVvZiBldmVudC5yb3RhdGlvblJhdGUgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcclxuICAgICAgICAgICAgdmFyIHggPSBldmVudC5yb3RhdGlvblJhdGUuYWxwaGE7XHJcbiAgICAgICAgICAgIHZhciB5ID0gZXZlbnQucm90YXRpb25SYXRlLmJldGE7XHJcbiAgICAgICAgICAgIHZhciBwb3J0cmFpdCA9ICh0eXBlb2YgZXZlbnQucG9ydHJhaXQgIT09IFwidW5kZWZpbmVkXCIpPyBldmVudC5wb3J0cmFpdCA6IHdpbmRvdy5tYXRjaE1lZGlhKFwiKG9yaWVudGF0aW9uOiBwb3J0cmFpdClcIikubWF0Y2hlcztcclxuICAgICAgICAgICAgdmFyIGxhbmRzY2FwZSA9ICh0eXBlb2YgZXZlbnQubGFuZHNjYXBlICE9PSBcInVuZGVmaW5lZFwiKT8gZXZlbnQubGFuZHNjYXBlIDogd2luZG93Lm1hdGNoTWVkaWEoXCIob3JpZW50YXRpb246IGxhbmRzY2FwZSlcIikubWF0Y2hlcztcclxuICAgICAgICAgICAgdmFyIG9yaWVudGF0aW9uID0gZXZlbnQub3JpZW50YXRpb24gfHwgd2luZG93Lm9yaWVudGF0aW9uO1xyXG5cclxuICAgICAgICAgICAgaWYgKHBvcnRyYWl0KSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvbiA9IHRoaXMubG9uIC0geSAqIHRoaXMuc2V0dGluZ3MubW9iaWxlVmlicmF0aW9uVmFsdWU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxhdCA9IHRoaXMubGF0ICsgeCAqIHRoaXMuc2V0dGluZ3MubW9iaWxlVmlicmF0aW9uVmFsdWU7XHJcbiAgICAgICAgICAgIH1lbHNlIGlmKGxhbmRzY2FwZSl7XHJcbiAgICAgICAgICAgICAgICB2YXIgb3JpZW50YXRpb25EZWdyZWUgPSAtOTA7XHJcbiAgICAgICAgICAgICAgICBpZih0eXBlb2Ygb3JpZW50YXRpb24gIT0gXCJ1bmRlZmluZWRcIil7XHJcbiAgICAgICAgICAgICAgICAgICAgb3JpZW50YXRpb25EZWdyZWUgPSBvcmllbnRhdGlvbjtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvbiA9IChvcmllbnRhdGlvbkRlZ3JlZSA9PSAtOTApPyB0aGlzLmxvbiArIHggKiB0aGlzLnNldHRpbmdzLm1vYmlsZVZpYnJhdGlvblZhbHVlIDogdGhpcy5sb24gLSB4ICogdGhpcy5zZXR0aW5ncy5tb2JpbGVWaWJyYXRpb25WYWx1ZTtcclxuICAgICAgICAgICAgICAgIHRoaXMubGF0ID0gKG9yaWVudGF0aW9uRGVncmVlID09IC05MCk/IHRoaXMubGF0ICsgeSAqIHRoaXMuc2V0dGluZ3MubW9iaWxlVmlicmF0aW9uVmFsdWUgOiB0aGlzLmxhdCAtIHkgKiB0aGlzLnNldHRpbmdzLm1vYmlsZVZpYnJhdGlvblZhbHVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgaGFuZGxlTW91c2VXaGVlbDogZnVuY3Rpb24oZXZlbnQpe1xyXG4gICAgICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICB9LFxyXG5cclxuICAgICAgICBoYW5kbGVNb3VzZUVudGVyOiBmdW5jdGlvbiAoZXZlbnQpIHtcclxuICAgICAgICAgICAgdGhpcy5pc1VzZXJJbnRlcmFjdGluZyA9IHRydWU7XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgaGFuZGxlTW91c2VMZWFzZTogZnVuY3Rpb24gKGV2ZW50KSB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNVc2VySW50ZXJhY3RpbmcgPSBmYWxzZTtcclxuICAgICAgICAgICAgaWYodGhpcy5tb3VzZURvd24pIHtcclxuICAgICAgICAgICAgICAgIHRoaXMubW91c2VEb3duID0gZmFsc2U7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG5cclxuICAgICAgICBhbmltYXRlOiBmdW5jdGlvbigpe1xyXG4gICAgICAgICAgICB0aGlzLnJlcXVlc3RBbmltYXRpb25JZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSggdGhpcy5hbmltYXRlLmJpbmQodGhpcykgKTtcclxuICAgICAgICAgICAgaWYoIXRoaXMucGxheWVyKCkucGF1c2VkKCkpe1xyXG4gICAgICAgICAgICAgICAgaWYodHlwZW9mKHRoaXMudGV4dHVyZSkgIT09IFwidW5kZWZpbmVkXCIgJiYgKCF0aGlzLmlzUGxheU9uTW9iaWxlICYmIHRoaXMucGxheWVyKCkucmVhZHlTdGF0ZSgpID49IEhBVkVfQ1VSUkVOVF9EQVRBIHx8IHRoaXMuaXNQbGF5T25Nb2JpbGUgJiYgdGhpcy5wbGF5ZXIoKS5oYXNDbGFzcyhcInZqcy1wbGF5aW5nXCIpKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBjdCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChjdCAtIHRoaXMudGltZSA+PSAzMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmUubmVlZHNVcGRhdGUgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnRpbWUgPSBjdDtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgaWYodGhpcy5pc1BsYXlPbk1vYmlsZSl7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBjdXJyZW50VGltZSA9IHRoaXMucGxheWVyKCkuY3VycmVudFRpbWUoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYoTW9iaWxlQnVmZmVyaW5nLmlzQnVmZmVyaW5nKGN1cnJlbnRUaW1lKSl7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZighdGhpcy5wbGF5ZXIoKS5oYXNDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2JpbGUtaW5saW5lLXZpZGVvLWJ1ZmZlcmluZ1wiKSl7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIoKS5hZGRDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2JpbGUtaW5saW5lLXZpZGVvLWJ1ZmZlcmluZ1wiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfWVsc2V7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZih0aGlzLnBsYXllcigpLmhhc0NsYXNzKFwidmpzLXBhbm9yYW1hLW1vYmlsZS1pbmxpbmUtdmlkZW8tYnVmZmVyaW5nXCIpKXtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllcigpLnJlbW92ZUNsYXNzKFwidmpzLXBhbm9yYW1hLW1vYmlsZS1pbmxpbmUtdmlkZW8tYnVmZmVyaW5nXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMucmVuZGVyKCk7XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgcmVuZGVyOiBmdW5jdGlvbigpe1xyXG4gICAgICAgICAgICBpZighdGhpcy5pc1VzZXJJbnRlcmFjdGluZyl7XHJcbiAgICAgICAgICAgICAgICB2YXIgc3ltYm9sTGF0ID0gKHRoaXMubGF0ID4gdGhpcy5zZXR0aW5ncy5pbml0TGF0KT8gIC0xIDogMTtcclxuICAgICAgICAgICAgICAgIHZhciBzeW1ib2xMb24gPSAodGhpcy5sb24gPiB0aGlzLnNldHRpbmdzLmluaXRMb24pPyAgLTEgOiAxO1xyXG4gICAgICAgICAgICAgICAgaWYodGhpcy5zZXR0aW5ncy5iYWNrVG9WZXJ0aWNhbENlbnRlcil7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXQgPSAoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubGF0ID4gKHRoaXMuc2V0dGluZ3MuaW5pdExhdCAtIE1hdGguYWJzKHRoaXMuc2V0dGluZ3MucmV0dXJuU3RlcExhdCkpICYmXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubGF0IDwgKHRoaXMuc2V0dGluZ3MuaW5pdExhdCArIE1hdGguYWJzKHRoaXMuc2V0dGluZ3MucmV0dXJuU3RlcExhdCkpXHJcbiAgICAgICAgICAgICAgICAgICAgKT8gdGhpcy5zZXR0aW5ncy5pbml0TGF0IDogdGhpcy5sYXQgKyB0aGlzLnNldHRpbmdzLnJldHVyblN0ZXBMYXQgKiBzeW1ib2xMYXQ7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZih0aGlzLnNldHRpbmdzLmJhY2tUb0hvcml6b25DZW50ZXIpe1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubG9uID0gKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxvbiA+ICh0aGlzLnNldHRpbmdzLmluaXRMb24gLSBNYXRoLmFicyh0aGlzLnNldHRpbmdzLnJldHVyblN0ZXBMb24pKSAmJlxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxvbiA8ICh0aGlzLnNldHRpbmdzLmluaXRMb24gKyBNYXRoLmFicyh0aGlzLnNldHRpbmdzLnJldHVyblN0ZXBMb24pKVxyXG4gICAgICAgICAgICAgICAgICAgICk/IHRoaXMuc2V0dGluZ3MuaW5pdExvbiA6IHRoaXMubG9uICsgdGhpcy5zZXR0aW5ncy5yZXR1cm5TdGVwTG9uICogc3ltYm9sTG9uO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMubGF0ID0gTWF0aC5tYXgoIHRoaXMuc2V0dGluZ3MubWluTGF0LCBNYXRoLm1pbiggdGhpcy5zZXR0aW5ncy5tYXhMYXQsIHRoaXMubGF0ICkgKTtcclxuICAgICAgICAgICAgdGhpcy5sb24gPSBNYXRoLm1heCggdGhpcy5zZXR0aW5ncy5taW5Mb24sIE1hdGgubWluKCB0aGlzLnNldHRpbmdzLm1heExvbiwgdGhpcy5sb24gKSApO1xyXG4gICAgICAgICAgICB0aGlzLnBoaSA9IFRIUkVFLk1hdGguZGVnVG9SYWQoIDkwIC0gdGhpcy5sYXQgKTtcclxuICAgICAgICAgICAgdGhpcy50aGV0YSA9IFRIUkVFLk1hdGguZGVnVG9SYWQoIHRoaXMubG9uICk7XHJcblxyXG4gICAgICAgICAgICBpZighdGhpcy5zdXBwb3J0VmlkZW9UZXh0dXJlKXtcclxuICAgICAgICAgICAgICAgIHRoaXMuaGVscGVyQ2FudmFzLnVwZGF0ZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuY2xlYXIoKTtcclxuICAgICAgICB9LFxyXG5cclxuICAgICAgICBwbGF5T25Nb2JpbGU6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgdGhpcy5pc1BsYXlPbk1vYmlsZSA9IHRydWU7XHJcbiAgICAgICAgICAgIGlmKHRoaXMuc2V0dGluZ3MuYXV0b01vYmlsZU9yaWVudGF0aW9uKVxyXG4gICAgICAgICAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2RldmljZW1vdGlvbicsIHRoaXMuaGFuZGxlTW9iaWxlT3JpZW50YXRpb24uYmluZCh0aGlzKSk7XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgZWw6IGZ1bmN0aW9uKCl7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmVsXztcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn07XHJcblxyXG5leHBvcnQgZGVmYXVsdCBCYXNlQ2FudmFzO1xyXG4iLCIvKipcbiAqIENyZWF0ZWQgYnkgeWFud3NoIG9uIDQvMy8xNi5cbiAqL1xuXG5pbXBvcnQgQmFzZUNhbnZhcyBmcm9tICcuL0Jhc2VDYW52YXMnO1xuaW1wb3J0IFV0aWwgZnJvbSAnLi9VdGlsJztcblxudmFyIENhbnZhcyA9IGZ1bmN0aW9uIChiYXNlQ29tcG9uZW50LCBUSFJFRSwgc2V0dGluZ3MgPSB7fSkge1xuICAgIHZhciBwYXJlbnQgPSBCYXNlQ2FudmFzKGJhc2VDb21wb25lbnQsIFRIUkVFLCBzZXR0aW5ncyk7XG5cbiAgICByZXR1cm4gVXRpbC5leHRlbmQocGFyZW50LCB7XG4gICAgICAgIGNvbnN0cnVjdG9yOiBmdW5jdGlvbiBpbml0KHBsYXllciwgb3B0aW9ucyl7XG4gICAgICAgICAgICBwYXJlbnQuY29uc3RydWN0b3IuY2FsbCh0aGlzLCBwbGF5ZXIsIG9wdGlvbnMpO1xuXG4gICAgICAgICAgICB0aGlzLlZSTW9kZSA9IGZhbHNlO1xuICAgICAgICAgICAgLy9kZWZpbmUgc2NlbmVcbiAgICAgICAgICAgIHRoaXMuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcbiAgICAgICAgICAgIC8vZGVmaW5lIGNhbWVyYVxuICAgICAgICAgICAgdGhpcy5jYW1lcmEgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEob3B0aW9ucy5pbml0Rm92LCB0aGlzLndpZHRoIC8gdGhpcy5oZWlnaHQsIDEsIDIwMDApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEudGFyZ2V0ID0gbmV3IFRIUkVFLlZlY3RvcjMoIDAsIDAsIDAgKTtcbiAgICAgICAgICAgIGlmICh0aGlzLnNldHRpbmdzLlZSRW5hYmxlICYmIHRoaXMuc2V0dGluZ3MuYXV0b01vYmlsZU9yaWVudGF0aW9uICYmIHRoaXMuY29udHJvbHMgPT09IHVuZGVmaW5lZCAmJiBUSFJFRS5EZXZpY2VPcmllbnRhdGlvbkNvbnRyb2xzICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNvbnRyb2xzID0gbmV3IFRIUkVFLkRldmljZU9yaWVudGF0aW9uQ29udHJvbHModGhpcy5jYW1lcmEpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL2RlZmluZSBnZW9tZXRyeVxuICAgICAgICAgICAgdmFyIGdlb21ldHJ5ID0gKHRoaXMudmlkZW9UeXBlID09PSBcImVxdWlyZWN0YW5ndWxhclwiKT8gbmV3IFRIUkVFLlNwaGVyZUdlb21ldHJ5KDUwMCwgNjAsIDQwKTogbmV3IFRIUkVFLlNwaGVyZUJ1ZmZlckdlb21ldHJ5KCA1MDAsIDYwLCA0MCApLnRvTm9uSW5kZXhlZCgpO1xuICAgICAgICAgICAgaWYodGhpcy52aWRlb1R5cGUgPT09IFwiZmlzaGV5ZVwiKXtcbiAgICAgICAgICAgICAgICBsZXQgbm9ybWFscyA9IGdlb21ldHJ5LmF0dHJpYnV0ZXMubm9ybWFsLmFycmF5O1xuICAgICAgICAgICAgICAgIGxldCB1dnMgPSBnZW9tZXRyeS5hdHRyaWJ1dGVzLnV2LmFycmF5O1xuICAgICAgICAgICAgICAgIGZvciAoIGxldCBpID0gMCwgbCA9IG5vcm1hbHMubGVuZ3RoIC8gMzsgaSA8IGw7IGkgKysgKSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCB4ID0gbm9ybWFsc1sgaSAqIDMgKyAwIF07XG4gICAgICAgICAgICAgICAgICAgIGxldCB5ID0gbm9ybWFsc1sgaSAqIDMgKyAxIF07XG4gICAgICAgICAgICAgICAgICAgIGxldCB6ID0gbm9ybWFsc1sgaSAqIDMgKyAyIF07XG5cbiAgICAgICAgICAgICAgICAgICAgbGV0IHIgPSBNYXRoLmFzaW4oTWF0aC5zcXJ0KHggKiB4ICsgeiAqIHopIC8gTWF0aC5zcXJ0KHggKiB4ICArIHkgKiB5ICsgeiAqIHopKSAvIE1hdGguUEk7XG4gICAgICAgICAgICAgICAgICAgIGlmKHkgPCAwKSByID0gMSAtIHI7XG4gICAgICAgICAgICAgICAgICAgIGxldCB0aGV0YSA9ICh4ID09IDAgJiYgeiA9PSAwKT8gMCA6IE1hdGguYWNvcyh4IC8gTWF0aC5zcXJ0KHggKiB4ICsgeiAqIHopKTtcbiAgICAgICAgICAgICAgICAgICAgaWYoeiA8IDApIHRoZXRhID0gdGhldGEgKiAtMTtcbiAgICAgICAgICAgICAgICAgICAgdXZzWyBpICogMiArIDAgXSA9IC0wLjggKiByICogTWF0aC5jb3ModGhldGEpICsgMC41O1xuICAgICAgICAgICAgICAgICAgICB1dnNbIGkgKiAyICsgMSBdID0gMC44ICogciAqIE1hdGguc2luKHRoZXRhKSArIDAuNTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZ2VvbWV0cnkucm90YXRlWCggb3B0aW9ucy5yb3RhdGVYKTtcbiAgICAgICAgICAgICAgICBnZW9tZXRyeS5yb3RhdGVZKCBvcHRpb25zLnJvdGF0ZVkpO1xuICAgICAgICAgICAgICAgIGdlb21ldHJ5LnJvdGF0ZVooIG9wdGlvbnMucm90YXRlWik7XG4gICAgICAgICAgICB9ZWxzZSBpZih0aGlzLnZpZGVvVHlwZSA9PT0gXCJkdWFsX2Zpc2hleWVcIil7XG4gICAgICAgICAgICAgICAgbGV0IG5vcm1hbHMgPSBnZW9tZXRyeS5hdHRyaWJ1dGVzLm5vcm1hbC5hcnJheTtcbiAgICAgICAgICAgICAgICBsZXQgdXZzID0gZ2VvbWV0cnkuYXR0cmlidXRlcy51di5hcnJheTtcbiAgICAgICAgICAgICAgICBsZXQgbCA9IG5vcm1hbHMubGVuZ3RoIC8gMztcbiAgICAgICAgICAgICAgICBmb3IgKCBsZXQgaSA9IDA7IGkgPCBsIC8gMjsgaSArKyApIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHggPSBub3JtYWxzWyBpICogMyArIDAgXTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHkgPSBub3JtYWxzWyBpICogMyArIDEgXTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHogPSBub3JtYWxzWyBpICogMyArIDIgXTtcblxuICAgICAgICAgICAgICAgICAgICBsZXQgciA9ICggeCA9PSAwICYmIHogPT0gMCApID8gMSA6ICggTWF0aC5hY29zKCB5ICkgLyBNYXRoLnNxcnQoIHggKiB4ICsgeiAqIHogKSApICogKCAyIC8gTWF0aC5QSSApO1xuICAgICAgICAgICAgICAgICAgICB1dnNbIGkgKiAyICsgMCBdID0geCAqIG9wdGlvbnMuZHVhbEZpc2guY2lyY2xlMS5yeCAqIHIgKiBvcHRpb25zLmR1YWxGaXNoLmNpcmNsZTEuY292ZXJYICArIG9wdGlvbnMuZHVhbEZpc2guY2lyY2xlMS54O1xuICAgICAgICAgICAgICAgICAgICB1dnNbIGkgKiAyICsgMSBdID0geiAqIG9wdGlvbnMuZHVhbEZpc2guY2lyY2xlMS5yeSAqIHIgKiBvcHRpb25zLmR1YWxGaXNoLmNpcmNsZTEuY292ZXJZICArIG9wdGlvbnMuZHVhbEZpc2guY2lyY2xlMS55O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmb3IgKCBsZXQgaSA9IGwgLyAyOyBpIDwgbDsgaSArKyApIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHggPSBub3JtYWxzWyBpICogMyArIDAgXTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHkgPSBub3JtYWxzWyBpICogMyArIDEgXTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHogPSBub3JtYWxzWyBpICogMyArIDIgXTtcblxuICAgICAgICAgICAgICAgICAgICBsZXQgciA9ICggeCA9PSAwICYmIHogPT0gMCApID8gMSA6ICggTWF0aC5hY29zKCAtIHkgKSAvIE1hdGguc3FydCggeCAqIHggKyB6ICogeiApICkgKiAoIDIgLyBNYXRoLlBJICk7XG4gICAgICAgICAgICAgICAgICAgIHV2c1sgaSAqIDIgKyAwIF0gPSAtIHggKiBvcHRpb25zLmR1YWxGaXNoLmNpcmNsZTIucnggKiByICogb3B0aW9ucy5kdWFsRmlzaC5jaXJjbGUyLmNvdmVyWCAgKyBvcHRpb25zLmR1YWxGaXNoLmNpcmNsZTIueDtcbiAgICAgICAgICAgICAgICAgICAgdXZzWyBpICogMiArIDEgXSA9IHogKiBvcHRpb25zLmR1YWxGaXNoLmNpcmNsZTIucnkgKiByICogb3B0aW9ucy5kdWFsRmlzaC5jaXJjbGUyLmNvdmVyWSAgKyBvcHRpb25zLmR1YWxGaXNoLmNpcmNsZTIueTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZ2VvbWV0cnkucm90YXRlWCggb3B0aW9ucy5yb3RhdGVYKTtcbiAgICAgICAgICAgICAgICBnZW9tZXRyeS5yb3RhdGVZKCBvcHRpb25zLnJvdGF0ZVkpO1xuICAgICAgICAgICAgICAgIGdlb21ldHJ5LnJvdGF0ZVooIG9wdGlvbnMucm90YXRlWik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBnZW9tZXRyeS5zY2FsZSggLSAxLCAxLCAxICk7XG4gICAgICAgICAgICAvL2RlZmluZSBtZXNoXG4gICAgICAgICAgICB0aGlzLm1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeSxcbiAgICAgICAgICAgICAgICBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBtYXA6IHRoaXMudGV4dHVyZX0pXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgLy90aGlzLm1lc2guc2NhbGUueCA9IC0xO1xuICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5tZXNoKTtcbiAgICAgICAgfSxcblxuICAgICAgICBlbmFibGVWUjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5WUk1vZGUgPSB0cnVlO1xuICAgICAgICAgICAgaWYodHlwZW9mIHZySE1EICE9PSAndW5kZWZpbmVkJyl7XG4gICAgICAgICAgICAgICAgdmFyIGV5ZVBhcmFtc0wgPSB2ckhNRC5nZXRFeWVQYXJhbWV0ZXJzKCAnbGVmdCcgKTtcbiAgICAgICAgICAgICAgICB2YXIgZXllUGFyYW1zUiA9IHZySE1ELmdldEV5ZVBhcmFtZXRlcnMoICdyaWdodCcgKTtcblxuICAgICAgICAgICAgICAgIHRoaXMuZXllRk9WTCA9IGV5ZVBhcmFtc0wucmVjb21tZW5kZWRGaWVsZE9mVmlldztcbiAgICAgICAgICAgICAgICB0aGlzLmV5ZUZPVlIgPSBleWVQYXJhbXNSLnJlY29tbWVuZGVkRmllbGRPZlZpZXc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTCA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYSh0aGlzLmNhbWVyYS5mb3YsIHRoaXMud2lkdGggLzIgLyB0aGlzLmhlaWdodCwgMSwgMjAwMCk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYVIgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEodGhpcy5jYW1lcmEuZm92LCB0aGlzLndpZHRoIC8yIC8gdGhpcy5oZWlnaHQsIDEsIDIwMDApO1xuICAgICAgICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuVlJFbmFibGUgJiYgdGhpcy5zZXR0aW5ncy5hdXRvTW9iaWxlT3JpZW50YXRpb24gJiYgdGhpcy5jb250cm9sc0wgPT09IHVuZGVmaW5lZCAmJiBUSFJFRS5EZXZpY2VPcmllbnRhdGlvbkNvbnRyb2xzICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNvbnRyb2xzTCA9IG5ldyBUSFJFRS5EZXZpY2VPcmllbnRhdGlvbkNvbnRyb2xzKHRoaXMuY2FtZXJhTCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jb250cm9sc1IgPSBuZXcgVEhSRUUuRGV2aWNlT3JpZW50YXRpb25Db250cm9scyh0aGlzLmNhbWVyYVIpO1xuICAgICAgICAgICAgICAgIHZhciBsb25MID0gVEhSRUUuTWF0aC5kZWdUb1JhZCggMCArIHRoaXMuc2V0dGluZ3MuVlJHYXBEZWdyZWUgKTtcbiAgICAgICAgICAgICAgICB2YXIgbG9uUiA9IFRIUkVFLk1hdGguZGVnVG9SYWQoIDAgLSB0aGlzLnNldHRpbmdzLlZSR2FwRGVncmVlICk7XG4gICAgICAgICAgICAgICAgdGhpcy5jb250cm9sc0wudXBkYXRlQWxwaGFPZmZzZXRBbmdsZShsb25MKTtcbiAgICAgICAgICAgICAgICB0aGlzLmNvbnRyb2xzUi51cGRhdGVBbHBoYU9mZnNldEFuZ2xlKGxvblIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGRpc2FibGVWUjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5WUk1vZGUgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0Vmlld3BvcnQoIDAsIDAsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0ICk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNjaXNzb3IoIDAsIDAsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0ICk7XG5cbiAgICAgICAgICAgIGlmKHRoaXMuY29udHJvbHNMKSB0aGlzLmNvbnRyb2xzTCA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGlmKHRoaXMuY29udHJvbHNSKSB0aGlzLmNvbnRyb2xzUiA9IHVuZGVmaW5lZDtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVSZXNpemU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHBhcmVudC5oYW5kbGVSZXNpemUuY2FsbCh0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmFzcGVjdCA9IHRoaXMud2lkdGggLyB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgICAgIGlmKHRoaXMuVlJNb2RlKXtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwuYXNwZWN0ID0gdGhpcy5jYW1lcmEuYXNwZWN0IC8gMjtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYVIuYXNwZWN0ID0gdGhpcy5jYW1lcmEuYXNwZWN0IC8gMjtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhUi51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VXaGVlbDogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgcGFyZW50LmhhbmRsZU1vdXNlV2hlZWwoZXZlbnQpO1xuICAgICAgICAgICAgLy8gV2ViS2l0XG4gICAgICAgICAgICBpZiAoIGV2ZW50LndoZWVsRGVsdGFZICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiAtPSBldmVudC53aGVlbERlbHRhWSAqIDAuMDU7XG4gICAgICAgICAgICAgICAgLy8gT3BlcmEgLyBFeHBsb3JlciA5XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBldmVudC53aGVlbERlbHRhICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiAtPSBldmVudC53aGVlbERlbHRhICogMC4wNTtcbiAgICAgICAgICAgICAgICAvLyBGaXJlZm94XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBldmVudC5kZXRhaWwgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92ICs9IGV2ZW50LmRldGFpbCAqIDEuMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiA9IE1hdGgubWluKHRoaXMuc2V0dGluZ3MubWF4Rm92LCB0aGlzLmNhbWVyYS5mb3YpO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92ID0gTWF0aC5tYXgodGhpcy5zZXR0aW5ncy5taW5Gb3YsIHRoaXMuY2FtZXJhLmZvdik7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICBpZih0aGlzLlZSTW9kZSl7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmZvdiA9IHRoaXMuY2FtZXJhLmZvdjtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYVIuZm92ID0gdGhpcy5jYW1lcmEuZm92O1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVUb3VjaE1vdmU6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgcGFyZW50LmhhbmRsZVRvdWNoTW92ZS5jYWxsKHRoaXMsIGV2ZW50KTtcbiAgICAgICAgICAgIGlmKHRoaXMuaXNVc2VyUGluY2gpe1xuICAgICAgICAgICAgICAgIGxldCBjdXJyZW50RGlzdGFuY2UgPSBVdGlsLmdldFRvdWNoZXNEaXN0YW5jZShldmVudC50b3VjaGVzKTtcbiAgICAgICAgICAgICAgICBldmVudC53aGVlbERlbHRhWSA9ICAoY3VycmVudERpc3RhbmNlIC0gdGhpcy5tdWx0aVRvdWNoRGlzdGFuY2UpICogMjtcbiAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZU1vdXNlV2hlZWwuY2FsbCh0aGlzLCBldmVudCk7XG4gICAgICAgICAgICAgICAgdGhpcy5tdWx0aVRvdWNoRGlzdGFuY2UgPSBjdXJyZW50RGlzdGFuY2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgcmVuZGVyOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgcGFyZW50LnJlbmRlci5jYWxsKHRoaXMpO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5jb250cm9scykge1xuICAgICAgICAgICAgICAgIHRoaXMuY29udHJvbHMudXBkYXRlKCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhLnRhcmdldC54ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLmNvcyggdGhpcy50aGV0YSApO1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhLnRhcmdldC55ID0gNTAwICogTWF0aC5jb3MoIHRoaXMucGhpICk7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmEudGFyZ2V0LnogPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguc2luKCB0aGlzLnRoZXRhICk7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmEubG9va0F0KCB0aGlzLmNhbWVyYS50YXJnZXQgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYoIXRoaXMuVlJNb2RlKXtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbmRlciggdGhpcy5zY2VuZSwgdGhpcy5jYW1lcmEgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2V7XG4gICAgICAgICAgICAgICAgdmFyIHZpZXdQb3J0V2lkdGggPSB0aGlzLndpZHRoIC8gMiwgdmlld1BvcnRIZWlnaHQgPSB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgICAgICBpZih0eXBlb2YgdnJITUQgIT09ICd1bmRlZmluZWQnKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLnByb2plY3Rpb25NYXRyaXggPSBVdGlsLmZvdlRvUHJvamVjdGlvbiggdGhpcy5leWVGT1ZMLCB0cnVlLCB0aGlzLmNhbWVyYS5uZWFyLCB0aGlzLmNhbWVyYS5mYXIgKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnByb2plY3Rpb25NYXRyaXggPSBVdGlsLmZvdlRvUHJvamVjdGlvbiggdGhpcy5leWVGT1ZSLCB0cnVlLCB0aGlzLmNhbWVyYS5uZWFyLCB0aGlzLmNhbWVyYS5mYXIgKTtcbiAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGxvbkwgPSB0aGlzLmxvbiArIHRoaXMuc2V0dGluZ3MuVlJHYXBEZWdyZWU7XG4gICAgICAgICAgICAgICAgICAgIHZhciBsb25SID0gdGhpcy5sb24gLSB0aGlzLnNldHRpbmdzLlZSR2FwRGVncmVlO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciB0aGV0YUwgPSBUSFJFRS5NYXRoLmRlZ1RvUmFkKCBsb25MICk7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0aGV0YVIgPSBUSFJFRS5NYXRoLmRlZ1RvUmFkKCBsb25SICk7XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIHRhcmdldEwgPSBVdGlsLmRlZXBDb3B5KHRoaXMuY2FtZXJhLnRhcmdldCk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldEwueCA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5jb3MoIHRoZXRhTCApO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRMLnogPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguc2luKCB0aGV0YUwgKTtcbiAgICAgICAgICAgICAgICAgICAgaWYodGhpcy5jb250cm9sc0wpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29udHJvbHNMLnVwZGF0ZSgpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmxvb2tBdCh0YXJnZXRMKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHZhciB0YXJnZXRSID0gVXRpbC5kZWVwQ29weSh0aGlzLmNhbWVyYS50YXJnZXQpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRSLnggPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguY29zKCB0aGV0YVIgKTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Ui56ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLnNpbiggdGhldGFSICk7XG4gICAgICAgICAgICAgICAgICAgIGlmKHRoaXMuY29udHJvbHNSKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbnRyb2xzUi51cGRhdGUoKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhUi5sb29rQXQodGFyZ2V0Uik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gcmVuZGVyIGxlZnQgZXllXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRWaWV3cG9ydCggMCwgMCwgdmlld1BvcnRXaWR0aCwgdmlld1BvcnRIZWlnaHQgKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNjaXNzb3IoIDAsIDAsIHZpZXdQb3J0V2lkdGgsIHZpZXdQb3J0SGVpZ2h0ICk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIoIHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhTCApO1xuXG4gICAgICAgICAgICAgICAgLy8gcmVuZGVyIHJpZ2h0IGV5ZVxuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0Vmlld3BvcnQoIHZpZXdQb3J0V2lkdGgsIDAsIHZpZXdQb3J0V2lkdGgsIHZpZXdQb3J0SGVpZ2h0ICk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTY2lzc29yKCB2aWV3UG9ydFdpZHRoLCAwLCB2aWV3UG9ydFdpZHRoLCB2aWV3UG9ydEhlaWdodCApO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKCB0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYVIgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgQ2FudmFzO1xuIiwiLyoqXHJcbiAqIEBhdXRob3IgYWx0ZXJlZHEgLyBodHRwOi8vYWx0ZXJlZHF1YWxpYS5jb20vXHJcbiAqIEBhdXRob3IgbXIuZG9vYiAvIGh0dHA6Ly9tcmRvb2IuY29tL1xyXG4gKi9cclxuXHJcbnZhciBEZXRlY3RvciA9IHtcclxuXHJcbiAgICBjYW52YXM6ICEhIHdpbmRvdy5DYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsXHJcbiAgICB3ZWJnbDogKCBmdW5jdGlvbiAoKSB7XHJcblxyXG4gICAgICAgIHRyeSB7XHJcblxyXG4gICAgICAgICAgICB2YXIgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCggJ2NhbnZhcycgKTsgcmV0dXJuICEhICggd2luZG93LldlYkdMUmVuZGVyaW5nQ29udGV4dCAmJiAoIGNhbnZhcy5nZXRDb250ZXh0KCAnd2ViZ2wnICkgfHwgY2FudmFzLmdldENvbnRleHQoICdleHBlcmltZW50YWwtd2ViZ2wnICkgKSApO1xyXG5cclxuICAgICAgICB9IGNhdGNoICggZSApIHtcclxuXHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgfVxyXG5cclxuICAgIH0gKSgpLFxyXG4gICAgd29ya2VyczogISEgd2luZG93LldvcmtlcixcclxuICAgIGZpbGVhcGk6IHdpbmRvdy5GaWxlICYmIHdpbmRvdy5GaWxlUmVhZGVyICYmIHdpbmRvdy5GaWxlTGlzdCAmJiB3aW5kb3cuQmxvYixcclxuXHJcbiAgICAgQ2hlY2tfVmVyc2lvbjogZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgIHZhciBydiA9IC0xOyAvLyBSZXR1cm4gdmFsdWUgYXNzdW1lcyBmYWlsdXJlLlxyXG5cclxuICAgICAgICAgaWYgKG5hdmlnYXRvci5hcHBOYW1lID09ICdNaWNyb3NvZnQgSW50ZXJuZXQgRXhwbG9yZXInKSB7XHJcblxyXG4gICAgICAgICAgICAgdmFyIHVhID0gbmF2aWdhdG9yLnVzZXJBZ2VudCxcclxuICAgICAgICAgICAgICAgICByZSA9IG5ldyBSZWdFeHAoXCJNU0lFIChbMC05XXsxLH1bXFxcXC4wLTldezAsfSlcIik7XHJcblxyXG4gICAgICAgICAgICAgaWYgKHJlLmV4ZWModWEpICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgcnYgPSBwYXJzZUZsb2F0KFJlZ0V4cC4kMSk7XHJcbiAgICAgICAgICAgICB9XHJcbiAgICAgICAgIH1cclxuICAgICAgICAgZWxzZSBpZiAobmF2aWdhdG9yLmFwcE5hbWUgPT0gXCJOZXRzY2FwZVwiKSB7XHJcbiAgICAgICAgICAgICAvLy8gaW4gSUUgMTEgdGhlIG5hdmlnYXRvci5hcHBWZXJzaW9uIHNheXMgJ3RyaWRlbnQnXHJcbiAgICAgICAgICAgICAvLy8gaW4gRWRnZSB0aGUgbmF2aWdhdG9yLmFwcFZlcnNpb24gZG9lcyBub3Qgc2F5IHRyaWRlbnRcclxuICAgICAgICAgICAgIGlmIChuYXZpZ2F0b3IuYXBwVmVyc2lvbi5pbmRleE9mKCdUcmlkZW50JykgIT09IC0xKSBydiA9IDExO1xyXG4gICAgICAgICAgICAgZWxzZXtcclxuICAgICAgICAgICAgICAgICB2YXIgdWEgPSBuYXZpZ2F0b3IudXNlckFnZW50O1xyXG4gICAgICAgICAgICAgICAgIHZhciByZSA9IG5ldyBSZWdFeHAoXCJFZGdlXFwvKFswLTldezEsfVtcXFxcLjAtOV17MCx9KVwiKTtcclxuICAgICAgICAgICAgICAgICBpZiAocmUuZXhlYyh1YSkgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICAgcnYgPSBwYXJzZUZsb2F0KFJlZ0V4cC4kMSk7XHJcbiAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgfVxyXG4gICAgICAgICB9XHJcblxyXG4gICAgICAgICByZXR1cm4gcnY7XHJcbiAgICAgfSxcclxuXHJcbiAgICBzdXBwb3J0VmlkZW9UZXh0dXJlOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgLy9pZSAxMSBhbmQgZWRnZSAxMiBkb2Vzbid0IHN1cHBvcnQgdmlkZW8gdGV4dHVyZS5cclxuICAgICAgICB2YXIgdmVyc2lvbiA9IHRoaXMuQ2hlY2tfVmVyc2lvbigpO1xyXG4gICAgICAgIHJldHVybiAodmVyc2lvbiA9PT0gLTEgfHwgdmVyc2lvbiA+PSAxMyk7XHJcbiAgICB9LFxyXG5cclxuICAgIGlzTGl2ZVN0cmVhbU9uU2FmYXJpOiBmdW5jdGlvbiAodmlkZW9FbGVtZW50KSB7XHJcbiAgICAgICAgLy9saXZlIHN0cmVhbSBvbiBzYWZhcmkgZG9lc24ndCBzdXBwb3J0IHZpZGVvIHRleHR1cmVcclxuICAgICAgICB2YXIgdmlkZW9Tb3VyY2VzID0gdmlkZW9FbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoXCJzb3VyY2VcIik7XHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IGZhbHNlO1xyXG4gICAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCB2aWRlb1NvdXJjZXMubGVuZ3RoOyBpKyspe1xyXG4gICAgICAgICAgICB2YXIgY3VycmVudFZpZGVvU291cmNlID0gdmlkZW9Tb3VyY2VzW2ldO1xyXG4gICAgICAgICAgICBpZigoY3VycmVudFZpZGVvU291cmNlLnR5cGUgPT0gXCJhcHBsaWNhdGlvbi94LW1wZWdVUkxcIiB8fCBjdXJyZW50VmlkZW9Tb3VyY2UudHlwZSA9PSBcImFwcGxpY2F0aW9uL3ZuZC5hcHBsZS5tcGVndXJsXCIpICYmIC8oU2FmYXJpfEFwcGxlV2ViS2l0KS8udGVzdChuYXZpZ2F0b3IudXNlckFnZW50KSAmJiAvQXBwbGUgQ29tcHV0ZXIvLnRlc3QobmF2aWdhdG9yLnZlbmRvcikpe1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH0sXHJcblxyXG4gICAgZ2V0V2ViR0xFcnJvck1lc3NhZ2U6IGZ1bmN0aW9uICgpIHtcclxuXHJcbiAgICAgICAgdmFyIGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCAnZGl2JyApO1xyXG4gICAgICAgIGVsZW1lbnQuaWQgPSAnd2ViZ2wtZXJyb3ItbWVzc2FnZSc7XHJcblxyXG4gICAgICAgIGlmICggISB0aGlzLndlYmdsICkge1xyXG5cclxuICAgICAgICAgICAgZWxlbWVudC5pbm5lckhUTUwgPSB3aW5kb3cuV2ViR0xSZW5kZXJpbmdDb250ZXh0ID8gW1xyXG4gICAgICAgICAgICAgICAgJ1lvdXIgZ3JhcGhpY3MgY2FyZCBkb2VzIG5vdCBzZWVtIHRvIHN1cHBvcnQgPGEgaHJlZj1cImh0dHA6Ly9raHJvbm9zLm9yZy93ZWJnbC93aWtpL0dldHRpbmdfYV9XZWJHTF9JbXBsZW1lbnRhdGlvblwiIHN0eWxlPVwiY29sb3I6IzAwMFwiPldlYkdMPC9hPi48YnIgLz4nLFxyXG4gICAgICAgICAgICAgICAgJ0ZpbmQgb3V0IGhvdyB0byBnZXQgaXQgPGEgaHJlZj1cImh0dHA6Ly9nZXQud2ViZ2wub3JnL1wiIHN0eWxlPVwiY29sb3I6IzAwMFwiPmhlcmU8L2E+LidcclxuICAgICAgICAgICAgXS5qb2luKCAnXFxuJyApIDogW1xyXG4gICAgICAgICAgICAgICAgJ1lvdXIgYnJvd3NlciBkb2VzIG5vdCBzZWVtIHRvIHN1cHBvcnQgPGEgaHJlZj1cImh0dHA6Ly9raHJvbm9zLm9yZy93ZWJnbC93aWtpL0dldHRpbmdfYV9XZWJHTF9JbXBsZW1lbnRhdGlvblwiIHN0eWxlPVwiY29sb3I6IzAwMFwiPldlYkdMPC9hPi48YnIvPicsXHJcbiAgICAgICAgICAgICAgICAnRmluZCBvdXQgaG93IHRvIGdldCBpdCA8YSBocmVmPVwiaHR0cDovL2dldC53ZWJnbC5vcmcvXCIgc3R5bGU9XCJjb2xvcjojMDAwXCI+aGVyZTwvYT4uJ1xyXG4gICAgICAgICAgICBdLmpvaW4oICdcXG4nICk7XHJcblxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQ7XHJcblxyXG4gICAgfSxcclxuXHJcbiAgICBhZGRHZXRXZWJHTE1lc3NhZ2U6IGZ1bmN0aW9uICggcGFyYW1ldGVycyApIHtcclxuXHJcbiAgICAgICAgdmFyIHBhcmVudCwgaWQsIGVsZW1lbnQ7XHJcblxyXG4gICAgICAgIHBhcmFtZXRlcnMgPSBwYXJhbWV0ZXJzIHx8IHt9O1xyXG5cclxuICAgICAgICBwYXJlbnQgPSBwYXJhbWV0ZXJzLnBhcmVudCAhPT0gdW5kZWZpbmVkID8gcGFyYW1ldGVycy5wYXJlbnQgOiBkb2N1bWVudC5ib2R5O1xyXG4gICAgICAgIGlkID0gcGFyYW1ldGVycy5pZCAhPT0gdW5kZWZpbmVkID8gcGFyYW1ldGVycy5pZCA6ICdvbGRpZSc7XHJcblxyXG4gICAgICAgIGVsZW1lbnQgPSBEZXRlY3Rvci5nZXRXZWJHTEVycm9yTWVzc2FnZSgpO1xyXG4gICAgICAgIGVsZW1lbnQuaWQgPSBpZDtcclxuXHJcbiAgICAgICAgcGFyZW50LmFwcGVuZENoaWxkKCBlbGVtZW50ICk7XHJcblxyXG4gICAgfVxyXG5cclxufTtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IERldGVjdG9yOyIsIi8qKlxyXG4gKiBDcmVhdGVkIGJ5IHdlbnNoZW5nLnlhbiBvbiA1LzIzLzE2LlxyXG4gKi9cclxudmFyIGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcclxuZWxlbWVudC5jbGFzc05hbWUgPSBcInZqcy12aWRlby1oZWxwZXItY2FudmFzXCI7XHJcblxyXG52YXIgSGVscGVyQ2FudmFzID0gZnVuY3Rpb24oYmFzZUNvbXBvbmVudCl7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIGNvbnN0cnVjdG9yOiBmdW5jdGlvbiBpbml0KHBsYXllciwgb3B0aW9ucyl7XHJcbiAgICAgICAgICAgIHRoaXMudmlkZW9FbGVtZW50ID0gb3B0aW9ucy52aWRlbztcclxuICAgICAgICAgICAgdGhpcy53aWR0aCA9IG9wdGlvbnMud2lkdGg7XHJcbiAgICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gb3B0aW9ucy5oZWlnaHQ7XHJcblxyXG4gICAgICAgICAgICBlbGVtZW50LndpZHRoID0gdGhpcy53aWR0aDtcclxuICAgICAgICAgICAgZWxlbWVudC5oZWlnaHQgPSB0aGlzLmhlaWdodDtcclxuICAgICAgICAgICAgZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XHJcbiAgICAgICAgICAgIG9wdGlvbnMuZWwgPSBlbGVtZW50O1xyXG5cclxuXHJcbiAgICAgICAgICAgIHRoaXMuY29udGV4dCA9IGVsZW1lbnQuZ2V0Q29udGV4dCgnMmQnKTtcclxuICAgICAgICAgICAgdGhpcy5jb250ZXh0LmRyYXdJbWFnZSh0aGlzLnZpZGVvRWxlbWVudCwgMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgICAgICBiYXNlQ29tcG9uZW50LmNhbGwodGhpcywgcGxheWVyLCBvcHRpb25zKTtcclxuICAgICAgICB9LFxyXG4gICAgICAgIFxyXG4gICAgICAgIGdldENvbnRleHQ6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgIHJldHVybiB0aGlzLmNvbnRleHQ7ICBcclxuICAgICAgICB9LFxyXG4gICAgICAgIFxyXG4gICAgICAgIHVwZGF0ZTogZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICB0aGlzLmNvbnRleHQuZHJhd0ltYWdlKHRoaXMudmlkZW9FbGVtZW50LCAwLCAwLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgZWw6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59O1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgSGVscGVyQ2FudmFzOyIsIi8qKlxyXG4gKiBDcmVhdGVkIGJ5IHlhbndzaCBvbiA2LzYvMTYuXHJcbiAqL1xyXG52YXIgTW9iaWxlQnVmZmVyaW5nID0ge1xyXG4gICAgcHJldl9jdXJyZW50VGltZTogMCxcclxuICAgIGNvdW50ZXI6IDAsXHJcbiAgICBcclxuICAgIGlzQnVmZmVyaW5nOiBmdW5jdGlvbiAoY3VycmVudFRpbWUpIHtcclxuICAgICAgICBpZiAoY3VycmVudFRpbWUgPT0gdGhpcy5wcmV2X2N1cnJlbnRUaW1lKSB0aGlzLmNvdW50ZXIrKztcclxuICAgICAgICBlbHNlIHRoaXMuY291bnRlciA9IDA7XHJcbiAgICAgICAgdGhpcy5wcmV2X2N1cnJlbnRUaW1lID0gY3VycmVudFRpbWU7XHJcbiAgICAgICAgaWYodGhpcy5jb3VudGVyID4gMTApe1xyXG4gICAgICAgICAgICAvL25vdCBsZXQgY291bnRlciBvdmVyZmxvd1xyXG4gICAgICAgICAgICB0aGlzLmNvdW50ZXIgPSAxMDtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxufTtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IE1vYmlsZUJ1ZmZlcmluZzsiLCIvKipcclxuICogQ3JlYXRlZCBieSB5YW53c2ggb24gNC80LzE2LlxyXG4gKi9cclxuXHJcbnZhciBOb3RpY2UgPSBmdW5jdGlvbihiYXNlQ29tcG9uZW50KXtcclxuICAgIHZhciBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICBlbGVtZW50LmNsYXNzTmFtZSA9IFwidmpzLXZpZGVvLW5vdGljZS1sYWJlbFwiO1xyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcclxuICAgICAgICAgICAgaWYodHlwZW9mIG9wdGlvbnMuTm90aWNlTWVzc2FnZSA9PSBcIm9iamVjdFwiKXtcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQgPSBvcHRpb25zLk5vdGljZU1lc3NhZ2U7XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLmVsID0gb3B0aW9ucy5Ob3RpY2VNZXNzYWdlO1xyXG4gICAgICAgICAgICB9ZWxzZSBpZih0eXBlb2Ygb3B0aW9ucy5Ob3RpY2VNZXNzYWdlID09IFwic3RyaW5nXCIpe1xyXG4gICAgICAgICAgICAgICAgZWxlbWVudC5pbm5lckhUTUwgPSBvcHRpb25zLk5vdGljZU1lc3NhZ2U7XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLmVsID0gZWxlbWVudDtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgYmFzZUNvbXBvbmVudC5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgZWw6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59O1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgTm90aWNlOyIsIi8qKlxyXG4gKlxyXG4gKiAoYykgV2Vuc2hlbmcgWWFuIDx5YW53c2hAZ21haWwuY29tPlxyXG4gKiBEYXRlOiAxMC8yMS8xNlxyXG4gKlxyXG4gKiBGb3IgdGhlIGZ1bGwgY29weXJpZ2h0IGFuZCBsaWNlbnNlIGluZm9ybWF0aW9uLCBwbGVhc2UgdmlldyB0aGUgTElDRU5TRVxyXG4gKiBmaWxlIHRoYXQgd2FzIGRpc3RyaWJ1dGVkIHdpdGggdGhpcyBzb3VyY2UgY29kZS5cclxuICovXHJcbid1c2Ugc3RyaWN0JztcclxuXHJcbmltcG9ydCBCYXNlQ2FudmFzIGZyb20gJy4vQmFzZUNhbnZhcyc7XHJcbmltcG9ydCBVdGlsIGZyb20gJy4vVXRpbCc7XHJcblxyXG52YXIgVGhyZWVEQ2FudmFzID0gZnVuY3Rpb24gKGJhc2VDb21wb25lbnQsIFRIUkVFLCBzZXR0aW5ncyA9IHt9KXtcclxuICAgIHZhciBwYXJlbnQgPSBCYXNlQ2FudmFzKGJhc2VDb21wb25lbnQsIFRIUkVFLCBzZXR0aW5ncyk7XHJcbiAgICByZXR1cm4gVXRpbC5leHRlbmQocGFyZW50LCB7XHJcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcclxuICAgICAgICAgICAgcGFyZW50LmNvbnN0cnVjdG9yLmNhbGwodGhpcywgcGxheWVyLCBvcHRpb25zKTtcclxuICAgICAgICAgICAgLy9vbmx5IHNob3cgbGVmdCBwYXJ0IGJ5IGRlZmF1bHRcclxuICAgICAgICAgICAgdGhpcy5WUk1vZGUgPSBmYWxzZTtcclxuICAgICAgICAgICAgLy9kZWZpbmUgc2NlbmVcclxuICAgICAgICAgICAgdGhpcy5zY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xyXG5cclxuICAgICAgICAgICAgdmFyIGFzcGVjdFJhdGlvID0gdGhpcy53aWR0aCAvIHRoaXMuaGVpZ2h0O1xyXG4gICAgICAgICAgICAvL2RlZmluZSBjYW1lcmFcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmFMID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKG9wdGlvbnMuaW5pdEZvdiwgYXNwZWN0UmF0aW8sIDEsIDIwMDApO1xyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwudGFyZ2V0ID0gbmV3IFRIUkVFLlZlY3RvcjMoIDAsIDAsIDAgKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUiA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYShvcHRpb25zLmluaXRGb3YsIGFzcGVjdFJhdGlvIC8gMiwgMSwgMjAwMCk7XHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUi5wb3NpdGlvbi5zZXQoIDEwMDAsIDAsIDAgKTtcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnRhcmdldCA9IG5ldyBUSFJFRS5WZWN0b3IzKCAxMDAwLCAwLCAwICk7XHJcblxyXG4gICAgICAgICAgICB2YXIgZ2VvbWV0cnlMID0gbmV3IFRIUkVFLlNwaGVyZUJ1ZmZlckdlb21ldHJ5KDUwMCwgNjAsIDQwKS50b05vbkluZGV4ZWQoKTtcclxuICAgICAgICAgICAgdmFyIGdlb21ldHJ5UiA9IG5ldyBUSFJFRS5TcGhlcmVCdWZmZXJHZW9tZXRyeSg1MDAsIDYwLCA0MCkudG9Ob25JbmRleGVkKCk7XHJcblxyXG4gICAgICAgICAgICB2YXIgdXZzTCA9IGdlb21ldHJ5TC5hdHRyaWJ1dGVzLnV2LmFycmF5O1xyXG4gICAgICAgICAgICB2YXIgbm9ybWFsc0wgPSBnZW9tZXRyeUwuYXR0cmlidXRlcy5ub3JtYWwuYXJyYXk7XHJcbiAgICAgICAgICAgIGZvciAoIHZhciBpID0gMDsgaSA8IG5vcm1hbHNMLmxlbmd0aCAvIDM7IGkgKysgKSB7XHJcbiAgICAgICAgICAgICAgICB1dnNMWyBpICogMiArIDEgXSA9IHV2c0xbIGkgKiAyICsgMSBdIC8gMjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdmFyIHV2c1IgPSBnZW9tZXRyeVIuYXR0cmlidXRlcy51di5hcnJheTtcclxuICAgICAgICAgICAgdmFyIG5vcm1hbHNSID0gZ2VvbWV0cnlSLmF0dHJpYnV0ZXMubm9ybWFsLmFycmF5O1xyXG4gICAgICAgICAgICBmb3IgKCB2YXIgaSA9IDA7IGkgPCBub3JtYWxzUi5sZW5ndGggLyAzOyBpICsrICkge1xyXG4gICAgICAgICAgICAgICAgdXZzUlsgaSAqIDIgKyAxIF0gPSB1dnNSWyBpICogMiArIDEgXSAvIDIgKyAwLjU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGdlb21ldHJ5TC5zY2FsZSggLSAxLCAxLCAxICk7XHJcbiAgICAgICAgICAgIGdlb21ldHJ5Ui5zY2FsZSggLSAxLCAxLCAxICk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLm1lc2hMID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnlMLFxyXG4gICAgICAgICAgICAgICAgbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHsgbWFwOiB0aGlzLnRleHR1cmV9KVxyXG4gICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5tZXNoUiA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5UixcclxuICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7IG1hcDogdGhpcy50ZXh0dXJlfSlcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgdGhpcy5tZXNoUi5wb3NpdGlvbi5zZXQoMTAwMCwgMCwgMCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLm1lc2hMKTtcclxuXHJcbiAgICAgICAgICAgIGlmKG9wdGlvbnMuY2FsbGJhY2spIG9wdGlvbnMuY2FsbGJhY2soKTtcclxuICAgICAgICB9LFxyXG5cclxuICAgICAgICBoYW5kbGVSZXNpemU6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgcGFyZW50LmhhbmRsZVJlc2l6ZS5jYWxsKHRoaXMpO1xyXG4gICAgICAgICAgICB2YXIgYXNwZWN0UmF0aW8gPSB0aGlzLndpZHRoIC8gdGhpcy5oZWlnaHQ7XHJcbiAgICAgICAgICAgIGlmKCF0aGlzLlZSTW9kZSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmFzcGVjdCA9IGFzcGVjdFJhdGlvO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcclxuICAgICAgICAgICAgfWVsc2V7XHJcbiAgICAgICAgICAgICAgICBhc3BlY3RSYXRpbyAvPSAyO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmFzcGVjdCA9IGFzcGVjdFJhdGlvO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLmFzcGVjdCA9IGFzcGVjdFJhdGlvO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhUi51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG5cclxuICAgICAgICBoYW5kbGVNb3VzZVdoZWVsOiBmdW5jdGlvbihldmVudCl7XHJcbiAgICAgICAgICAgIHBhcmVudC5oYW5kbGVNb3VzZVdoZWVsKGV2ZW50KTtcclxuICAgICAgICAgICAgLy8gV2ViS2l0XHJcbiAgICAgICAgICAgIGlmICggZXZlbnQud2hlZWxEZWx0YVkgKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwuZm92IC09IGV2ZW50LndoZWVsRGVsdGFZICogMC4wNTtcclxuICAgICAgICAgICAgICAgIC8vIE9wZXJhIC8gRXhwbG9yZXIgOVxyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBldmVudC53aGVlbERlbHRhICkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmZvdiAtPSBldmVudC53aGVlbERlbHRhICogMC4wNTtcclxuICAgICAgICAgICAgICAgIC8vIEZpcmVmb3hcclxuICAgICAgICAgICAgfSBlbHNlIGlmICggZXZlbnQuZGV0YWlsICkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmZvdiArPSBldmVudC5kZXRhaWwgKiAxLjA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmZvdiA9IE1hdGgubWluKHRoaXMuc2V0dGluZ3MubWF4Rm92LCB0aGlzLmNhbWVyYUwuZm92KTtcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmZvdiA9IE1hdGgubWF4KHRoaXMuc2V0dGluZ3MubWluRm92LCB0aGlzLmNhbWVyYUwuZm92KTtcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmFMLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcclxuICAgICAgICAgICAgaWYodGhpcy5WUk1vZGUpe1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLmZvdiA9IHRoaXMuY2FtZXJhTC5mb3Y7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYVIudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgZW5hYmxlVlI6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICB0aGlzLlZSTW9kZSA9IHRydWU7XHJcbiAgICAgICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMubWVzaFIpO1xyXG4gICAgICAgICAgICB0aGlzLmhhbmRsZVJlc2l6ZSgpO1xyXG4gICAgICAgIH0sXHJcblxyXG4gICAgICAgIGRpc2FibGVWUjogZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIHRoaXMuVlJNb2RlID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHRoaXMuc2NlbmUucmVtb3ZlKHRoaXMubWVzaFIpO1xyXG4gICAgICAgICAgICB0aGlzLmhhbmRsZVJlc2l6ZSgpO1xyXG4gICAgICAgIH0sXHJcblxyXG4gICAgICAgIHJlbmRlcjogZnVuY3Rpb24oKXtcclxuICAgICAgICAgICAgcGFyZW50LnJlbmRlci5jYWxsKHRoaXMpO1xyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwudGFyZ2V0LnggPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguY29zKCB0aGlzLnRoZXRhICk7XHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTC50YXJnZXQueSA9IDUwMCAqIE1hdGguY29zKCB0aGlzLnBoaSApO1xyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwudGFyZ2V0LnogPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguc2luKCB0aGlzLnRoZXRhICk7XHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5sb29rQXQodGhpcy5jYW1lcmFMLnRhcmdldCk7XHJcblxyXG4gICAgICAgICAgICBpZih0aGlzLlZSTW9kZSl7XHJcbiAgICAgICAgICAgICAgICB2YXIgdmlld1BvcnRXaWR0aCA9IHRoaXMud2lkdGggLyAyLCB2aWV3UG9ydEhlaWdodCA9IHRoaXMuaGVpZ2h0O1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnRhcmdldC54ID0gMTAwMCArIDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5jb3MoIHRoaXMudGhldGEgKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhUi50YXJnZXQueSA9IDUwMCAqIE1hdGguY29zKCB0aGlzLnBoaSApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnRhcmdldC56ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLnNpbiggdGhpcy50aGV0YSApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLmxvb2tBdCggdGhpcy5jYW1lcmFSLnRhcmdldCApO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIHJlbmRlciBsZWZ0IGV5ZVxyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRWaWV3cG9ydCggMCwgMCwgdmlld1BvcnRXaWR0aCwgdmlld1BvcnRIZWlnaHQgKTtcclxuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2Npc3NvciggMCwgMCwgdmlld1BvcnRXaWR0aCwgdmlld1BvcnRIZWlnaHQgKTtcclxuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKCB0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYUwgKTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyByZW5kZXIgcmlnaHQgZXllXHJcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFZpZXdwb3J0KCB2aWV3UG9ydFdpZHRoLCAwLCB2aWV3UG9ydFdpZHRoLCB2aWV3UG9ydEhlaWdodCApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTY2lzc29yKCB2aWV3UG9ydFdpZHRoLCAwLCB2aWV3UG9ydFdpZHRoLCB2aWV3UG9ydEhlaWdodCApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIoIHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhUiApO1xyXG4gICAgICAgICAgICB9ZWxzZXtcclxuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKCB0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYUwgKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG59O1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgVGhyZWVEQ2FudmFzOyIsIi8qKlxyXG4gKiBDcmVhdGVkIGJ5IHdlbnNoZW5nLnlhbiBvbiA0LzQvMTYuXHJcbiAqL1xyXG5mdW5jdGlvbiB3aGljaFRyYW5zaXRpb25FdmVudCgpe1xyXG4gICAgdmFyIHQ7XHJcbiAgICB2YXIgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdmYWtlZWxlbWVudCcpO1xyXG4gICAgdmFyIHRyYW5zaXRpb25zID0ge1xyXG4gICAgICAgICd0cmFuc2l0aW9uJzondHJhbnNpdGlvbmVuZCcsXHJcbiAgICAgICAgJ09UcmFuc2l0aW9uJzonb1RyYW5zaXRpb25FbmQnLFxyXG4gICAgICAgICdNb3pUcmFuc2l0aW9uJzondHJhbnNpdGlvbmVuZCcsXHJcbiAgICAgICAgJ1dlYmtpdFRyYW5zaXRpb24nOid3ZWJraXRUcmFuc2l0aW9uRW5kJ1xyXG4gICAgfTtcclxuXHJcbiAgICBmb3IodCBpbiB0cmFuc2l0aW9ucyl7XHJcbiAgICAgICAgaWYoIGVsLnN0eWxlW3RdICE9PSB1bmRlZmluZWQgKXtcclxuICAgICAgICAgICAgcmV0dXJuIHRyYW5zaXRpb25zW3RdO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gbW9iaWxlQW5kVGFibGV0Y2hlY2soKSB7XHJcbiAgICB2YXIgY2hlY2sgPSBmYWxzZTtcclxuICAgIChmdW5jdGlvbihhKXtpZigvKGFuZHJvaWR8YmJcXGQrfG1lZWdvKS4rbW9iaWxlfGF2YW50Z298YmFkYVxcL3xibGFja2JlcnJ5fGJsYXplcnxjb21wYWx8ZWxhaW5lfGZlbm5lY3xoaXB0b3B8aWVtb2JpbGV8aXAoaG9uZXxvZCl8aXJpc3xraW5kbGV8bGdlIHxtYWVtb3xtaWRwfG1tcHxtb2JpbGUuK2ZpcmVmb3h8bmV0ZnJvbnR8b3BlcmEgbShvYnxpbilpfHBhbG0oIG9zKT98cGhvbmV8cChpeGl8cmUpXFwvfHBsdWNrZXJ8cG9ja2V0fHBzcHxzZXJpZXMoNHw2KTB8c3ltYmlhbnx0cmVvfHVwXFwuKGJyb3dzZXJ8bGluayl8dm9kYWZvbmV8d2FwfHdpbmRvd3MgY2V8eGRhfHhpaW5vfGFuZHJvaWR8aXBhZHxwbGF5Ym9va3xzaWxrL2kudGVzdChhKXx8LzEyMDd8NjMxMHw2NTkwfDNnc298NHRocHw1MFsxLTZdaXw3NzBzfDgwMnN8YSB3YXxhYmFjfGFjKGVyfG9vfHNcXC0pfGFpKGtvfHJuKXxhbChhdnxjYXxjbyl8YW1vaXxhbihleHxueXx5dyl8YXB0dXxhcihjaHxnbyl8YXModGV8dXMpfGF0dHd8YXUoZGl8XFwtbXxyIHxzICl8YXZhbnxiZShja3xsbHxucSl8YmkobGJ8cmQpfGJsKGFjfGF6KXxicihlfHYpd3xidW1ifGJ3XFwtKG58dSl8YzU1XFwvfGNhcGl8Y2N3YXxjZG1cXC18Y2VsbHxjaHRtfGNsZGN8Y21kXFwtfGNvKG1wfG5kKXxjcmF3fGRhKGl0fGxsfG5nKXxkYnRlfGRjXFwtc3xkZXZpfGRpY2F8ZG1vYnxkbyhjfHApb3xkcygxMnxcXC1kKXxlbCg0OXxhaSl8ZW0obDJ8dWwpfGVyKGljfGswKXxlc2w4fGV6KFs0LTddMHxvc3x3YXx6ZSl8ZmV0Y3xmbHkoXFwtfF8pfGcxIHV8ZzU2MHxnZW5lfGdmXFwtNXxnXFwtbW98Z28oXFwud3xvZCl8Z3IoYWR8dW4pfGhhaWV8aGNpdHxoZFxcLShtfHB8dCl8aGVpXFwtfGhpKHB0fHRhKXxocCggaXxpcCl8aHNcXC1jfGh0KGMoXFwtfCB8X3xhfGd8cHxzfHQpfHRwKXxodShhd3x0Yyl8aVxcLSgyMHxnb3xtYSl8aTIzMHxpYWMoIHxcXC18XFwvKXxpYnJvfGlkZWF8aWcwMXxpa29tfGltMWt8aW5ub3xpcGFxfGlyaXN8amEodHx2KWF8amJyb3xqZW11fGppZ3N8a2RkaXxrZWppfGtndCggfFxcLyl8a2xvbnxrcHQgfGt3Y1xcLXxreW8oY3xrKXxsZShub3x4aSl8bGcoIGd8XFwvKGt8bHx1KXw1MHw1NHxcXC1bYS13XSl8bGlid3xseW54fG0xXFwtd3xtM2dhfG01MFxcL3xtYSh0ZXx1aXx4byl8bWMoMDF8MjF8Y2EpfG1cXC1jcnxtZShyY3xyaSl8bWkobzh8b2F8dHMpfG1tZWZ8bW8oMDF8MDJ8Yml8ZGV8ZG98dChcXC18IHxvfHYpfHp6KXxtdCg1MHxwMXx2ICl8bXdicHxteXdhfG4xMFswLTJdfG4yMFsyLTNdfG4zMCgwfDIpfG41MCgwfDJ8NSl8bjcoMCgwfDEpfDEwKXxuZSgoY3xtKVxcLXxvbnx0Znx3Znx3Z3x3dCl8bm9rKDZ8aSl8bnpwaHxvMmltfG9wKHRpfHd2KXxvcmFufG93ZzF8cDgwMHxwYW4oYXxkfHQpfHBkeGd8cGcoMTN8XFwtKFsxLThdfGMpKXxwaGlsfHBpcmV8cGwoYXl8dWMpfHBuXFwtMnxwbyhja3xydHxzZSl8cHJveHxwc2lvfHB0XFwtZ3xxYVxcLWF8cWMoMDd8MTJ8MjF8MzJ8NjB8XFwtWzItN118aVxcLSl8cXRla3xyMzgwfHI2MDB8cmFrc3xyaW05fHJvKHZlfHpvKXxzNTVcXC98c2EoZ2V8bWF8bW18bXN8bnl8dmEpfHNjKDAxfGhcXC18b298cFxcLSl8c2RrXFwvfHNlKGMoXFwtfDB8MSl8NDd8bWN8bmR8cmkpfHNnaFxcLXxzaGFyfHNpZShcXC18bSl8c2tcXC0wfHNsKDQ1fGlkKXxzbShhbHxhcnxiM3xpdHx0NSl8c28oZnR8bnkpfHNwKDAxfGhcXC18dlxcLXx2ICl8c3koMDF8bWIpfHQyKDE4fDUwKXx0NigwMHwxMHwxOCl8dGEoZ3R8bGspfHRjbFxcLXx0ZGdcXC18dGVsKGl8bSl8dGltXFwtfHRcXC1tb3x0byhwbHxzaCl8dHMoNzB8bVxcLXxtM3xtNSl8dHhcXC05fHVwKFxcLmJ8ZzF8c2kpfHV0c3R8djQwMHx2NzUwfHZlcml8dmkocmd8dGUpfHZrKDQwfDVbMC0zXXxcXC12KXx2bTQwfHZvZGF8dnVsY3x2eCg1Mnw1M3w2MHw2MXw3MHw4MHw4MXw4M3w4NXw5OCl8dzNjKFxcLXwgKXx3ZWJjfHdoaXR8d2koZyB8bmN8bncpfHdtbGJ8d29udXx4NzAwfHlhc1xcLXx5b3VyfHpldG98enRlXFwtL2kudGVzdChhLnN1YnN0cigwLDQpKSljaGVjayA9IHRydWV9KShuYXZpZ2F0b3IudXNlckFnZW50fHxuYXZpZ2F0b3IudmVuZG9yfHx3aW5kb3cub3BlcmEpO1xyXG4gICAgcmV0dXJuIGNoZWNrO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc0lvcygpIHtcclxuICAgIHJldHVybiAvaVBob25lfGlQYWR8aVBvZC9pLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzUmVhbElwaG9uZSgpIHtcclxuICAgIHJldHVybiAvaVBob25lfGlQb2QvaS50ZXN0KG5hdmlnYXRvci5wbGF0Zm9ybSk7XHJcbn1cclxuXHJcbi8vYWRvcHQgY29kZSBmcm9tOiBodHRwczovL2dpdGh1Yi5jb20vTW96VlIvdnItd2ViLWV4YW1wbGVzL2Jsb2IvbWFzdGVyL3RocmVlanMtdnItYm9pbGVycGxhdGUvanMvVlJFZmZlY3QuanNcclxuZnVuY3Rpb24gZm92VG9ORENTY2FsZU9mZnNldCggZm92ICkge1xyXG4gICAgdmFyIHB4c2NhbGUgPSAyLjAgLyAoZm92LmxlZnRUYW4gKyBmb3YucmlnaHRUYW4pO1xyXG4gICAgdmFyIHB4b2Zmc2V0ID0gKGZvdi5sZWZ0VGFuIC0gZm92LnJpZ2h0VGFuKSAqIHB4c2NhbGUgKiAwLjU7XHJcbiAgICB2YXIgcHlzY2FsZSA9IDIuMCAvIChmb3YudXBUYW4gKyBmb3YuZG93blRhbik7XHJcbiAgICB2YXIgcHlvZmZzZXQgPSAoZm92LnVwVGFuIC0gZm92LmRvd25UYW4pICogcHlzY2FsZSAqIDAuNTtcclxuICAgIHJldHVybiB7IHNjYWxlOiBbIHB4c2NhbGUsIHB5c2NhbGUgXSwgb2Zmc2V0OiBbIHB4b2Zmc2V0LCBweW9mZnNldCBdIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZvdlBvcnRUb1Byb2plY3Rpb24oIGZvdiwgcmlnaHRIYW5kZWQsIHpOZWFyLCB6RmFyICkge1xyXG5cclxuICAgIHJpZ2h0SGFuZGVkID0gcmlnaHRIYW5kZWQgPT09IHVuZGVmaW5lZCA/IHRydWUgOiByaWdodEhhbmRlZDtcclxuICAgIHpOZWFyID0gek5lYXIgPT09IHVuZGVmaW5lZCA/IDAuMDEgOiB6TmVhcjtcclxuICAgIHpGYXIgPSB6RmFyID09PSB1bmRlZmluZWQgPyAxMDAwMC4wIDogekZhcjtcclxuXHJcbiAgICB2YXIgaGFuZGVkbmVzc1NjYWxlID0gcmlnaHRIYW5kZWQgPyAtMS4wIDogMS4wO1xyXG5cclxuICAgIC8vIHN0YXJ0IHdpdGggYW4gaWRlbnRpdHkgbWF0cml4XHJcbiAgICB2YXIgbW9iaiA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XHJcbiAgICB2YXIgbSA9IG1vYmouZWxlbWVudHM7XHJcblxyXG4gICAgLy8gYW5kIHdpdGggc2NhbGUvb2Zmc2V0IGluZm8gZm9yIG5vcm1hbGl6ZWQgZGV2aWNlIGNvb3Jkc1xyXG4gICAgdmFyIHNjYWxlQW5kT2Zmc2V0ID0gZm92VG9ORENTY2FsZU9mZnNldChmb3YpO1xyXG5cclxuICAgIC8vIFggcmVzdWx0LCBtYXAgY2xpcCBlZGdlcyB0byBbLXcsK3ddXHJcbiAgICBtWzAgKiA0ICsgMF0gPSBzY2FsZUFuZE9mZnNldC5zY2FsZVswXTtcclxuICAgIG1bMCAqIDQgKyAxXSA9IDAuMDtcclxuICAgIG1bMCAqIDQgKyAyXSA9IHNjYWxlQW5kT2Zmc2V0Lm9mZnNldFswXSAqIGhhbmRlZG5lc3NTY2FsZTtcclxuICAgIG1bMCAqIDQgKyAzXSA9IDAuMDtcclxuXHJcbiAgICAvLyBZIHJlc3VsdCwgbWFwIGNsaXAgZWRnZXMgdG8gWy13LCt3XVxyXG4gICAgLy8gWSBvZmZzZXQgaXMgbmVnYXRlZCBiZWNhdXNlIHRoaXMgcHJvaiBtYXRyaXggdHJhbnNmb3JtcyBmcm9tIHdvcmxkIGNvb3JkcyB3aXRoIFk9dXAsXHJcbiAgICAvLyBidXQgdGhlIE5EQyBzY2FsaW5nIGhhcyBZPWRvd24gKHRoYW5rcyBEM0Q/KVxyXG4gICAgbVsxICogNCArIDBdID0gMC4wO1xyXG4gICAgbVsxICogNCArIDFdID0gc2NhbGVBbmRPZmZzZXQuc2NhbGVbMV07XHJcbiAgICBtWzEgKiA0ICsgMl0gPSAtc2NhbGVBbmRPZmZzZXQub2Zmc2V0WzFdICogaGFuZGVkbmVzc1NjYWxlO1xyXG4gICAgbVsxICogNCArIDNdID0gMC4wO1xyXG5cclxuICAgIC8vIFogcmVzdWx0ICh1cCB0byB0aGUgYXBwKVxyXG4gICAgbVsyICogNCArIDBdID0gMC4wO1xyXG4gICAgbVsyICogNCArIDFdID0gMC4wO1xyXG4gICAgbVsyICogNCArIDJdID0gekZhciAvICh6TmVhciAtIHpGYXIpICogLWhhbmRlZG5lc3NTY2FsZTtcclxuICAgIG1bMiAqIDQgKyAzXSA9ICh6RmFyICogek5lYXIpIC8gKHpOZWFyIC0gekZhcik7XHJcblxyXG4gICAgLy8gVyByZXN1bHQgKD0gWiBpbilcclxuICAgIG1bMyAqIDQgKyAwXSA9IDAuMDtcclxuICAgIG1bMyAqIDQgKyAxXSA9IDAuMDtcclxuICAgIG1bMyAqIDQgKyAyXSA9IGhhbmRlZG5lc3NTY2FsZTtcclxuICAgIG1bMyAqIDQgKyAzXSA9IDAuMDtcclxuXHJcbiAgICBtb2JqLnRyYW5zcG9zZSgpO1xyXG5cclxuICAgIHJldHVybiBtb2JqO1xyXG59XHJcblxyXG5mdW5jdGlvbiBmb3ZUb1Byb2plY3Rpb24oIGZvdiwgcmlnaHRIYW5kZWQsIHpOZWFyLCB6RmFyICkge1xyXG4gICAgdmFyIERFRzJSQUQgPSBNYXRoLlBJIC8gMTgwLjA7XHJcblxyXG4gICAgdmFyIGZvdlBvcnQgPSB7XHJcbiAgICAgICAgdXBUYW46IE1hdGgudGFuKCBmb3YudXBEZWdyZWVzICogREVHMlJBRCApLFxyXG4gICAgICAgIGRvd25UYW46IE1hdGgudGFuKCBmb3YuZG93bkRlZ3JlZXMgKiBERUcyUkFEICksXHJcbiAgICAgICAgbGVmdFRhbjogTWF0aC50YW4oIGZvdi5sZWZ0RGVncmVlcyAqIERFRzJSQUQgKSxcclxuICAgICAgICByaWdodFRhbjogTWF0aC50YW4oIGZvdi5yaWdodERlZ3JlZXMgKiBERUcyUkFEIClcclxuICAgIH07XHJcblxyXG4gICAgcmV0dXJuIGZvdlBvcnRUb1Byb2plY3Rpb24oIGZvdlBvcnQsIHJpZ2h0SGFuZGVkLCB6TmVhciwgekZhciApO1xyXG59XHJcblxyXG5mdW5jdGlvbiBleHRlbmQoc3VwZXJDbGFzcywgc3ViQ2xhc3NNZXRob2RzID0ge30pXHJcbntcclxuICAgIGZvcih2YXIgbWV0aG9kIGluIHN1cGVyQ2xhc3Mpe1xyXG4gICAgICAgIGlmKHN1cGVyQ2xhc3MuaGFzT3duUHJvcGVydHkobWV0aG9kKSAmJiAhc3ViQ2xhc3NNZXRob2RzLmhhc093blByb3BlcnR5KG1ldGhvZCkpe1xyXG4gICAgICAgICAgICBzdWJDbGFzc01ldGhvZHNbbWV0aG9kXSA9IHN1cGVyQ2xhc3NbbWV0aG9kXTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gc3ViQ2xhc3NNZXRob2RzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBkZWVwQ29weShvYmopIHtcclxuICAgIHZhciB0byA9IHt9O1xyXG5cclxuICAgIGZvciAodmFyIG5hbWUgaW4gb2JqKVxyXG4gICAge1xyXG4gICAgICAgIHRvW25hbWVdID0gb2JqW25hbWVdO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB0bztcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0VG91Y2hlc0Rpc3RhbmNlKHRvdWNoZXMpe1xyXG4gICAgcmV0dXJuIE1hdGguc3FydChcclxuICAgICAgICAodG91Y2hlc1swXS5jbGllbnRYLXRvdWNoZXNbMV0uY2xpZW50WCkgKiAodG91Y2hlc1swXS5jbGllbnRYLXRvdWNoZXNbMV0uY2xpZW50WCkgK1xyXG4gICAgICAgICh0b3VjaGVzWzBdLmNsaWVudFktdG91Y2hlc1sxXS5jbGllbnRZKSAqICh0b3VjaGVzWzBdLmNsaWVudFktdG91Y2hlc1sxXS5jbGllbnRZKSk7XHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IHtcclxuICAgIHdoaWNoVHJhbnNpdGlvbkV2ZW50OiB3aGljaFRyYW5zaXRpb25FdmVudCxcclxuICAgIG1vYmlsZUFuZFRhYmxldGNoZWNrOiBtb2JpbGVBbmRUYWJsZXRjaGVjayxcclxuICAgIGlzSW9zOiBpc0lvcyxcclxuICAgIGlzUmVhbElwaG9uZTogaXNSZWFsSXBob25lLFxyXG4gICAgZm92VG9Qcm9qZWN0aW9uOiBmb3ZUb1Byb2plY3Rpb24sXHJcbiAgICBleHRlbmQ6IGV4dGVuZCxcclxuICAgIGRlZXBDb3B5OiBkZWVwQ29weSxcclxuICAgIGdldFRvdWNoZXNEaXN0YW5jZTogZ2V0VG91Y2hlc0Rpc3RhbmNlXHJcbn07IiwiLyoqXHJcbiAqIENyZWF0ZWQgYnkgeWFud3NoIG9uIDgvMTMvMTYuXHJcbiAqL1xyXG5cclxudmFyIFZSQnV0dG9uID0gZnVuY3Rpb24oQnV0dG9uQ29tcG9uZW50KXtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcclxuICAgICAgICAgICAgQnV0dG9uQ29tcG9uZW50LmNhbGwodGhpcywgcGxheWVyLCBvcHRpb25zKTtcclxuICAgICAgICB9LFxyXG5cclxuICAgICAgICBidWlsZENTU0NsYXNzOiBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGB2anMtVlItY29udHJvbCAke0J1dHRvbkNvbXBvbmVudC5wcm90b3R5cGUuYnVpbGRDU1NDbGFzcy5jYWxsKHRoaXMpfWA7XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgaGFuZGxlQ2xpY2s6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgdmFyIGNhbnZhcyA9IHRoaXMucGxheWVyKCkuZ2V0Q2hpbGQoXCJDYW52YXNcIik7XHJcbiAgICAgICAgICAgICghY2FudmFzLlZSTW9kZSk/IGNhbnZhcy5lbmFibGVWUigpIDogY2FudmFzLmRpc2FibGVWUigpO1xyXG4gICAgICAgICAgICAoY2FudmFzLlZSTW9kZSk/IHRoaXMuYWRkQ2xhc3MoXCJlbmFibGVcIikgOiB0aGlzLnJlbW92ZUNsYXNzKFwiZW5hYmxlXCIpO1xyXG4gICAgICAgICAgICAoY2FudmFzLlZSTW9kZSk/ICB0aGlzLnBsYXllcigpLnRyaWdnZXIoJ1ZSTW9kZU9uJyk6ICB0aGlzLnBsYXllcigpLnRyaWdnZXIoJ1ZSTW9kZU9mZicpO1xyXG4gICAgICAgIH0sXHJcblxyXG4gICAgICAgIGNvbnRyb2xUZXh0XzogXCJWUlwiXHJcbiAgICB9XHJcbn07XHJcblxyXG5leHBvcnQgZGVmYXVsdCBWUkJ1dHRvbjsiLCIvKipcclxuICogQ3JlYXRlZCBieSB5YW53c2ggb24gNC8zLzE2LlxyXG4gKi9cclxuJ3VzZSBzdHJpY3QnO1xyXG5cclxuaW1wb3J0IHV0aWwgZnJvbSAnLi9saWIvVXRpbCc7XHJcbmltcG9ydCBEZXRlY3RvciBmcm9tICcuL2xpYi9EZXRlY3Rvcic7XHJcbmltcG9ydCBtYWtlVmlkZW9QbGF5YWJsZUlubGluZSBmcm9tICdpcGhvbmUtaW5saW5lLXZpZGVvJztcclxuXHJcbmNvbnN0IHJ1bk9uTW9iaWxlID0gKHV0aWwubW9iaWxlQW5kVGFibGV0Y2hlY2soKSk7XHJcblxyXG4vLyBEZWZhdWx0IG9wdGlvbnMgZm9yIHRoZSBwbHVnaW4uXHJcbmNvbnN0IGRlZmF1bHRzID0ge1xyXG4gICAgY2xpY2tBbmREcmFnOiBydW5Pbk1vYmlsZSxcclxuICAgIHNob3dOb3RpY2U6IHRydWUsXHJcbiAgICBOb3RpY2VNZXNzYWdlOiBcIlBsZWFzZSB1c2UgeW91ciBtb3VzZSBkcmFnIGFuZCBkcm9wIHRoZSB2aWRlby5cIixcclxuICAgIGF1dG9IaWRlTm90aWNlOiAzMDAwLFxyXG4gICAgLy9saW1pdCB0aGUgdmlkZW8gc2l6ZSB3aGVuIHVzZXIgc2Nyb2xsLlxyXG4gICAgc2Nyb2xsYWJsZTogdHJ1ZSxcclxuICAgIGluaXRGb3Y6IDc1LFxyXG4gICAgbWF4Rm92OiAxMDUsXHJcbiAgICBtaW5Gb3Y6IDUxLFxyXG4gICAgLy9pbml0aWFsIHBvc2l0aW9uIGZvciB0aGUgdmlkZW9cclxuICAgIGluaXRMYXQ6IDAsXHJcbiAgICBpbml0TG9uOiAtMTgwLFxyXG4gICAgLy9BIGZsb2F0IHZhbHVlIGJhY2sgdG8gY2VudGVyIHdoZW4gbW91c2Ugb3V0IHRoZSBjYW52YXMuIFRoZSBoaWdoZXIsIHRoZSBmYXN0ZXIuXHJcbiAgICByZXR1cm5TdGVwTGF0OiAwLjUsXHJcbiAgICByZXR1cm5TdGVwTG9uOiAyLFxyXG4gICAgYmFja1RvVmVydGljYWxDZW50ZXI6ICFydW5Pbk1vYmlsZSxcclxuICAgIGJhY2tUb0hvcml6b25DZW50ZXI6ICFydW5Pbk1vYmlsZSxcclxuICAgIGNsaWNrVG9Ub2dnbGU6IGZhbHNlLFxyXG5cclxuICAgIC8vbGltaXQgdmlld2FibGUgem9vbVxyXG4gICAgbWluTGF0OiAtODUsXHJcbiAgICBtYXhMYXQ6IDg1LFxyXG5cclxuICAgIG1pbkxvbjogLUluZmluaXR5LFxyXG4gICAgbWF4TG9uOiBJbmZpbml0eSxcclxuXHJcbiAgICB2aWRlb1R5cGU6IFwiZXF1aXJlY3Rhbmd1bGFyXCIsXHJcblxyXG4gICAgcm90YXRlWDogMCxcclxuICAgIHJvdGF0ZVk6IDAsXHJcbiAgICByb3RhdGVaOiAwLFxyXG5cclxuICAgIGF1dG9Nb2JpbGVPcmllbnRhdGlvbjogZmFsc2UsXHJcbiAgICBtb2JpbGVWaWJyYXRpb25WYWx1ZTogdXRpbC5pc0lvcygpPyAwLjAyMiA6IDEsXHJcblxyXG4gICAgVlJFbmFibGU6IHRydWUsXHJcbiAgICBWUkdhcERlZ3JlZTogMi41LFxyXG5cclxuICAgIGNsb3NlUGFub3JhbWE6IGZhbHNlLFxyXG5cclxuICAgIGhlbHBlckNhbnZhczoge30sXHJcblxyXG4gICAgZHVhbEZpc2g6IHtcclxuICAgICAgICB3aWR0aDogMTkyMCxcclxuICAgICAgICBoZWlnaHQ6IDEwODAsXHJcbiAgICAgICAgY2lyY2xlMToge1xyXG4gICAgICAgICAgICB4OiAwLjI0MDYyNSxcclxuICAgICAgICAgICAgeTogMC41NTM3MDQsXHJcbiAgICAgICAgICAgIHJ4OiAwLjIzMzMzLFxyXG4gICAgICAgICAgICByeTogMC40MzE0OCxcclxuICAgICAgICAgICAgY292ZXJYOiAwLjkxMyxcclxuICAgICAgICAgICAgY292ZXJZOiAwLjlcclxuICAgICAgICB9LFxyXG4gICAgICAgIGNpcmNsZTI6IHtcclxuICAgICAgICAgICAgeDogMC43NTcyOTIsXHJcbiAgICAgICAgICAgIHk6IDAuNTUzNzA0LFxyXG4gICAgICAgICAgICByeDogMC4yMzIyOTIsXHJcbiAgICAgICAgICAgIHJ5OiAwLjQyOTYyOTYsXHJcbiAgICAgICAgICAgIGNvdmVyWDogMC45MTMsXHJcbiAgICAgICAgICAgIGNvdmVyWTogMC45MzA4XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59O1xyXG5cclxuZnVuY3Rpb24gcGxheWVyUmVzaXplKHBsYXllcil7XHJcbiAgICB2YXIgY2FudmFzID0gcGxheWVyLmdldENoaWxkKCdDYW52YXMnKTtcclxuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgcGxheWVyLmVsKCkuc3R5bGUud2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aCArIFwicHhcIjtcclxuICAgICAgICBwbGF5ZXIuZWwoKS5zdHlsZS5oZWlnaHQgPSB3aW5kb3cuaW5uZXJIZWlnaHQgKyBcInB4XCI7XHJcbiAgICAgICAgY2FudmFzLmhhbmRsZVJlc2l6ZSgpO1xyXG4gICAgfTtcclxufVxyXG5cclxuZnVuY3Rpb24gZnVsbHNjcmVlbk9uSU9TKHBsYXllciwgY2xpY2tGbikge1xyXG4gICAgdmFyIHJlc2l6ZUZuID0gcGxheWVyUmVzaXplKHBsYXllcik7XHJcbiAgICBwbGF5ZXIuY29udHJvbEJhci5mdWxsc2NyZWVuVG9nZ2xlLm9mZihcInRhcFwiLCBjbGlja0ZuKTtcclxuICAgIHBsYXllci5jb250cm9sQmFyLmZ1bGxzY3JlZW5Ub2dnbGUub24oXCJ0YXBcIiwgZnVuY3Rpb24gZnVsbHNjcmVlbigpIHtcclxuICAgICAgICB2YXIgY2FudmFzID0gcGxheWVyLmdldENoaWxkKCdDYW52YXMnKTtcclxuICAgICAgICBpZighcGxheWVyLmlzRnVsbHNjcmVlbigpKXtcclxuICAgICAgICAgICAgLy9zZXQgdG8gZnVsbHNjcmVlblxyXG4gICAgICAgICAgICBwbGF5ZXIuaXNGdWxsc2NyZWVuKHRydWUpO1xyXG4gICAgICAgICAgICBwbGF5ZXIuZW50ZXJGdWxsV2luZG93KCk7XHJcbiAgICAgICAgICAgIHJlc2l6ZUZuKCk7XHJcbiAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwiZGV2aWNlbW90aW9uXCIsIHJlc2l6ZUZuKTtcclxuICAgICAgICB9ZWxzZXtcclxuICAgICAgICAgICAgcGxheWVyLmlzRnVsbHNjcmVlbihmYWxzZSk7XHJcbiAgICAgICAgICAgIHBsYXllci5leGl0RnVsbFdpbmRvdygpO1xyXG4gICAgICAgICAgICBwbGF5ZXIuZWwoKS5zdHlsZS53aWR0aCA9IFwiXCI7XHJcbiAgICAgICAgICAgIHBsYXllci5lbCgpLnN0eWxlLmhlaWdodCA9IFwiXCI7XHJcbiAgICAgICAgICAgIGNhbnZhcy5oYW5kbGVSZXNpemUoKTtcclxuICAgICAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJkZXZpY2Vtb3Rpb25cIiwgcmVzaXplRm4pO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG59XHJcblxyXG4vKipcclxuICogRnVuY3Rpb24gdG8gaW52b2tlIHdoZW4gdGhlIHBsYXllciBpcyByZWFkeS5cclxuICpcclxuICogVGhpcyBpcyBhIGdyZWF0IHBsYWNlIGZvciB5b3VyIHBsdWdpbiB0byBpbml0aWFsaXplIGl0c2VsZi4gV2hlbiB0aGlzXHJcbiAqIGZ1bmN0aW9uIGlzIGNhbGxlZCwgdGhlIHBsYXllciB3aWxsIGhhdmUgaXRzIERPTSBhbmQgY2hpbGQgY29tcG9uZW50c1xyXG4gKiBpbiBwbGFjZS5cclxuICpcclxuICogQGZ1bmN0aW9uIG9uUGxheWVyUmVhZHlcclxuICogQHBhcmFtICAgIHtQbGF5ZXJ9IHBsYXllclxyXG4gKiBAcGFyYW0gICAge09iamVjdH0gW29wdGlvbnM9e31dXHJcbiAqL1xyXG5jb25zdCBvblBsYXllclJlYWR5ID0gKHBsYXllciwgb3B0aW9ucywgc2V0dGluZ3MpID0+IHtcclxuICAgIHBsYXllci5hZGRDbGFzcygndmpzLXBhbm9yYW1hJyk7XHJcbiAgICBpZighRGV0ZWN0b3Iud2ViZ2wpe1xyXG4gICAgICAgIFBvcHVwTm90aWZpY2F0aW9uKHBsYXllciwge1xyXG4gICAgICAgICAgICBOb3RpY2VNZXNzYWdlOiBEZXRlY3Rvci5nZXRXZWJHTEVycm9yTWVzc2FnZSgpLFxyXG4gICAgICAgICAgICBhdXRvSGlkZU5vdGljZTogb3B0aW9ucy5hdXRvSGlkZU5vdGljZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGlmKG9wdGlvbnMuY2FsbGJhY2spe1xyXG4gICAgICAgICAgICBvcHRpb25zLmNhbGxiYWNrKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIHBsYXllci5hZGRDaGlsZCgnQ2FudmFzJywgdXRpbC5kZWVwQ29weShvcHRpb25zKSk7XHJcbiAgICB2YXIgY2FudmFzID0gcGxheWVyLmdldENoaWxkKCdDYW52YXMnKTtcclxuICAgIGlmKHJ1bk9uTW9iaWxlKXtcclxuICAgICAgICB2YXIgdmlkZW9FbGVtZW50ID0gc2V0dGluZ3MuZ2V0VGVjaChwbGF5ZXIpO1xyXG4gICAgICAgIGlmKHV0aWwuaXNSZWFsSXBob25lKCkpe1xyXG4gICAgICAgICAgICAvL2lvcyAxMCBzdXBwb3J0IHBsYXkgdmlkZW8gaW5saW5lXHJcbiAgICAgICAgICAgIHZpZGVvRWxlbWVudC5zZXRBdHRyaWJ1dGUoXCJwbGF5c2lubGluZVwiLCBcIlwiKTtcclxuICAgICAgICAgICAgbWFrZVZpZGVvUGxheWFibGVJbmxpbmUodmlkZW9FbGVtZW50LCB0cnVlKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYodXRpbC5pc0lvcygpKXtcclxuICAgICAgICAgICAgZnVsbHNjcmVlbk9uSU9TKHBsYXllciwgc2V0dGluZ3MuZ2V0RnVsbHNjcmVlblRvZ2dsZUNsaWNrRm4ocGxheWVyKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHBsYXllci5hZGRDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2JpbGUtaW5saW5lLXZpZGVvXCIpO1xyXG4gICAgICAgIHBsYXllci5yZW1vdmVDbGFzcyhcInZqcy11c2luZy1uYXRpdmUtY29udHJvbHNcIik7XHJcbiAgICAgICAgY2FudmFzLnBsYXlPbk1vYmlsZSgpO1xyXG4gICAgfVxyXG4gICAgaWYob3B0aW9ucy5zaG93Tm90aWNlKXtcclxuICAgICAgICBwbGF5ZXIub24oXCJwbGF5aW5nXCIsIGZ1bmN0aW9uKCl7XHJcbiAgICAgICAgICAgIFBvcHVwTm90aWZpY2F0aW9uKHBsYXllciwgdXRpbC5kZWVwQ29weShvcHRpb25zKSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBpZihvcHRpb25zLlZSRW5hYmxlKXtcclxuICAgICAgICBwbGF5ZXIuY29udHJvbEJhci5hZGRDaGlsZCgnVlJCdXR0b24nLCB7fSwgcGxheWVyLmNvbnRyb2xCYXIuY2hpbGRyZW4oKS5sZW5ndGggLSAxKTtcclxuICAgIH1cclxuICAgIGNhbnZhcy5oaWRlKCk7XHJcbiAgICBwbGF5ZXIub24oXCJwbGF5XCIsIGZ1bmN0aW9uICgpIHtcclxuICAgICAgICBjYW52YXMuc2hvdygpO1xyXG4gICAgfSk7XHJcbiAgICBwbGF5ZXIub24oXCJmdWxsc2NyZWVuY2hhbmdlXCIsIGZ1bmN0aW9uICgpIHtcclxuICAgICAgICBjYW52YXMuaGFuZGxlUmVzaXplKCk7XHJcbiAgICB9KTtcclxuICAgIGlmKG9wdGlvbnMuY2FsbGJhY2spIG9wdGlvbnMuY2FsbGJhY2soKTtcclxufTtcclxuXHJcbmNvbnN0IFBvcHVwTm90aWZpY2F0aW9uID0gKHBsYXllciwgb3B0aW9ucyA9IHtcclxuICAgIE5vdGljZU1lc3NhZ2U6IFwiXCJcclxufSkgPT4ge1xyXG4gICAgdmFyIG5vdGljZSA9IHBsYXllci5hZGRDaGlsZCgnTm90aWNlJywgb3B0aW9ucyk7XHJcblxyXG4gICAgaWYob3B0aW9ucy5hdXRvSGlkZU5vdGljZSA+IDApe1xyXG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICBub3RpY2UuYWRkQ2xhc3MoXCJ2anMtdmlkZW8tbm90aWNlLWZhZGVPdXRcIik7XHJcbiAgICAgICAgICAgIHZhciB0cmFuc2l0aW9uRXZlbnQgPSB1dGlsLndoaWNoVHJhbnNpdGlvbkV2ZW50KCk7XHJcbiAgICAgICAgICAgIHZhciBoaWRlID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgbm90aWNlLmhpZGUoKTtcclxuICAgICAgICAgICAgICAgIG5vdGljZS5yZW1vdmVDbGFzcyhcInZqcy12aWRlby1ub3RpY2UtZmFkZU91dFwiKTtcclxuICAgICAgICAgICAgICAgIG5vdGljZS5vZmYodHJhbnNpdGlvbkV2ZW50LCBoaWRlKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgbm90aWNlLm9uKHRyYW5zaXRpb25FdmVudCwgaGlkZSk7XHJcbiAgICAgICAgfSwgb3B0aW9ucy5hdXRvSGlkZU5vdGljZSk7XHJcbiAgICB9XHJcbn07XHJcblxyXG5jb25zdCBwbHVnaW4gPSBmdW5jdGlvbihzZXR0aW5ncyA9IHt9KXtcclxuICAgIC8qKlxyXG4gICAgICogQSB2aWRlby5qcyBwbHVnaW4uXHJcbiAgICAgKlxyXG4gICAgICogSW4gdGhlIHBsdWdpbiBmdW5jdGlvbiwgdGhlIHZhbHVlIG9mIGB0aGlzYCBpcyBhIHZpZGVvLmpzIGBQbGF5ZXJgXHJcbiAgICAgKiBpbnN0YW5jZS4gWW91IGNhbm5vdCByZWx5IG9uIHRoZSBwbGF5ZXIgYmVpbmcgaW4gYSBcInJlYWR5XCIgc3RhdGUgaGVyZSxcclxuICAgICAqIGRlcGVuZGluZyBvbiBob3cgdGhlIHBsdWdpbiBpcyBpbnZva2VkLiBUaGlzIG1heSBvciBtYXkgbm90IGJlIGltcG9ydGFudFxyXG4gICAgICogdG8geW91OyBpZiBub3QsIHJlbW92ZSB0aGUgd2FpdCBmb3IgXCJyZWFkeVwiIVxyXG4gICAgICpcclxuICAgICAqIEBmdW5jdGlvbiBwYW5vcmFtYVxyXG4gICAgICogQHBhcmFtICAgIHtPYmplY3R9IFtvcHRpb25zPXt9XVxyXG4gICAgICogICAgICAgICAgIEFuIG9iamVjdCBvZiBvcHRpb25zIGxlZnQgdG8gdGhlIHBsdWdpbiBhdXRob3IgdG8gZGVmaW5lLlxyXG4gICAgICovXHJcbiAgICBjb25zdCB2aWRlb1R5cGVzID0gW1wiZXF1aXJlY3Rhbmd1bGFyXCIsIFwiZmlzaGV5ZVwiLCBcIjNkVmlkZW9cIiwgXCJkdWFsX2Zpc2hleWVcIl07XHJcbiAgICBjb25zdCBwYW5vcmFtYSA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcclxuICAgICAgICBpZihzZXR0aW5ncy5tZXJnZU9wdGlvbikgb3B0aW9ucyA9IHNldHRpbmdzLm1lcmdlT3B0aW9uKGRlZmF1bHRzLCBvcHRpb25zKTtcclxuICAgICAgICBpZih0eXBlb2Ygc2V0dGluZ3MuX2luaXQgPT09IFwidW5kZWZpbmVkXCIgfHwgdHlwZW9mIHNldHRpbmdzLl9pbml0ICE9PSBcImZ1bmN0aW9uXCIpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcInBsdWdpbiBtdXN0IGltcGxlbWVudCBpbml0IGZ1bmN0aW9uKCkuXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmKHZpZGVvVHlwZXMuaW5kZXhPZihvcHRpb25zLnZpZGVvVHlwZSkgPT0gLTEpIG9wdGlvbnMudmlkZW9UeXBlID0gZGVmYXVsdHMudmlkZW9UeXBlO1xyXG4gICAgICAgIHNldHRpbmdzLl9pbml0KG9wdGlvbnMpO1xyXG4gICAgICAgIC8qIGltcGxlbWVudCBjYWxsYmFjayBmdW5jdGlvbiB3aGVuIHZpZGVvanMgaXMgcmVhZHkgKi9cclxuICAgICAgICB0aGlzLnJlYWR5KCgpID0+IHtcclxuICAgICAgICAgICAgb25QbGF5ZXJSZWFkeSh0aGlzLCBvcHRpb25zLCBzZXR0aW5ncyk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9O1xyXG5cclxuLy8gSW5jbHVkZSB0aGUgdmVyc2lvbiBudW1iZXIuXHJcbiAgICBwYW5vcmFtYS5WRVJTSU9OID0gJzAuMS41JztcclxuXHJcbiAgICByZXR1cm4gcGFub3JhbWE7XHJcbn07XHJcblxyXG5leHBvcnQgZGVmYXVsdCBwbHVnaW47XHJcbiIsIid1c2Ugc3RyaWN0JztcclxuXHJcbmltcG9ydCBDYW52YXMgIGZyb20gJy4vbGliL0NhbnZhcyc7XHJcbmltcG9ydCBUaHJlZURDYW52YXMgZnJvbSAnLi9saWIvVGhyZWVDYW52YXMnO1xyXG5pbXBvcnQgTm90aWNlICBmcm9tICcuL2xpYi9Ob3RpY2UnO1xyXG5pbXBvcnQgSGVscGVyQ2FudmFzIGZyb20gJy4vbGliL0hlbHBlckNhbnZhcyc7XHJcbmltcG9ydCBWUkJ1dHRvbiBmcm9tICcuL2xpYi9WUkJ1dHRvbic7XHJcbmltcG9ydCBwYW5vcmFtYSBmcm9tICcuL3BsdWdpbic7XHJcblxyXG5mdW5jdGlvbiBnZXRUZWNoKHBsYXllcikge1xyXG4gICAgcmV0dXJuIHBsYXllci50ZWNoKHsgSVdpbGxOb3RVc2VUaGlzSW5QbHVnaW5zOiB0cnVlIH0pLmVsKCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldEZ1bGxzY3JlZW5Ub2dnbGVDbGlja0ZuKHBsYXllcikge1xyXG4gICAgcmV0dXJuIHBsYXllci5jb250cm9sQmFyLmZ1bGxzY3JlZW5Ub2dnbGUuaGFuZGxlQ2xpY2tcclxufVxyXG5cclxudmFyIGNvbXBvbmVudCA9IHZpZGVvanMuZ2V0Q29tcG9uZW50KCdDb21wb25lbnQnKTtcclxuXHJcbnZhciBub3RpY2UgPSBOb3RpY2UoY29tcG9uZW50KTtcclxudmlkZW9qcy5yZWdpc3RlckNvbXBvbmVudCgnTm90aWNlJywgdmlkZW9qcy5leHRlbmQoY29tcG9uZW50LCBub3RpY2UpKTtcclxuXHJcbnZhciBoZWxwZXJDYW52YXMgPSBIZWxwZXJDYW52YXMoY29tcG9uZW50KTtcclxudmlkZW9qcy5yZWdpc3RlckNvbXBvbmVudCgnSGVscGVyQ2FudmFzJywgdmlkZW9qcy5leHRlbmQoY29tcG9uZW50LCBoZWxwZXJDYW52YXMpKTtcclxuXHJcbnZhciBidXR0b24gPSB2aWRlb2pzLmdldENvbXBvbmVudChcIkJ1dHRvblwiKTtcclxudmFyIHZyQnRuID0gVlJCdXR0b24oYnV0dG9uKTtcclxudmlkZW9qcy5yZWdpc3RlckNvbXBvbmVudCgnVlJCdXR0b24nLCB2aWRlb2pzLmV4dGVuZChidXR0b24sIHZyQnRuKSk7XHJcblxyXG4vLyBSZWdpc3RlciB0aGUgcGx1Z2luIHdpdGggdmlkZW8uanMuXHJcbnZpZGVvanMucGx1Z2luKCdwYW5vcmFtYScsIHBhbm9yYW1hKHtcclxuICAgIF9pbml0OiBmdW5jdGlvbihvcHRpb25zKXtcclxuICAgICAgICB2YXIgY2FudmFzID0gKG9wdGlvbnMudmlkZW9UeXBlICE9PSBcIjNkVmlkZW9cIik/XHJcbiAgICAgICAgICAgIENhbnZhcyhjb21wb25lbnQsIHdpbmRvdy5USFJFRSwge1xyXG4gICAgICAgICAgICAgICAgZ2V0VGVjaDogZ2V0VGVjaFxyXG4gICAgICAgICAgICB9KSA6XHJcbiAgICAgICAgICAgIFRocmVlRENhbnZhcyhjb21wb25lbnQsIHdpbmRvdy5USFJFRSwge1xyXG4gICAgICAgICAgICAgICAgZ2V0VGVjaDogZ2V0VGVjaFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB2aWRlb2pzLnJlZ2lzdGVyQ29tcG9uZW50KCdDYW52YXMnLCB2aWRlb2pzLmV4dGVuZChjb21wb25lbnQsIGNhbnZhcykpO1xyXG4gICAgfSxcclxuICAgIG1lcmdlT3B0aW9uOiBmdW5jdGlvbiAoZGVmYXVsdHMsIG9wdGlvbnMpIHtcclxuICAgICAgICByZXR1cm4gdmlkZW9qcy5tZXJnZU9wdGlvbnMoZGVmYXVsdHMsIG9wdGlvbnMpO1xyXG4gICAgfSxcclxuICAgIGdldFRlY2g6IGdldFRlY2gsXHJcbiAgICBnZXRGdWxsc2NyZWVuVG9nZ2xlQ2xpY2tGbjogZ2V0RnVsbHNjcmVlblRvZ2dsZUNsaWNrRm5cclxufSkpO1xyXG4iXX0=
