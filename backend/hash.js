const bcrypt = require("bcryptjs");

(async () => {
  const password = "123456"; // غيرها
  const hash = await bcrypt.hash(password, 10);
  console.log("Password:", password);
  console.log("Hash:", hash);
})();
