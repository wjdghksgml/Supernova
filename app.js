// 필요한 모듈을 가져옵니다.
const express = require("express");

const session = require("express-session"); // 사용자 세션 관리를 위한 express-session 모듈
require("dotenv").config(); // .env 파일에서 환경 변수를 불러옵니다.

//파일 업로드 기능을 위한 미들웨어
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

// 모든 라우터 전에 sessionId를 res.locals에 설정
app.use((req, res, next) => {
	res.locals.sessionId = req.session.userId || "none";
	next();
});

//메인 페이지
app.get("/", (req, res) => {
	res.render("index");
});

//페이지 불러오기
// views 폴더 내 .ejs 파일 이름들을 자동으로 읽어서 allowedPages에 저장
const fs = require("fs");

// views 폴더 내 .ejs 파일 이름들을 자동으로 읽어서 allowedPages에 저장
const viewsDir = path.join(__dirname, "views");
const allowedPages = fs
	.readdirSync(viewsDir)
	.filter((file) => path.extname(file) === ".ejs")
	.map((file) => path.basename(file, ".ejs")); // 확장자 제거

app.get("/:page", (req, res) => {
	const pageName = req.params.page;
	if (allowedPages.includes(pageName)) {
		res.render(pageName);
	} else {
		res.status(404).render("404");
	}
});

// 서버를 시작하고 설정된 포트에서 요청을 수신합니다.
app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});
