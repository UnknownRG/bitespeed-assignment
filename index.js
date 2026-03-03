const express = require("express");
require("dotenv").config();
const identifyRoute = require("./identify");

const app = express();
app.use(express.json());

app.use("/identify", identifyRoute);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});