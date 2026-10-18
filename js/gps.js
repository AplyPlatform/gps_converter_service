/*
Copyright 2021 APLY Inc. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
  http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/


$(function () {
		utilInit();		
});

var goToTop = function() {
	$('.js-gotop').on('click', function(event){

		event.preventDefault();

		$('html, body').animate({
			scrollTop: $('html').offset().top
		}, 500, 'easeInOutExpo');

		return false;
	});

	$(window).scroll(function(){

		var $win = $(window);
		if ($win.scrollTop() > 200) {
			$('.js-top').addClass('active');
		} else {
			$('.js-top').removeClass('active');
		}

	});
};


function showLoader() {
	$("#loading").show();
}

function hideLoader() {
	$("#loading").fadeOut(800);
}

function utilInit() {

	showLoader();
	
	$("#address").keypress(function (e) {
		if (e.which == 13){
				AAPI_GA_EVENT("util_address_input_key_enter", "GPS", "");
				requestGPS();  //
		}
	});

	$("#lng").keypress(function (e) {
		if (e.which == 13){
				AAPI_GA_EVENT("util_lat_lng_input_key_enter", "GPS", "");
				requestAddress();  //
		}
	});	

	AAPI_setContactForm("gpscontact");

	initMap();
	initLocationQR();

	goToTop();
	hideLoader();

	loadLocationFromUrl();
}

// QR 코드로 접속한 경우 (?lat=..&lng=..) 해당 좌표를 바로 변환해 지도에 표시
function loadLocationFromUrl() {
	var params = new URLSearchParams(window.location.search);
	var lat = parseFloat(params.get("lat"));
	var lng = parseFloat(params.get("lng"));
	if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;

	$("#lat").val(lat);
	$("#lng").val(lng);

	// 이미 QR 이 만들어진 위치이므로 같은 좌표로 QR 을 다시 만들지 않음
	lastQRLocation = makeQRLocationKey(lat, lng);

	AAPI_GA_EVENT("util_location_from_qr", "GPS", lat + "," + lng);
	requestAddress();
}

var gpsMap = null;
var gpsMarker = null;
var gpsMarkerSource = null;

var MARKER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">'
	+ '<path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 28 16 28s16-16 16-28C32 7.16 24.84 0 16 0z" fill="#e74c3c" stroke="#fff" stroke-width="2"/>'
	+ '<circle cx="16" cy="16" r="6" fill="#fff"/></svg>';

function initMap() {
	gpsMarker = new ol.Feature();
	gpsMarker.setStyle(new ol.style.Style({
		image: new ol.style.Icon({
			src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(MARKER_SVG),
			anchor: [0.5, 1]
		})
	}));

	gpsMarkerSource = new ol.source.Vector();

	var tileLayer = new ol.layer.Tile({ source: createOsmSource() });
	watchTileErrors(tileLayer);

	gpsMap = new ol.Map({
		target: 'gpsMap',
		// 더블 클릭은 마커 이동에 사용하므로 기본 더블 클릭 줌은 끔
		interactions: ol.interaction.defaults({ doubleClickZoom: false }),
		layers: [
			tileLayer,
			new ol.layer.Vector({ source: gpsMarkerSource })
		],
		view: new ol.View({
			center: ol.proj.fromLonLat([126.9780, 37.5665]),
			zoom: 12
		})
	});

	// 마커 드래그
	gpsMarkerTranslate = new ol.interaction.Translate({ features: new ol.Collection([gpsMarker]) });
	var dragStartCoordinate = null;
	gpsMarkerTranslate.on('translatestart', function () {
		dragStartCoordinate = gpsMarker.getGeometry().getCoordinates().slice();
	});
	gpsMarkerTranslate.on('translateend', function (e) {
		onMarkerMoved(e.coordinate, dragStartCoordinate);
	});
	gpsMap.addInteraction(gpsMarkerTranslate);

	// 지도 더블 클릭 시 마커 이동 (마커가 아직 없을 때 배치 용도 포함)
	gpsMap.on('dblclick', function (e) {
		if (isMarkerMoveLocked()) {
			AAPI_showDialog(getMarkerMoveLockMessage());
			return;
		}
		if (gpsMap.hasFeatureAtPixel(e.pixel)) return;
		var prevCoordinate = null;
		if (gpsMarkerSource.getFeatures().length == 0) gpsMarkerSource.addFeature(gpsMarker);
		else prevCoordinate = gpsMarker.getGeometry().getCoordinates().slice();
		gpsMarker.setGeometry(new ol.geom.Point(e.coordinate));
		onMarkerMoved(e.coordinate, prevCoordinate);
	});

	gpsMap.on('pointermove', function (e) {
		if (e.dragging) return;
		gpsMap.getTargetElement().style.cursor = (!isMarkerMoveLocked() && gpsMap.hasFeatureAtPixel(e.pixel)) ? 'move' : '';
	});

	// 제한 중에 마커를 끌려고 하면 안내
	gpsMap.on('pointerdown', function (e) {
		if (isMarkerMoveLocked() && gpsMap.hasFeatureAtPixel(e.pixel)) AAPI_showDialog(getMarkerMoveLockMessage());
	});

	loadMarkerLimitStatus();
}

// ===== 마커 이동 횟수 제한 =====
// 제한은 서버가 IP 기준으로 판단한다. 화면은 서버가 알려준 상태로 드래그/더블 클릭을 막고 안내만 한다.

var gpsMarkerTranslate = null;
var markerMoveLimit = null;		// { limit, remaining, lockedUntil(ms) } - 서버 응답 전이면 null
var markerMoveUnlockTimer = null;

// 서버 응답의 marker_limit 반영. 시계 차이를 피하려고 남은 초 기준으로 해제 시각 계산
function applyMarkerLimitInfo(info) {
	if (info == null) return;
	markerMoveLimit = {
		limit: parseInt(info.limit, 10) || 0,
		remaining: parseInt(info.remaining, 10) || 0,
		lockedUntil: info.locked ? Date.now() + (parseInt(info.lock_remaining_sec, 10) || 0) * 1000 : 0
	};
	refreshMarkerMoveLimit();
}

function loadMarkerLimitStatus() {
	let fd = new FormData();
	fd.append("action", "marker_limit_status");
	ajaxRequest(fd, function (r) {
		if (r.result == "success" && r.data != null) applyMarkerLimitInfo(r.data.marker_limit);
	}, function () {});
}

function isMarkerMoveLocked() {
	return markerMoveLimit != null && markerMoveLimit.lockedUntil > Date.now();
}

function formatUnlockTime(time) {
	var d = new Date(time);
	var hh = ("0" + d.getHours()).slice(-2);
	var mm = ("0" + d.getMinutes()).slice(-2);
	var sameDay = d.toDateString() == new Date().toDateString();
	return (sameDay ? "" : (d.getMonth() + 1) + "월 " + d.getDate() + "일 ") + hh + ":" + mm;
}

function getMarkerMoveLockMessage() {
	return "마커 이동은 " + markerMoveLimit.limit + "회까지 사용할 수 있습니다.<br>"
		+ formatUnlockTime(markerMoveLimit.lockedUntil) + " 이후에 다시 이용해 주세요.";
}

// 드래그 가능 여부, 안내 문구, 해제 타이머 갱신
function refreshMarkerMoveLimit() {
	var locked = isMarkerMoveLocked();

	if (gpsMarkerTranslate != null) gpsMarkerTranslate.setActive(!locked);

	var $status = $("#markerMoveStatus");
	if (locked) {
		$status.addClass("is-locked").text("마커 이동 횟수를 모두 사용했습니다. " + formatUnlockTime(markerMoveLimit.lockedUntil) + " 이후에 다시 이용할 수 있습니다.");
	}
	else {
		$status.removeClass("is-locked").text("");
	}

	// 해제 시각이 지나면 서버 상태를 다시 읽어 옴
	clearTimeout(markerMoveUnlockTimer);
	if (locked) markerMoveUnlockTimer = setTimeout(function () {
		refreshMarkerMoveLimit();
		loadMarkerLimitStatus();
	}, Math.max(markerMoveLimit.lockedUntil - Date.now(), 0) + 1000);
}

// 서버가 이동을 거부했을 때 마커를 이동 전 위치로 되돌림
function restoreMarker(prevCoordinate) {
	if (prevCoordinate != null) gpsMarker.setGeometry(new ol.geom.Point(prevCoordinate));
	else gpsMarkerSource.removeFeature(gpsMarker);
}

// OSM 타일 사용 정책상 Referer 가 필요하므로 no-referrer 환경에서도 origin 을 보내도록 지정
function referrerTileLoad(tile, src) {
	var img = tile.getImage();
	img.referrerPolicy = 'strict-origin-when-cross-origin';
	img.src = src;
}

function createOsmSource() {
	// OSM 이 권장하는 단일 호스트 사용 (a/b/c 서브도메인은 deprecated)
	return new ol.source.OSM({
		url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
		tileLoadFunction: referrerTileLoad
	});
}

// OSM 타일이 계속 실패(403 등)하면 OSM France 의 HOT 타일 서버로 전환 (한글 라벨 지원)
function createFallbackSource() {
	return new ol.source.XYZ({
		url: 'https://{a-c}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
		attributions: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors, tiles by <a href="https://www.hotosm.org/" target="_blank">HOT</a> hosted by <a href="https://www.openstreetmap.fr/" target="_blank">OSM France</a>',
		crossOrigin: 'anonymous',
		maxZoom: 20,
		tileLoadFunction: referrerTileLoad
	});
}

function watchTileErrors(tileLayer) {
	var errorCount = 0;
	var loadCount = 0;
	var source = tileLayer.getSource();
	var onLoad = function () { loadCount++; };
	var onError = function () {
		errorCount++;
		if (loadCount == 0 && errorCount >= 3) {
			source.un('tileloadend', onLoad);
			source.un('tileloaderror', onError);
			tileLayer.setSource(createFallbackSource());
		}
	};
	source.on('tileloadend', onLoad);
	source.on('tileloaderror', onError);
}

function revealMap() {
	var $wrap = $(".gps-map-wrap");
	if (!$wrap.hasClass("is-visible")) {
		$wrap.addClass("is-visible");
		gpsMap.updateSize();
	}

	$('html, body').stop().animate({
		scrollTop: $(".gps-card").offset().top - 16
	}, 500, 'easeInOutExpo');
}

function showLocationOnMap(lat, lng) {
	lat = lat * 1;
	lng = lng * 1;
	if (gpsMap == null || isNaN(lat) || isNaN(lng)) return;

	revealMap();

	var coord = ol.proj.fromLonLat([lng, lat]);
	if (gpsMarkerSource.getFeatures().length == 0) gpsMarkerSource.addFeature(gpsMarker);
	gpsMarker.setGeometry(new ol.geom.Point(coord));
	gpsMap.getView().animate({ center: coord, zoom: Math.max(gpsMap.getView().getZoom(), 16), duration: 500 });
}

function onMarkerMoved(coordinate, prevCoordinate) {
	$("#mapLocationNotice").html("");

	var prevLat = $("#lat").val();
	var prevLng = $("#lng").val();

	var lonLat = ol.proj.toLonLat(coordinate);
	var lat = Math.round(lonLat[1] * 1000000) / 1000000;
	var lng = Math.round(lonLat[0] * 1000000) / 1000000;

	$("#lat").val(lat);
	$("#lng").val(lng);

	AAPI_GA_EVENT("util_map_marker_moved", "GPS", lat + "," + lng);

	let fd = new FormData();
	fd.append("action", "address_by_gps");
	fd.append("lat", lat);
	fd.append("lng", lng);
	fd.append("source", "marker");		// 서버가 IP 기준 이동 횟수를 셈

	showLoader();
	setCaptcha(fd, function (r) {
		hideLoader();
		if (r.data != null) applyMarkerLimitInfo(r.data.marker_limit);

		// 서버가 이동 제한 중이라고 응답하면 이동을 취소
		if (r.result != "success" && r.message == "marker_move_locked") {
			restoreMarker(prevCoordinate);
			$("#lat").val(prevLat);
			$("#lng").val(prevLng);
			if (isMarkerMoveLocked()) AAPI_showDialog(getMarkerMoveLockMessage());
			return;
		}

		// 이번 이동으로 제한에 도달했으면 모달에 안내
		if (isMarkerMoveLocked()) $("#mapLocationNotice").html(getMarkerMoveLockMessage());

		var address = null;
		if (r.result == "success" && r.data != null && AAPI_isSet(r.data.address)) {
			address = r.data.address;
			$("#address").val(address);
			oldAddressVal = address;
			oldLatVal = lat;
			oldLngVal = lng;
			generateLocationQR(lat, lng);
		}
		showMapLocationModal(lat, lng, address);
	},
	function (request, status, error) {
		hideLoader();
		showMapLocationModal(lat, lng, null);
	});
}

function showMapLocationModal(lat, lng, address) {
	$("#mapLocationLat").text(lat);
	$("#mapLocationLng").text(lng);
	$("#mapLocationAddress").text(address != null ? address : "해당 위치의 주소를 찾을 수 없습니다.");
	$("#mapLocationAddressCopy").prop("disabled", address == null);
	$("#mapLocationModal .copy-btn").removeClass("is-copied").html(COPY_ICON_SVG);
	$("#mapLocationModal").modal('show');
}

var COPY_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
var COPIED_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

function copyText(text, onSuccess) {
	if (navigator.clipboard && window.isSecureContext) {
		navigator.clipboard.writeText(text).then(onSuccess, function () { copyTextFallback(text, onSuccess); });
		return;
	}
	copyTextFallback(text, onSuccess);
}

// http 환경 등 Clipboard API 를 쓸 수 없을 때
function copyTextFallback(text, onSuccess) {
	var $temp = $("<textarea readonly>").css({ position: "fixed", top: 0, left: "-9999px" }).val(text).appendTo("body");
	$temp[0].select();
	var ok = false;
	try { ok = document.execCommand("copy"); } catch (e) {}
	$temp.remove();
	if (ok) onSuccess();
	else AAPI_showDialog("복사하지 못했습니다. 직접 선택하여 복사해 주세요.");
}

$(document).on("click", ".copy-btn[data-copy-target]", function () {
	var $btn = $(this);
	var text = $($btn.data("copy-target")).text();
	if (!AAPI_isSet(text)) return;

	copyText(text, function () {
		$btn.addClass("is-copied").html(COPIED_ICON_SVG);
		clearTimeout($btn.data("copy-timer"));
		$btn.data("copy-timer", setTimeout(function () {
			$btn.removeClass("is-copied").html(COPY_ICON_SVG);
		}, 1500));
	});
	AAPI_GA_EVENT("util_map_modal_copy_click", "GPS", $btn.data("copy-target"));
});

// ===== 위치 QR 코드 (qr.aply.biz 와 같은 백엔드 사용) =====

var QR_API_HANDLER = "https://aplx.link/qr/handler.php";
var GPS_SITE_URL = "https://gps.aply.biz/";

var gpsQRCode = null;
var lastQRLocation = "";
var currentQRId = "";

function initLocationQR() {
	// 다운로드용으로 크게 만들고 화면에는 CSS 로 축소해 표시
	gpsQRCode = new QRCodeStyling({
		width: 640,
		height: 640,
		type: "canvas",
		data: GPS_SITE_URL,
		dotsOptions: { color: "#000000", type: "extra-rounded" },
		backgroundOptions: { color: "#ffffff" },
		qrOptions: { errorCorrectionLevel: "L" },
		cornersSquareOptions: { type: "extra-rounded" },
		cornersDotOptions: { type: "dot" }
	});
	gpsQRCode.append(document.getElementById("gpsQRImage"));

	$("#gpsQRArea .copy-btn").html(COPY_ICON_SVG);

	$("#btnDownloadQR").click(function () {
		AAPI_GA_EVENT("util_qr_download_click", "GPS", currentQRId);
		gpsQRCode.download({ name: "GPS_QR_" + (currentQRId != "" ? currentQRId : "location"), extension: "png" });
	});
}

function makeQRLocationKey(lat, lng) {
	return (Math.round(lat * 1000000) / 1000000) + "," + (Math.round(lng * 1000000) / 1000000);
}

// 변환이 완료된 좌표로 고유 QR 코드와 단축 주소를 생성
function generateLocationQR(lat, lng) {
	lat = Math.round(lat * 1000000) / 1000000;
	lng = Math.round(lng * 1000000) / 1000000;
	if (isNaN(lat) || isNaN(lng)) return;

	// 같은 위치로 이미 생성했거나 생성 중이면 다시 요청하지 않음
	var key = makeQRLocationKey(lat, lng);
	if (key == lastQRLocation) return;
	lastQRLocation = key;

	var targetUrl = GPS_SITE_URL + "?lat=" + lat + "&lng=" + lng;

	let fd = new FormData();
	fd.append("act", "set");
	fd.append("kind", "url");
	fd.append("val", targetUrl);
	fd.append("ssid", "");
	fd.append("password", "");
	fd.append("hidden", "N");
	fd.append("enc", "");
	fd.append("ref", document.referrer);

	$("#gpsQRStatus").text("");
	$("#gpsQRArea").addClass("is-visible is-loading");

	var onFail = function (message) {
		if (key != lastQRLocation) return;
		lastQRLocation = "";
		$("#gpsQRArea").removeClass("is-loading");
		$("#gpsQRShortUrl").text("").attr("href", "#");
		currentQRId = "";
		$("#gpsQRStatus").text(message);
	};

	AAPI_getCaptchaToken(function (token) {
		fd.append("form_token", token);
		$.ajax({
			url: QR_API_HANDLER,
			type: "POST",
			dataType: "json",
			enctype: "multipart/form-data",
			processData: false,
			cache: false,
			contentType: false,
			data: fd,
			success: function (r) {
				// 응답 전에 다른 위치로 바뀌었으면 무시
				if (key != lastQRLocation) return;

				if (r == null || r.result != "success" || r.data == null) {
					onFail(r != null && AAPI_isSet(r.message) ? r.message : "QR 코드를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.");
					return;
				}

				var shortUrl = AAPI_isSet(r.data.short_url) ? r.data.short_url : targetUrl;
				currentQRId = AAPI_isSet(r.data.qr_id) ? r.data.qr_id : "";

				gpsQRCode.update({ data: shortUrl });
				$("#gpsQRShortUrl").text(shortUrl).attr("href", shortUrl);
				$("#gpsQRArea .copy-btn").removeClass("is-copied").html(COPY_ICON_SVG);
				$("#gpsQRArea").removeClass("is-loading");

				AAPI_GA_EVENT("util_qr_generated", "GPS", key);
			},
			error: function () {
				onFail("QR 코드를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.");
			}
		});
	});
}

function setCaptcha(fd, successHandler, failHandler) {
	AAPI_getCaptchaToken(function(token) {
		fd.append("form_token", token);
		ajaxRequest(fd, successHandler, failHandler);
	});
}

var oldAddressVal = "";
var oldLatVal = -999;
var oldLngVal = -999;

// 브라우저 Geolocation API 로 현재 위치를 읽어 GPS -> 주소 변환까지 수행
function requestCurrentLocation() {
	if (!navigator.geolocation) {
		AAPI_showDialog("이 브라우저는 위치 정보 기능을 지원하지 않습니다.");
		return;
	}

	if (!window.isSecureContext) {
		AAPI_showDialog("위치 정보는 보안 연결(https)에서만 사용할 수 있습니다.");
		return;
	}

	AAPI_GA_EVENT("util_current_location_btn_click", "GPS", "");

	var $btn = $("#btnGetCurrentLocation");
	$btn.prop("disabled", true);
	showLoader();

	navigator.geolocation.getCurrentPosition(function (position) {
		$btn.prop("disabled", false);

		$("#lat").val(Math.round(position.coords.latitude * 1000000) / 1000000);
		$("#lng").val(Math.round(position.coords.longitude * 1000000) / 1000000);

		// 이전 조회 좌표와 같아도 항상 변환하도록 초기화
		oldLatVal = -999;
		oldLngVal = -999;
		requestAddress();
	},
	function (error) {
		$btn.prop("disabled", false);
		hideLoader();

		var message = "현재 위치를 가져오지 못했습니다. 다시 시도해 주세요.";
		if (error.code == error.PERMISSION_DENIED) message = "위치 정보 접근 권한이 거부되었습니다. 브라우저 설정에서 위치 권한을 허용해 주세요.";
		else if (error.code == error.POSITION_UNAVAILABLE) message = "현재 위치 정보를 확인할 수 없습니다.";
		else if (error.code == error.TIMEOUT) message = "위치 정보를 가져오는 시간이 초과되었습니다. 다시 시도해 주세요.";
		AAPI_showDialog(message);
	},
	{ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}

// 서버가 오늘 변환 한도를 넘었다고 응답했는지
function isConvertLimitExceeded(r) {
	return r != null && r.result != "success" && r.message == "convert_limit_exceeded";
}

function showConvertLimitDialog(r) {
	var limit = (r.data != null && r.data.convert_limit != null) ? r.data.convert_limit.limit : "";
	AAPI_showDialog("오늘 사용할 수 있는 변환 횟수(" + limit + "회)를 모두 사용했습니다.<br>내일 다시 이용해 주세요.");
}

function requestAddress() {
	let fd = new FormData();
	fd.append("action", "address_by_gps");
	
    if (AAPI_isSet($("#lat").val()) == false || AAPI_isSet($("#lng").val()) == false) {
		hideLoader();
		AAPI_showDialog("올바른 좌표를 입력해 주세요");
		return;
    }

	//같은 값으로 조회 시도
	if (oldLatVal == ($("#lat").val() * 1) && oldLngVal == ($("#lng").val() * 1)) {
		hideLoader();
		return;
	}

	fd.append("lat", $("#lat").val() * 1);
	fd.append("lng", $("#lng").val() * 1);

	oldLatVal = $("#lat").val() * 1;
	oldLngVal = $("#lng").val() * 1;

	AAPI_GA_EVENT("util_address_by_gps_btn_click", "GPS", oldLatVal + "," + oldLngVal);

	showLoader();
	setCaptcha(fd, function (r) {
		if(r.result == "success") {
			$("#address").val(r.data.address);
			oldAddressVal = r.data.address;
			showLocationOnMap(oldLatVal, oldLngVal);
			AAPI_showDialog("좌표를 주소로 변환 하였습니다.");
			hideLoader();
			generateLocationQR(oldLatVal, oldLngVal);				
		}
		else if (isConvertLimitExceeded(r)) {
			// 같은 좌표로 다시 시도할 수 있도록 초기화
			oldLatVal = -999;
			oldLngVal = -999;
			hideLoader();
			showConvertLimitDialog(r);
		}
		else {
			AAPI_showDialog("좌표의 변환에 오류가 발생했습니다. 다시 시도해 주세요");
			hideLoader();
		}
		},
		function(request,status,error) {
			hideLoader();
			AAPI_showDialog("좌표의 변환에 오류가 발생했습니다. 다시 시도해 주세요");
		}
	);

}

function requestGPS() {
	
    if (AAPI_isSet($("#address").val()) == false) {
		AAPI_showDialog("올바른 주소를 입력해 주세요.");
	    return;
    }

	let fd = new FormData();
	fd.append("action", "gps_by_address");
	fd.append("address", encodeURI($("#address").val()));

    //같은 값으로 조회 시도
	if (oldAddressVal == $("#address").val()) {
		AAPI_showDialog("이전에 조회한 주소와 동일한 주소입니다.");
		return;
	}

	oldAddressVal = $("#address").val();

	AAPI_GA_EVENT("util_gps_by_address_btn_click", "GPS", oldAddressVal);

	showLoader();
	setCaptcha(fd, function (r) {
		if(r.result == "success") {
				if (r.data == null) {
					AAPI_showDialog("주소를 변환하는데 실패하였습니다");
					return;
				}
										
				$("#lat").val(r.data.lat);
				$("#lng").val(r.data.lng);			
				$("#address").val(r.data.address);
					
				oldAddressVal = r.data.address;
				oldLatVal = r.data.lat * 1;
				oldLngVal = r.data.lng * 1;
				showLocationOnMap(r.data.lat, r.data.lng);

				AAPI_showDialog("주소를 좌표로 변환 하였습니다.");
				hideLoader();
				generateLocationQR(r.data.lat, r.data.lng);					    					    					  
		}
		else if (isConvertLimitExceeded(r)) {
				// 같은 주소로 다시 시도할 수 있도록 초기화
				oldAddressVal = "";
				hideLoader();
				showConvertLimitDialog(r);
		}
		else {
				hideLoader();
				AAPI_showDialog("주소를 잘 못 입력하셨습니다");
		}
	},
	function(request,status,error) {
		hideLoader();
		AAPI_showDialog("일시적인 오류가 발생하였습니다.");
	}
	);
}

function ajaxRequest(data, callback, errorcallback) {		
	$.ajax({
		type: 'POST',
		enctype: 'multipart/form-data',
		url: 'https://aply.biz/gps/handler.php',
		data: data,
		cache: false,
		processData: false,
		contentType: false,
		success: function (r) {
            if (r.result != "success" && r.result_code == 1) {
                alert("오류가 발생하였습니다. 잠시 후 다시 시도해 주세요.");
                return;
            }

            callback(r);
        },
        error: function (request, status, error) {            
            errorcallback(request, status, error);
        }
	});
}
