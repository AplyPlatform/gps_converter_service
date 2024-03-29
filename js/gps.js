﻿/*
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


let isRecaptchaInit = false;

$(function () {
		utilInit();
		grecaptcha.ready(function () {
			isRecaptchaInit = true;			
		});
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
				GATAGM("util_address_input_key_enter", "CONTENT");
				requestGPS();  //
		}
	});

	$("#lng").keypress(function (e) {
		if (e.which == 13){
				GATAGM("util_lat_lng_input_key_enter", "CONTENT");
				requestAddress();  //
		}
	});

	setSubmitHandler("email_up");

	goToTop();
	hideLoader();
}

function setCaptcha(fd, successHandler, failHandler) {
	if (isRecaptchaInit == false) {
		grecaptcha.ready(function () {
			isRecaptchaInit = true;
			grecaptcha.execute('6LfPn_UUAAAAAN-EHnm2kRY9dUT8aTvIcfrvxGy7', { action: 'action_name' })
				.then(function (token) {
					fd.append("captcha_token", token);
					ajaxRequest(fd, successHandler, failHandler);
	
				});
		});
	}
	else {
		grecaptcha.execute('6LfPn_UUAAAAAN-EHnm2kRY9dUT8aTvIcfrvxGy7', { action: 'action_name' })
				.then(function (token) {
					fd.append("captcha_token", token);
					ajaxRequest(fd, successHandler, failHandler);	
				});
	}
}

var oldAddressVal = "";
var oldLatVal = -999;
var oldLngVal = -999;

function requestAddress() {
	let fd = new FormData();
	fd.append("action", "address_by_gps");
	
    if (isSet($("#lat").val()) == false || isSet($("#lng").val()) == false) {
		hideLoader();
		showDialog("올바른 좌표를 입력해 주세요", null);
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

	GATAGM("util_address_by_gps_btn_click", "SERVICE", oldLatVal + "," + oldLngVal);

	showLoader();
	setCaptcha(fd, function (r) {
		if(r.result == "success") {
			$("#address").val(r.data.address);
			oldAddressVal = r.data.address;
			showDialog("좌표를 주소로 변환 하였습니다.", null);
			hideLoader();				
		}
		else {
			showDialog("좌표의 변환에 오류가 발생했습니다. 다시 시도해 주세요", null);
			hideLoader();
		}
		},
		function(request,status,error) {
			hideLoader();
			showDialog("좌표의 변환에 오류가 발생했습니다. 다시 시도해 주세요", null);
		}
	);

}

function requestGPS() {
	
    if (isSet($("#address").val()) == false) {
		showDialog("올바른 주소를 입력해 주세요.", null);
	    return;
    }

	let fd = new FormData();
	fd.append("action", "gps_by_address");
	fd.append("address", encodeURI($("#address").val()));

    //같은 값으로 조회 시도
	if (oldAddressVal == $("#address").val()) {
		showDialog("이전에 조회한 주소와 동일한 주소입니다.", null);	    
		return;
	}

	oldAddressVal = $("#address").val();

	GATAGM("util_gps_by_address_btn_click", "SERVICE", oldAddressVal);

	showLoader();
	setCaptcha(fd, function (r) {
		if(r.result == "success") {
				if (r.data == null) {
					showDialog("주소를 변환하는데 실패하였습니다", null);
					return;
				}
										
				$("#lat").val(r.data.lat);
				$("#lng").val(r.data.lng);			
				$("#address").val(r.data.address);
					
				oldAddressVal = r.data.address;
				
				showDialog("주소를 좌표로 변환 하였습니다.", null);
				hideLoader();					    					    					  
		}
		else {
				hideLoader();
				showDialog("주소를 잘 못 입력하셨습니다", null);
		}
	},
	function(request,status,error) {
		hideLoader();
		showDialog("일시적인 오류가 발생하였습니다.", null);
	}
	);
}

var appSent = false;
function sendApplicationData(form_id, token)
{
	let min_type = "";
	if ($(form_id).find('input[name="min_type_1"]').is(":checked")) {
		min_type = "/서비스문의";
	}

	if ($(form_id).find('input[name="min_type_2"]').is(":checked")) {
		min_type = min_type + "/제휴및협업";
	}

	if ($(form_id).find('input[name="min_type_3"]').is(":checked")) {
		min_type = min_type + "/SW개발";
	}

	if ($(form_id).find('input[name="min_type_4"]').is(":checked")) {
		min_type = min_type + "/기타문의";
	}

	if (min_type == "") {
		showDialog("문의 종류를 선택해 주세요.", null);
		hideLoader();
		return false;
	}

	let form_content = $("#form_content").val();
	if (form_content == "") {
		showDialog("문의 내용을 입력해 주세요.", null);
		hideLoader();
		return false;
	}

	let form_phone = $(form_id).find('input[name="form_phone"]').val();
	if (form_phone == "") {
		showDialog("전화번호를 입력해 주세요.", null);
		hideLoader();
		return false;
	}

	let form_email = $(form_id).find('input[name="form_email"]').val();
	if (form_email == "") {
		showDialog("이메일을 입력해 주세요.", null);
		hideLoader();
		return false;
	}

	if ($(form_id).find("#agree_1").length > 0 && $(form_id).find("#agree_1").is(":checked") == false) {
		showDialog("개인정보 처리방침에 동의해주세요.", null);
		hideLoader();
		return false;
	}	
	
	let ref = $('<input type="hidden" value="' + document.referrer + '" name="ref">');	
	$(form_id).append(ref);	
	ref = $('<input type="hidden" value="' + min_type + '" name="min_type">');	
	$(form_id).append(ref);	
	ref = $('<input type="hidden" value="gpscontact" name="form_kind">');	
	$(form_id).append(ref);

	if (isRecaptchaInit == false) {
		grecaptcha.ready(function() {
			isRecaptchaInit = true;

			grecaptcha.execute('6LfPn_UUAAAAAN-EHnm2kRY9dUT8aTvIcfrvxGy7', {action: 'homepage'}).then(function(token) {
				$(form_id).find('input[name="form_token"]').val(token);
				let fed = new FormData($(form_id)[0]);
				ajaxRequestForContact(form_id, fed);
			});
		});
	}
	else {
		grecaptcha.execute('6LfPn_UUAAAAAN-EHnm2kRY9dUT8aTvIcfrvxGy7', {action: 'homepage'}).then(function(token) {
			$(form_id).find('input[name="form_token"]').val(token);
			let fed = new FormData($(form_id)[0]);
			ajaxRequestForContact(form_id, fed);
		});
	}
	
}

function ajaxRequestForContact(form_id, fed) {
	$.ajax({
		type: "POST",
		url: 'https://aply.biz/contact/handler.php',
		crossDomain: true,
		dataType: "json",
		data:fed,
		enctype: 'multipart/form-data', // 필수
		processData: false,
		contentType: false,
		cache: false,
		success: function (data) {
			hideLoader();
			if (data.result == "success") {
				$(form_id + " input").last().remove();
				showDialog("전송이 완료되었습니다. APLY가 연락 드리겠습니다.", function() {
					location.href="/index.html";
				});
				return;
			}
			else {				
				showDialog("오류가 발생하였습니다. 잠시 후 다시 시도해 주세요.", null);
				return;
			}
		},
		error: function(jqXHR, text, error){
			showDialog("죄송합니다, 일시적인 오류가 발생하였습니다. 다시 시도 부탁드립니다.", null);
			hideLoader();
		}
	});
}

function showPrivacyDialog() {	
	$('#modal_title_content').text("APLY 개인정보처리방침");
    $('#modal_body_content').load("privacy_for_email.html");
    $('#modal-3').modal('show');
}

function validateNumber(event) {
    var key = window.event ? event.keyCode : event.which;
    if (event.keyCode === 8 || event.keyCode === 46) {
        return true;
    } else if ( key < 48 || key > 57 ) {
        return false;
    } else {
        return true;
    }
}


function setSubmitHandler(form_p_id) {
	var form_id = "#" + form_p_id;

	$(form_id + "_send").on("click", function(e) {
		e.preventDefault();

		if (appSent == true) {
			if (confirm('이미 전송한 내용이 있습니다. 다시 진행 하시겠습니까?')) {	}
			else {
			  return;
			}
		}

		showLoader();

		sendApplicationData(form_id);				
	});

	$('[name^=form_phone]').keypress(validateNumber);
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

function GATAGM(event_name, category, label) {    
    gtag(
        'event', event_name, {
        'event_category': category,
        'event_label': label        
    }
    );
}

function showDialog(msg, callback) {
	$('#askModalContent').text(msg);
	$('#askModal').modal('show');

	if (callback == null) return;

	$('#askModalOKButton').off('click');
	$('#askModalOKButton').click(function () {
			$('#askModal').modal('hide');
			callback();
	});
}


function isSet(value) {
    if (typeof (value) === 'number')
        return true;
    if (value == "" || value == null || value == "undefined" || value == undefined)
        return false;
    return true;
}
