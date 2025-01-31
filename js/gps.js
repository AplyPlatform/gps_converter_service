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

	goToTop();
	hideLoader();
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
