import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

// APIs

app.get("/api/v1", (req, res) => {
  res.send("<h1>Hello, My Name is Suzi and I am a Voice Agent.</h1>");
});

app.post("/api/v1/check-availablity", (req, res) => {
  console.log(req.body, "This is Body");
  res.send("Yooooooo");
});

app.listen(PORT, () => {
  console.log(`Server is running on PORT: ${PORT}`);
});
