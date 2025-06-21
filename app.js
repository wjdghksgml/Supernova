// 필요한 모듈을 가져옵니다.
const express = require("express");
const bcrypt = require("bcryptjs");

const session = require("express-session"); // 사용자 세션 관리를 위한 express-session 모듈
require("dotenv").config(); // .env 파일에서 환경 변수를 불러옵니다.

//파일 업로드 기능을 위한 미들웨어
const multer = require("multer"); // multer 모듈 추가
const path = require("path");

// Express 애플리케이션을 초기화합니다.
const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// JSON 및 URL-encoded 데이터 파싱 미들웨어를 추가합니다.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 화면 엔진을 EJS로 설정하여 템플릿을 렌더링합니다.
app.set("view engine", "ejs");

// 정적 파일 경로 설정
app.use("/public", express.static("public"));

app.use(
	session({
		secret: "your_secret_key", // 비밀 키 설정
		resave: false,
		saveUninitialized: true,
		cookie: { secure: false }, // HTTPS 환경에서 secure: true 설정
	})
);

// Multer 파일 업로드 설정
const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, "uploads/"); // 파일 저장 경로
	},
	filename: (req, file, cb) => {
		cb(null, Date.now() + path.extname(file.originalname)); // 파일 이름 설정
	},
});
const upload = multer({ storage: storage }); // multer 설정 완료
const moment = require("moment"); // moment 모듈 가져오기 (시간 포맷을 위한)

// 인증 확인 미들웨어
function isAuthenticated(req, res, next) {
	if (req.session.userId) {
		return next();
	}
	res.status(401).send("You need to log in");
}

// 날짜 포맷 함수 추가
function formatDate(dateString) {
	const date = new Date(dateString);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0"); // 월 2자리 포맷
	const day = String(date.getDate()).padStart(2, "0"); // 일 2자리 포맷
	return `${year}년 ${month}월 ${day}일`;
}

// 시간 차이 계산 함수 (서버에서 처리)
function timeAgo(createdAt) {
	const now = new Date();
	const diffInSeconds = Math.floor((now - new Date(createdAt)) / 1000);
	const diffInMinutes = Math.floor(diffInSeconds / 60);
	const diffInHours = Math.floor(diffInMinutes / 60);
	const diffInDays = Math.floor(diffInHours / 24);

	if (diffInMinutes < 1) {
		return "방금 전";
	} else if (diffInMinutes < 60) {
		return `${diffInMinutes}분 전`;
	} else if (diffInHours < 24) {
		return `${diffInHours}시간 전`;
	} else {
		return `${diffInDays}일 전`;
	}
}

// 시간 표기 함수 수정
function formatTime(createdAt, format = "YYYY-MM-DD HH:mm") {
	return moment(createdAt).format(format);
}

//메인 페이지
app.get("/", (req, res) => {
	res.render("index");
});

//회원가입 페이지를 위한 GET 라우트
app.get("/register", (req, res) => {
	res.render("register");
});

// 로그인 페이지를 위한 GET 라우트
app.get("/login", (req, res) => {
	res.render("login");
});

// 서버를 시작하고 설정된 포트에서 요청을 수신합니다.
app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});
