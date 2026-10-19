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

// 위도·경도 입력 해석 / 표기 변환 (십진수 ↔ 도분초)
// 예) "37.5665", "37°33'59.4\"N", "N 37 33 59.4", "37도 33분 59.4초", "126°58'40.8\"E"
var GpsCoord = (function () {

	// axis: "lat" | "lng". 해석할 수 없거나 범위를 벗어나면 NaN
	function parse(input, axis) {
		if (input == null) return NaN;
		var s = String(input).trim().toUpperCase();
		if (s == "") return NaN;

		var max = axis == "lat" ? 90 : 180;

		// 십진수
		if (/^[+-]?\d+(\.\d+)?$/.test(s)) {
			var v = parseFloat(s);
			return Math.abs(v) <= max ? v : NaN;
		}

		// 방향 문자 (N/S/E/W, 북/남/동/서)
		var sign = 1;
		var hemi = s.match(/[NSEW북남동서]/g);
		if (hemi != null) {
			if (hemi.length > 1) return NaN;
			var h = hemi[0];
			var isLatHemi = (h == "N" || h == "S" || h == "북" || h == "남");
			if ((axis == "lat") != isLatHemi) return NaN;
			if (h == "S" || h == "W" || h == "남" || h == "서") sign = -1;
			s = s.replace(/[NSEW북남동서]|위|경|도(?=\s|$)/g, " ");
		}
		if (/^\s*-/.test(s)) {
			sign = -sign;
			s = s.replace(/^\s*-/, "");
		}

		// 도·분·초 숫자만 추출 (기호: ° ' " ′ ″ 도 분 초, 공백)
		if (/[^\d.\s°'"′″도분초:]/.test(s.replace(/,/g, " "))) return NaN;
		var parts = s.replace(/,/g, " ").match(/\d+(\.\d+)?/g);
		if (parts == null || parts.length > 3) return NaN;

		var deg = parseFloat(parts[0]);
		var min = parts.length > 1 ? parseFloat(parts[1]) : 0;
		var sec = parts.length > 2 ? parseFloat(parts[2]) : 0;
		if (min >= 60 || sec >= 60) return NaN;
		if (parts.length > 1 && parts[0].indexOf(".") > -1) return NaN;	// 분이 있으면 도는 정수
		if (parts.length > 2 && parts[1].indexOf(".") > -1) return NaN;	// 초가 있으면 분은 정수

		var value = sign * (deg + min / 60 + sec / 3600);
		return Math.abs(value) <= max ? value : NaN;
	}

	// 십진수 → 도분초 문자열. secDigits: 초의 소수 자리수
	function toDms(value, axis, secDigits) {
		if (secDigits == null) secDigits = 1;
		var hemi = axis == "lat" ? (value < 0 ? "S" : "N") : (value < 0 ? "W" : "E");
		var abs = Math.abs(value);
		var deg = Math.floor(abs);
		var minFloat = (abs - deg) * 60;
		var min = Math.floor(minFloat);
		var sec = (minFloat - min) * 60;

		// 반올림으로 60초 / 60분이 되는 경우 올림 처리
		var p = Math.pow(10, secDigits);
		sec = Math.round(sec * p) / p;
		if (sec >= 60) { sec = 0; min += 1; }
		if (min >= 60) { min = 0; deg += 1; }

		return deg + "°" + min + "'" + sec.toFixed(secDigits) + "\"" + hemi;
	}

	function round6(value) {
		return Math.round(value * 1000000) / 1000000;
	}

	return { parse: parse, toDms: toDms, round6: round6 };
})();

if (typeof module !== "undefined") module.exports = GpsCoord;
