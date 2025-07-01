// 모듈 불러오기
const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
require("dotenv").config();
const connectDB = require("./db");

// 앱 생성
const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어 설정
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 세션 설정
app.use(
	session({
		secret: "your_secret_key",
		resave: false,
		saveUninitialized: true,
		cookie: { secure: false }, // HTTPS 배포 시 true
	})
);

// EJS 설정
app.set("view engine", "ejs");

// 정적 파일 설정
app.use("/public", express.static("public"));

// 세션 사용자 ID를 전역으로 전달
app.use((req, res, next) => {
	res.locals.sessionId = req.session.userId || "none";
	next();
});

// 메인 페이지
app.get("/", (req, res) => {
	res.render("index");
});

// 회원가입 페이지 렌더링
app.get("/register", (req, res) => {
	res.render("register", { error: null, name: "", studentId: "" });
});

// 회원가입 처리
app.post("/register", async (req, res) => {
	const { name, studentId } = req.body;

	if (!name || !studentId) {
		return res.render("register", {
			error: "이름과 학번을 모두 입력해주세요.",
			name,
			studentId,
		});
	}

	try {
		const db = await connectDB();
		const existing = await db.collection("users").findOne({ studentId });

		if (existing) {
			return res.render("register", {
				error: "이미 등록된 학번입니다.",
				name: "",
				studentId: "",
			});
		}

		await db.collection("users").insertOne({
			name,
			studentId,
			createdAt: new Date(),
		});

		res.redirect("/login");
	} catch (err) {
		console.error("회원가입 오류:", err);
		res.status(500).send("서버 오류");
	}
});

// 로그인 페이지
app.get("/login", (req, res) => {
	res.render("login", { error: null, name: "", studentId: "" });
});

// 로그인 처리
app.post("/login", async (req, res) => {
	const { name, studentId } = req.body;

	if (!name || !studentId) {
		return res.render("login", {
			error: "이름과 학번을 모두 입력해주세요.",
			name,
			studentId,
		});
	}

	try {
		const db = await connectDB();
		const user = await db.collection("users").findOne({ studentId });

		if (!user) {
			return res.render("login", {
				error: "등록되지 않은 학번입니다.",
				name: "",
				studentId: "",
			});
		}

		if (user.name !== name) {
			return res.render("login", {
				error: "이름이 일치하지 않습니다.",
				name: "",
				studentId: "",
			});
		}

		req.session.userId = user._id.toString();
		res.redirect("/index");
	} catch (err) {
		console.error("로그인 오류:", err);
		res.status(500).send("서버 오류");
	}
});

// 로그아웃
app.get("/logout", (req, res) => {
	req.session.destroy(() => {
		res.redirect("/login");
	});
});

// 로그인 후 대시보드 페이지 (index.ejs)
app.get("/index", (req, res) => {
	if (!req.session.userId) {
		return res.redirect("/login");
	}
	res.render("index");
});

// views 폴더 내 .ejs 파일 이름들을 자동으로 읽어서 allowedPages에 저장
const viewsDir = path.join(__dirname, "views");
const allowedPages = fs
	.readdirSync(viewsDir)
	.filter((file) => path.extname(file) === ".ejs")
	.map((file) => path.basename(file, ".ejs"));

// 동적 페이지 라우팅 (404 처리용)
app.get("/:page", (req, res) => {
	const pageName = req.params.page;
	if (allowedPages.includes(pageName)) {
		res.render(pageName);
	} else {
		res.status(404).render("404");
	}
});

// 서버 실행
app.listen(PORT, () => {
	console.log(`✅ Server running: http://localhost:${PORT}`);
});
