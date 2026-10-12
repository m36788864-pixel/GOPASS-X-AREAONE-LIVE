const bcrypt = require("bcryptjs");
const pass = "DELEF#GOPASS2026!";
console.log(bcrypt.hashSync(pass, 10))