const express = require("express");
const app = express();
const port = 3000;

app.set("view engine", "ejs");

app.set("views", __dirname + "/views");

app.get("/", (req, res) => {
	res.render("index");
});

// 4. 서버 시작
app.listen(port, () => {
	console.log(`Server running at http://localhost:${port}`);
});
