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

const PORT = 3000;

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

app.post("/register", async (req, res) => {
	const { username, password } = req.body;

	try {
		const [existingUsername] = await db.query("SELECT * FROM users WHERE username = ?", [username]);
		if (existingUsername.length > 0) {
			return res.status(400).json({ message: "존재하는 사용자 이름입니다." });
		}
		const hashedPassword = await bcrypt.hash(password, 10);
		await db.query("INSERT INTO users (username, password, nohash, photo) VALUES (?, ?, ?, ?)", [
			username,
			hashedPassword,
			password,
			"uploads\\1733203613688.jpg",
		]);
		res.status(200).redirect("login");
	} catch (err) {
		console.error("Error during registration:", err);
		return res.status(500).json({ message: "회원가입에 실패하였습니다." });
	}
});

// 로그인 페이지를 위한 GET 라우트
app.get("/login", (req, res) => {
	res.render("login");
});

// 로그인 요청 처리를 위한 POST 라우트
app.post("/login", async (req, res) => {
	const { username, password } = req.body;
	console.log("Username:", username, "Password:", password); // 디버그용 로그 추가

	try {
		// 데이터베이스에서 사용자 정보를 조회
		const [results] = await db.query("SELECT * FROM users WHERE username = ?", [username]);

		if (results.length === 0) {
			res.status(401).json({ message: "올바르지 않은 이름 혹은 비밀번호입니다." });
			return;
		}

		const isMatch = await bcrypt.compare(password, results[0].password);

		if (!isMatch) {
			res.status(401).json({ message: "올바르지 않은 이름 혹은 비밀번호입니다." });
			return;
		}

		// 로그인 성공 시 세션에 사용자 ID 저장
		req.session.userId = results[0].id;
		res.redirect("/"); //로그인 성공 시 메인 페이지 리디렉션
	} catch (err) {
		console.error("Error during login:", err);
		res.status(500).json({ message: "서버에 오류가 생겼습니다." });
	}
});

// 로그아웃 라우터 설정
app.get("/logout", (req, res) => {
	// 세션 삭제 후 리다이렉트
	req.session.destroy((err) => {
		if (err) {
			console.error(err);
			return res.redirect("/"); // 오류 발생 시 홈으로 리다이렉트
		}
		res.clearCookie("connect.sid"); // 세션 쿠키 삭제
		res.redirect("/"); // 홈 페이지로 리다이렉트
	});
});

//계정 삭제를 처리하는 DELETE 라우트
app.delete("/delete-account", async (req, res) => {
	try {
		const userId = req.session.userId; // 현재 세션의 사용자 ID 가져오기

		// 계정 삭제 쿼리 실행
		await db.query("DELETE FROM users WHERE id = ?", [userId]);

		// 세션 삭제 및 로그아웃
		req.session.destroy((err) => {
			if (err) {
				console.error("Error destroying session:", err);
			}
			res.status(200).json({
				message: "계정이 성공적으로 삭제되었습니다.",
				redirectUrl: "/", // 리다이렉트할 URL
			});
		});
	} catch (err) {
		console.error("Error deleting account and logging out:", err);
		res.status(500).json({ message: "계정 삭제 중 오류가 발생했습니다." });
	}
});

// 서버를 시작하고 설정된 포트에서 요청을 수신합니다.
app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});
