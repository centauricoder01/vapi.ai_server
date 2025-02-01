import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

// APIs

app.get("/api/v1", (req, res) => {
  res.send("<h1>Hello, This is Suzi.</h1>");
});

app.listen(PORT, () => {
  console.log(`Server is running on PORT: ${PORT}`);
});
