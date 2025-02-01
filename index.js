import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

// APIs

app.get("/api/v1", (req, res) => {
  res.send("<h1>Hello, This is Suzi.</h1>");
});

app.get("/api/v1/hello", (req, res) => {
  res.send("<h1>This is After the Domain and SSL Attchment.</h1>");
});

app.get("/api/v1/pm2", (req, res) => {
  res.send("<h1>This is After PM2 has been added.</h1>");
});

app.listen(PORT, () => {
  console.log(`Server is running on PORT: ${PORT}`);
});
