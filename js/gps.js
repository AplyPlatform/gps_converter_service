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

	goToTop();
	hideLoader();
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
	var translate = new ol.interaction.Translate({ features: new ol.Collection([gpsMarker]) });
	translate.on('translateend', function (e) {
		onMarkerMoved(e.coordinate);
	});
	gpsMap.addInteraction(translate);

	// 지도 더블 클릭 시 마커 이동 (마커가 아직 없을 때 배치 용도 포함)
	gpsMap.on('dblclick', function (e) {
		if (gpsMap.hasFeatureAtPixel(e.pixel)) return;
		if (gpsMarkerSource.getFeatures().length == 0) gpsMarkerSource.addFeature(gpsMarker);
		gpsMarker.setGeometry(new ol.geom.Point(e.coordinate));
		onMarkerMoved(e.coordinate);
	});

	gpsMap.on('pointermove', function (e) {
		if (e.dragging) return;
		gpsMap.getTargetElement().style.cursor = gpsMap.hasFeatureAtPixel(e.pixel) ? 'move' : '';
	});
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

function onMarkerMoved(coordinate) {
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

	showLoader();
	setCaptcha(fd, function (r) {
		hideLoader();
		var address = null;
		if (r.result == "success" && r.data != null && AAPI_isSet(r.data.address)) {
			address = r.data.address;
			$("#address").val(address);
			oldAddressVal = address;
			oldLatVal = lat;
			oldLngVal = lng;
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

$(document).on("click", "#mapLocationModal .copy-btn", function () {
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

function setCaptcha(fd, successHandler, failHandler) {
	AAPI_getCaptchaToken(function(token) {
		fd.append("form_token", token);
		ajaxRequest(fd, successHandler, failHandler);
	});
}

var oldAddressVal = "";
var oldLatVal = -999;
var oldLngVal = -999;

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
